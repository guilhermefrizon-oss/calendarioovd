<?php
/**
 * Endpoint fino de "análise visual do DNA da editoria" — primeiro consumidor da camada
 * compartilhada gemini-client.php. Só cuida do contrato específico desta tela: recebe as
 * peças de referência (imagens + briefings/legendas/orientações + o resumo heurístico já
 * calculado no navegador), monta o prompt/schema deste recurso, chama o Gemini e reempacota
 * a resposta no formato que intelligence-center.js espera.
 *
 * POST body: { editoria, images:[{dataUrl, network, formatName}], briefings:[...],
 *              captions:[...], instructions, heuristicSummary:{...} }
 * Resposta 200: { ok:true, model, imageCount, template:{...} }
 * Erro: { error: "..." } com status 400/405/500/502.
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'método não suportado']);
    exit;
}

$raw = file_get_contents('php://input');
if (strlen($raw) > 8 * 1024 * 1024) {
    http_response_code(400);
    echo json_encode(['error' => 'payload muito grande (máx. 8MB) — reduza o número de imagens']);
    exit;
}

$body = json_decode($raw, true);
if (!is_array($body) || !isset($body['images']) || !is_array($body['images']) || !count($body['images'])) {
    http_response_code(400);
    echo json_encode(['error' => 'corpo inválido (esperado ao menos uma imagem em "images")']);
    exit;
}

define('GEMINI_ENTRY', true);
require_once __DIR__ . '/gemini-client.php';

$editoria = isset($body['editoria']) ? (string)$body['editoria'] : '';
$images = $body['images'];
$briefings = array_values(array_filter(array_map('strval', $body['briefings'] ?? [])));
$captions = array_values(array_filter(array_map('strval', $body['captions'] ?? [])));
$instructions = isset($body['instructions']) ? (string)$body['instructions'] : '';
$heuristicSummary = isset($body['heuristicSummary']) && is_array($body['heuristicSummary']) ? $body['heuristicSummary'] : [];

$MAX_VISION_IMAGES = 6;

$responseSchema = [
    'type' => 'OBJECT',
    'properties' => [
        'hierarchy' => [
            'type' => 'ARRAY',
            'items' => [
                'type' => 'OBJECT',
                'properties' => [
                    'level' => ['type' => 'INTEGER'],
                    'element' => ['type' => 'STRING'],
                    'description' => ['type' => 'STRING'],
                ],
                'required' => ['level', 'element', 'description'],
            ],
        ],
        'fixedElements' => ['type' => 'ARRAY', 'items' => ['type' => 'STRING']],
        'variableElements' => ['type' => 'ARRAY', 'items' => ['type' => 'STRING']],
        'colorPalette' => ['type' => 'STRING'],
        'typography' => ['type' => 'STRING'],
        'composition' => ['type' => 'STRING'],
        'scenarioProductRule' => ['type' => 'STRING'],
        'baseInstruction' => ['type' => 'STRING'],
    ],
    'required' => [
        'hierarchy', 'fixedElements', 'variableElements', 'colorPalette',
        'typography', 'composition', 'scenarioProductRule', 'baseInstruction',
    ],
];

function build_vision_prompt($editoria, $imageCount, $briefings, $captions, $instructions, $heuristicSummary) {
    $n = $imageCount;
    $compareLine = $n > 1
        ? 'Compare TODAS as imagens entre si para identificar o que realmente se repete de forma consistente entre elas (fixo) e o que muda de peça para peça (variável) — só classifique algo como fixo se aparecer em praticamente todas as imagens, não em apenas duas delas por coincidência.'
        : 'Descreva a estrutura visual desta peça (com só uma imagem enviada, trate como uma amostra inicial: liste como "variável" qualquer elemento que provavelmente mudaria em peças futuras, como nome/especificação de produto).';

    $context = [];
    if ($briefings) $context[] = 'Briefings: ' . implode(' | ', $briefings);
    if ($captions) $context[] = 'Legendas publicadas: ' . implode(' | ', $captions);
    if ($instructions) $context[] = 'Orientações do usuário: ' . $instructions;
    if ($heuristicSummary) $context[] = 'Resumo heurístico já calculado automaticamente: ' . json_encode($heuristicSummary, JSON_UNESCAPED_UNICODE);
    $contextText = $context ? ("\n\nContexto adicional (para entender a intenção, não para substituir o que você vê nas imagens): " . implode('; ', $context)) : '';

    return "Você está analisando {$n} imagem(ns) de referência de peças de criativo já aprovadas para a editoria \"{$editoria}\" de uma marca. {$compareLine}\n\n" .
        "Descreva: (1) a hierarquia visual, do elemento mais proeminente ao menos proeminente; (2) os elementos fixos entre as peças; (3) os elementos variáveis; (4) a paleta de cores predominante; (5) o estilo de tipografia/lettering, se houver texto ou logotipo visível; (6) a composição/layout geral; (7) a regra de como o produto se relaciona com o cenário/fundo (ex.: produto isolado em fundo neutro × produto em uso real × produto com elementos lifestyle).\n\n" .
        "Nunca invente ou sugira redesenhar o produto em si — descreva só o que está visualmente presente nas imagens fornecidas.{$contextText}\n\n" .
        "Ao final, escreva um parágrafo \"baseInstruction\": uma instrução pronta para uso, em português, como um briefing de criação, que um designer (humano ou IA generativa) possa seguir para produzir uma nova peça alinhada a este padrão visual.";
}

try {
    $parts = [build_vision_prompt($editoria, count($images), $briefings, $captions, $instructions, $heuristicSummary)];
    foreach ($images as $img) {
        if (!is_array($img) || !isset($img['dataUrl'])) continue;
        $parts[] = ['dataUrl' => $img['dataUrl']];
    }

    $raw = gemini_generate_structured($parts, $responseSchema, $MAX_VISION_IMAGES);

    // reempacota defensivamente pro shape exato esperado pelo front — nunca repassa o array
    // cru do Gemini direto, mesmo que ele já bata com o schema pedido
    $template = [
        'hierarchy' => array_map(function ($h) {
            return [
                'level' => isset($h['level']) ? (int)$h['level'] : 0,
                'element' => isset($h['element']) ? (string)$h['element'] : '',
                'description' => isset($h['description']) ? (string)$h['description'] : '',
            ];
        }, is_array($raw['hierarchy'] ?? null) ? $raw['hierarchy'] : []),
        'fixedElements' => array_values(array_filter(array_map('strval', is_array($raw['fixedElements'] ?? null) ? $raw['fixedElements'] : []))),
        'variableElements' => array_values(array_filter(array_map('strval', is_array($raw['variableElements'] ?? null) ? $raw['variableElements'] : []))),
        'colorPalette' => isset($raw['colorPalette']) ? (string)$raw['colorPalette'] : '',
        'typography' => isset($raw['typography']) ? (string)$raw['typography'] : '',
        'composition' => isset($raw['composition']) ? (string)$raw['composition'] : '',
        'scenarioProductRule' => isset($raw['scenarioProductRule']) ? (string)$raw['scenarioProductRule'] : '',
        'baseInstruction' => isset($raw['baseInstruction']) ? (string)$raw['baseInstruction'] : '',
    ];

    http_response_code(200);
    echo json_encode(['ok' => true, 'model' => GEMINI_MODEL, 'imageCount' => count($images), 'template' => $template], JSON_UNESCAPED_UNICODE);
} catch (GeminiClientException $e) {
    http_response_code(502);
    echo json_encode(['error' => $e->getMessage()]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'erro inesperado ao processar a análise visual']);
}
