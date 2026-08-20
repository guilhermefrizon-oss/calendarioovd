<?php
/**
 * API de persistência do Calendário de Postagens.
 *
 * Guarda o estado inteiro do app (postagens e configurações) num banco SQLite
 * local (data.sqlite, criado automaticamente na primeira chamada), em vez de só
 * no localStorage do navegador — assim o planejamento sobrevive a uma limpeza de
 * cache ou troca de navegador/computador, e a equipe inteira compartilha o mesmo
 * calendário.
 *
 * Uso (chamado por app.js/intelligence-center.js via fetch, sempre com caminho relativo "api.php"):
 *   GET  api.php?k=posts       -> { v: [...] | null, updated_at: <int> }
 *   GET  api.php?k=settings    -> { v: {...} | null, updated_at: <int> }
 *   GET  api.php?k=intel       -> { v: {...} | null, updated_at: <int> }
 *   GET  api.php?k=brands      -> { v: [...] | null, updated_at: <int> }
 *   POST api.php?k=posts       body: { v: [...], expected_updated_at: <int> }
 *   POST api.php?k=settings    body: { v: {...}, expected_updated_at: <int> }
 *   POST api.php?k=intel       body: { v: {...}, expected_updated_at: <int> }
 *   POST api.php?k=brands      body: { v: [...], expected_updated_at: <int> }
 *
 * "intel" guarda o aprendizado da Central de Inteligência (referências enviadas + DNA
 * gerado por editoria).
 *
 * "posts"/"settings"/"intel" também aceitam um sufixo "__{brandId}" (ex:
 * k=posts__b1a2b3) — é assim que o portal isola os dados de cada perfil de
 * marca: a marca padrão usa as chaves sem sufixo (dados que já existiam antes
 * do portal), marcas novas ganham seu próprio conjunto de linhas na tabela.
 * "brands" (sem sufixo) guarda a lista de perfis de marca em si.
 *
 * O POST usa concorrência otimista: expected_updated_at precisa bater com o
 * updated_at atual no banco. Se outra pessoa salvou por cima nesse meio tempo,
 * a resposta é 409 (com a versão atual do servidor), em vez de aceitar e
 * sobrescrever silenciosamente o trabalho dela.
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$key = isset($_GET['k']) ? $_GET['k'] : '';
$isValidKey = ($key === 'brands') || preg_match('/^(posts|settings|intel)(__[a-z0-9-]{1,40})?$/', $key);
if(!$isValidKey){
    http_response_code(400);
    echo json_encode(['error' => 'chave inválida (use k=posts, k=settings, k=intel, k=brands, ou uma dessas com sufixo __{brandId})']);
    exit;
}

try {
    $pdo = new PDO('sqlite:' . __DIR__ . '/data.sqlite');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec('CREATE TABLE IF NOT EXISTS store (
        k TEXT PRIMARY KEY,
        v TEXT NOT NULL,
        updated_at INTEGER NOT NULL
    )');
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'não foi possível abrir o banco de dados (verifique se a extensão pdo_sqlite está habilitada no PHP e se a pasta tem permissão de escrita)']);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $stmt = $pdo->prepare('SELECT v, updated_at FROM store WHERE k = ?');
    $stmt->execute([$key]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        echo json_encode(['v' => null, 'updated_at' => 0]);
    } else {
        echo json_encode(['v' => json_decode($row['v']), 'updated_at' => (int)$row['updated_at']]);
    }
    exit;
}

if ($method === 'POST') {
    $body = json_decode(file_get_contents('php://input'), true);
    if (!is_array($body) || !array_key_exists('v', $body)) {
        http_response_code(400);
        echo json_encode(['error' => 'corpo inválido (esperado { v, expected_updated_at })']);
        exit;
    }
    $expected = isset($body['expected_updated_at']) ? (int)$body['expected_updated_at'] : 0;

    $pdo->beginTransaction();
    $stmt = $pdo->prepare('SELECT v, updated_at FROM store WHERE k = ?');
    $stmt->execute([$key]);
    $current = $stmt->fetch(PDO::FETCH_ASSOC);
    $currentUpdatedAt = $current ? (int)$current['updated_at'] : 0;

    if ($currentUpdatedAt !== $expected) {
        // conflito: alguém salvou uma versão mais nova enquanto este cliente editava
        $pdo->rollBack();
        http_response_code(409);
        echo json_encode([
            'error' => 'conflito: já existe uma versão mais nova salva por outra pessoa',
            'v' => $current ? json_decode($current['v']) : null,
            'updated_at' => $currentUpdatedAt,
        ]);
        exit;
    }

    $newUpdatedAt = (int)round(microtime(true) * 1000);
    $json = json_encode($body['v'], JSON_UNESCAPED_UNICODE);
    $upsert = $pdo->prepare('INSERT OR REPLACE INTO store (k, v, updated_at) VALUES (?, ?, ?)');
    $upsert->execute([$key, $json, $newUpdatedAt]);
    $pdo->commit();

    echo json_encode(['ok' => true, 'updated_at' => $newUpdatedAt]);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'método não suportado']);
