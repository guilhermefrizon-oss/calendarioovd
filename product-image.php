<?php
/**
 * Proxy interno e restrito para a foto oficial de um produto Vonder.
 * Aceita somente dígitos e consulta um único host/caminho conhecido,
 * evitando expor os códigos do catálogo a serviços públicos de terceiros.
 */
header('X-Content-Type-Options: nosniff');

$code = isset($_GET['code']) ? preg_replace('/\D+/', '', (string)$_GET['code']) : '';
if($code === '' || strlen($code) < 5 || strlen($code) > 20){
    http_response_code(400);
    header('Cache-Control: no-store');
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Código de produto inválido.';
    exit;
}

// largura opcional para gerar uma versão redimensionada: miniaturas de pré-visualização pedem
// algo em torno de 160px, e o recorte usado na arte pede até ~1600px (bem menos que a foto
// original, que pode vir com 4000px+ do fornecedor, sem perda perceptível no resultado final)
$width = isset($_GET['w']) ? (int)$_GET['w'] : 0;
if($width > 0) $width = max(32, min(2000, $width));

$url = 'https://app.ovd.com.br/fotos/produto?codigo=' . rawurlencode($code);
$maxBytes = 25 * 1024 * 1024;
$tmp = tmpfile();
$status = 0;
$tooLarge = false;

if($tmp === false){
    http_response_code(500);
    header('Cache-Control: no-store');
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Não foi possível preparar a imagem.';
    exit;
}

if(function_exists('curl_init')){
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_USERAGENT => 'Vonder-Internal-Post-Editor/1.0',
        CURLOPT_HTTPHEADER => ['Accept: image/jpeg,image/png,image/webp,image/*;q=0.8'],
        CURLOPT_WRITEFUNCTION => function($ch, $chunk) use ($tmp, $maxBytes, &$tooLarge){
            $current = ftell($tmp);
            if($current === false || $current + strlen($chunk) > $maxBytes){
                $tooLarge = true;
                return 0;
            }
            $written = fwrite($tmp, $chunk);
            return $written === false ? 0 : $written;
        }
    ]);
    curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
}else{
    $context = stream_context_create(['http' => [
        'timeout' => 30,
        'ignore_errors' => true,
        'header' => "User-Agent: Vonder-Internal-Post-Editor/1.0\r\nAccept: image/jpeg,image/png,image/webp,image/*;q=0.8\r\n"
    ]]);
    $remote = @fopen($url, 'rb', false, $context);
    if($remote !== false){
        $copied = stream_copy_to_stream($remote, $tmp, $maxBytes + 1);
        fclose($remote);
        $tooLarge = $copied === false || $copied > $maxBytes;
        $status = 200;
        if(isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $match)){
            $status = (int)$match[1];
        }
    }
}

$stats = fstat($tmp);
$size = is_array($stats) && isset($stats['size']) ? (int)$stats['size'] : 0;
rewind($tmp);
$head = fread($tmp, 12);
$mime = '';
if(is_string($head)){
    if(strlen($head) >= 3 && substr($head, 0, 3) === "\xFF\xD8\xFF"){
        $mime = 'image/jpeg';
    }elseif(strlen($head) >= 8 && substr($head, 0, 8) === "\x89PNG\x0D\x0A\x1A\x0A"){
        $mime = 'image/png';
    }elseif(strlen($head) >= 12 && substr($head, 0, 4) === 'RIFF' && substr($head, 8, 4) === 'WEBP'){
        $mime = 'image/webp';
    }
}

if($status < 200 || $status >= 300 || $tooLarge || $size === 0 || $mime === ''){
    fclose($tmp);
    http_response_code(404);
    header('Cache-Control: no-store');
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Imagem do produto não encontrada.';
    exit;
}

rewind($tmp);

$thumbData = null;
if($width > 0 && extension_loaded('gd')){
    $raw = stream_get_contents($tmp);
    $src = @imagecreatefromstring($raw);
    if($src !== false){
        $srcW = imagesx($src);
        $srcH = imagesy($src);
        $longSide = max($srcW, $srcH);
        if($longSide > $width){
            $scale = $width / $longSide;
            $dstW = max(1, (int)round($srcW * $scale));
            $dstH = max(1, (int)round($srcH * $scale));
            $dst = imagecreatetruecolor($dstW, $dstH);
            if($mime === 'image/png'){
                imagealphablending($dst, false);
                imagesavealpha($dst, true);
                imagefilledrectangle($dst, 0, 0, $dstW, $dstH, imagecolorallocatealpha($dst, 0, 0, 0, 127));
            }
            imagecopyresampled($dst, $src, 0, 0, 0, 0, $dstW, $dstH, $srcW, $srcH);
            ob_start();
            if($mime === 'image/png') imagepng($dst, null, 6);
            elseif($mime === 'image/webp' && function_exists('imagewebp')) imagewebp($dst, null, 80);
            else imagejpeg($dst, null, 82);
            $thumbData = ob_get_clean();
            imagedestroy($dst);
        }
        imagedestroy($src);
    }
}

header('Cache-Control: public, max-age=604800');
header('Content-Type: ' . $mime);
if($thumbData !== null){
    header('Content-Length: ' . strlen($thumbData));
    echo $thumbData;
    fclose($tmp);
}else{
    header('Content-Length: ' . $size);
    rewind($tmp);
    fpassthru($tmp);
    fclose($tmp);
}