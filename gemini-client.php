<?php
/**
 * Camada compartilhada e reutilizável de chamada ao Google Gemini.
 *
 * Não sabe nada sobre "editoria", "DNA" ou qualquer conceito de domínio — recebe um prompt
 * (texto + opcionalmente imagens) e um schema de saída, devolve o objeto JSON já decodificado
 * que o modelo gerou. Qualquer funcionalidade futura da plataforma que precise de IA com visão
 * deve chamar gemini_generate_structured() a partir do seu próprio endpoint fino, em vez de
 * duplicar autenticação/HTTP/parsing.
 *
 * Uso, a partir de um endpoint fino:
 *   define('GEMINI_ENTRY', true);
 *   require_once __DIR__.'/gemini-client.php';
 *   $result = gemini_generate_structured([$prompt, ['dataUrl'=>$img1]], $schema);
 */

// GEMINI_ENTRY precisa já ter sido definida por quem incluiu este arquivo (ver uso acima) —
// não redefinimos aqui pra evitar o warning de "constant already defined" do PHP quando o
// endpoint fino (ex: intelligence-vision.php) já fez isso antes do require_once.
require_once __DIR__.'/gemini-config.php';

class GeminiClientException extends Exception {}

const GEMINI_ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const GEMINI_MAX_IMAGE_BYTES = 1.5 * 1024 * 1024; // ~1.5MB por imagem, já em base64

/**
 * Extrai mime + base64 puro do prefixo de um data URI (nunca confia num "mimeType" vindo de
 * fora — o cliente pode ter mantido o dataUrl original sem recomprimir em caso de erro de
 * downscale, então o prefixo do próprio dataUrl é a única fonte confiável).
 */
function gemini_parse_data_url($dataUrl) {
    if (!is_string($dataUrl) || !preg_match('/^data:([\w.+-]+\/[\w.+-]+);base64,(.+)$/s', $dataUrl, $m)) {
        throw new GeminiClientException('Uma das imagens enviadas não é um data URI válido.');
    }
    $mime = strtolower($m[1]);
    if (!in_array($mime, GEMINI_ALLOWED_IMAGE_MIMES, true)) {
        throw new GeminiClientException("Formato de imagem não suportado ({$mime}) — use JPEG, PNG ou WEBP.");
    }
    $base64 = $m[2];
    if (strlen($base64) > GEMINI_MAX_IMAGE_BYTES) {
        throw new GeminiClientException('Uma das imagens enviadas é grande demais para a análise por IA.');
    }
    return ['mime' => $mime, 'base64' => $base64];
}

/**
 * Monta o corpo da requisição Gemini a partir de $parts (mistura de strings = texto e
 * arrays ['dataUrl'=>...] = imagem) e chama a API, pedindo saída JSON estruturada conforme
 * $responseSchema. Lança GeminiClientException com mensagem amigável em qualquer falha
 * (chave não configurada, rede, quota, resposta em formato inesperado) — nunca deixa a chave
 * de API vazar numa mensagem de erro.
 *
 * Retorna o array PHP já decodificado (json_decode(..., true)) do JSON que o modelo gerou.
 */
function gemini_generate_structured(array $parts, array $responseSchema, $maxImages = 6) {
    if (GEMINI_API_KEY === '' || GEMINI_API_KEY === 'COLE_SUA_CHAVE_AQUI') {
        throw new GeminiClientException(
            'Chave da API Gemini não configurada — gere uma gratuita em https://aistudio.google.com/apikey ' .
            'e cole em gemini-config.php.'
        );
    }

    $requestParts = [];
    $imageCount = 0;
    foreach ($parts as $part) {
        if (is_string($part)) {
            if ($part !== '') $requestParts[] = ['text' => $part];
            continue;
        }
        if (is_array($part) && isset($part['dataUrl'])) {
            $imageCount++;
            if ($imageCount > $maxImages) {
                throw new GeminiClientException("No máximo {$maxImages} imagens por análise.");
            }
            $parsed = gemini_parse_data_url($part['dataUrl']);
            $requestParts[] = ['inline_data' => ['mime_type' => $parsed['mime'], 'data' => $parsed['base64']]];
            continue;
        }
        throw new GeminiClientException('Parte de requisição inválida enviada ao Gemini.');
    }
    if (!count($requestParts)) {
        throw new GeminiClientException('Nada para analisar — envie ao menos um texto ou imagem.');
    }

    $body = [
        'contents' => [['parts' => $requestParts]],
        'generationConfig' => [
            'responseMimeType' => 'application/json',
            'responseSchema' => $responseSchema,
        ],
    ];

    $url = 'https://generativelanguage.googleapis.com/v1beta/models/' . GEMINI_MODEL . ':generateContent?key=' . urlencode(GEMINI_API_KEY);
    $payload = json_encode($body, JSON_UNESCAPED_UNICODE);

    $rawResponse = gemini_http_post($url, $payload);

    $decoded = json_decode($rawResponse['body'], true);
    if ($rawResponse['status'] !== 200 || !is_array($decoded)) {
        $detail = is_string($rawResponse['body']) ? substr($rawResponse['body'], 0, 500) : '';
        throw new GeminiClientException("O Gemini retornou um erro (HTTP {$rawResponse['status']}): {$detail}");
    }

    $text = $decoded['candidates'][0]['content']['parts'][0]['text'] ?? null;
    if (!is_string($text)) {
        throw new GeminiClientException('A resposta do Gemini não trouxe o conteúdo esperado.');
    }

    $result = json_decode($text, true);
    if (!is_array($result)) {
        throw new GeminiClientException('A IA respondeu em um formato inesperado (não era JSON válido).');
    }

    return $result;
}

/**
 * POST via curl quando disponível, com fallback para file_get_contents + stream context
 * (ambiente sem a extensão curl habilitada). Sempre devolve ['status'=>int, 'body'=>string],
 * mesmo em erro de transporte (status 0), nunca deixando escapar warnings do PHP.
 */
function gemini_http_post($url, $jsonPayload) {
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_POSTFIELDS => $jsonPayload,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_TIMEOUT => 60,
        ]);
        $body = curl_exec($ch);
        if ($body === false) {
            $error = curl_error($ch);
            curl_close($ch);
            throw new GeminiClientException("Falha de rede ao chamar a API do Gemini: {$error}");
        }
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        return ['status' => (int)$status, 'body' => (string)$body];
    }

    $context = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => "Content-Type: application/json\r\n",
            'content' => $jsonPayload,
            'timeout' => 60,
            'ignore_errors' => true,
        ],
    ]);
    $body = @file_get_contents($url, false, $context);
    if ($body === false) {
        throw new GeminiClientException('Falha de rede ao chamar a API do Gemini (allow_url_fopen pode estar desabilitado neste servidor).');
    }
    $status = 0;
    if (isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $m)) {
        $status = (int)$m[1];
    }
    return ['status' => $status, 'body' => $body];
}
