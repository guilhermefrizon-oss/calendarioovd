<?php
/**
 * Segredo compartilhado da integração com o Google Gemini.
 *
 * Usado por qualquer funcionalidade da plataforma que precise de IA com visão (não é
 * específico do "DNA da editoria" — veja gemini-client.php para a camada reutilizável).
 *
 * Gere sua chave gratuita em https://aistudio.google.com/apikey e cole abaixo.
 */

if (!defined('GEMINI_ENTRY')) {
    http_response_code(404);
    exit;
}

define('GEMINI_API_KEY', 'AQ.Ab8RN6LrrVzNAeKCnsOlB8T9cXBEKNHko6OXoewg_X_yKkAQBQ');
define('GEMINI_MODEL', 'gemini-2.5-flash'); // confirme o nome atual do modelo em ai.google.dev caso pare de funcionar
