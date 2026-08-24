<?php
/**
 * Proxy interno e restrito para a foto oficial de um produto Vonder.
 * Aceita somente dígitos e consulta um único host/caminho conhecido,
 * evitando expor os códigos do catálogo a serviços públicos de terceiros.
 */
header('X-Content-Type-Options: nosniff');
header('Cache-Control: public, max-age=86400');

$code = isset($_GET['code']) ? preg_replace('/\D+/', '', (string)$_GET['code']) : '';
if($code === '' || strlen($code) < 5 || strlen($code) > 20){
    http_response_code(400);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Código de produto inválido.';
    exit;
}

$url = 'https://www.vonder.com.br/estatico/vonder/temp/320_' . $code . '.jpg';
$body = false;
$status = 0;

if(function_exists('curl_init')){
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 12,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_USERAGENT => 'Vonder-Internal-Post-Editor/1.0',
        CURLOPT_HTTPHEADER => ['Accept: image/jpeg,image/*;q=0.8']
    ]);
    $body = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
}else{
    $context = stream_context_create(['http' => [
        'timeout' => 12,
        'ignore_errors' => true,
        'header' => "User-Agent: Vonder-Internal-Post-Editor/1.0\r\nAccept: image/jpeg,image/*;q=0.8\r\n"
    ]]);
    $body = @file_get_contents($url, false, $context);
    $status = $body !== false ? 200 : 0;
}

$isJpeg = is_string($body) && strlen($body) > 2 && substr($body, 0, 2) === "\xFF\xD8";
if($status < 200 || $status >= 300 || !$isJpeg || strlen($body) > 5 * 1024 * 1024){
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Imagem do produto não encontrada.';
    exit;
}

header('Content-Type: image/jpeg');
header('Content-Length: ' . strlen($body));
echo $body;