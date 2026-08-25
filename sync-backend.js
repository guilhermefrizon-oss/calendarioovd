// ============================================================
// SYNC BACKEND — camada única de sincronização entre navegadores/computadores.
//
// Usada por app.js (posts/settings), intelligence-data.js (intel) e portal-shell.js
// (brands) através de duas funções só: SyncBackend.get(key) e SyncBackend.put(key,
// value, expectedVersion). Nenhum desses arquivos sabe (nem precisa saber) que o
// armazenamento é o Firebase Realtime Database — assim, pra trocar de backend (ex:
// voltar para um servidor próprio com api.php, quando ele estiver disponível
// publicamente), basta reescrever as duas funções abaixo. O resto do app não muda.
//
// Por que Firebase: o site está publicado no GitHub Pages, que só serve arquivos
// estáticos (não executa PHP), então api.php não funciona lá. O Firebase Realtime
// Database é gratuito, não precisa de servidor próprio e é acessível direto do
// navegador via fetch — funciona igual em qualquer computador que abra o link.
//
// Formato salvo em cada chave do banco: { v: <valor>, updated_at: <timestamp em ms> }
// "updated_at" funciona como número de versão: cada PUT só é aceito pelo app (client-
// side) se o "expectedVersion" enviado bater com o que está salvo agora — assim, se
// duas pessoas editarem quase ao mesmo tempo, quem salvar por último não sobrescreve
// silenciosamente o trabalho da outra (mesmo comportamento que api.php já tinha).
// Como o REST do Firebase não tem transação atômica simples, a checagem é feita lendo
// o valor atual logo antes de escrever: numa colisão de milissegundos entre duas
// pessoas isso pode deixar passar uma sobrescrita, mas para o volume de uma equipe
// pequena isso não é um problema prático.
// ============================================================
(function(global){
  'use strict';

  // databaseURL do projeto Firebase (Realtime Database). Não é uma credencial secreta —
  // a segurança de quem pode ler/escrever é definida nas Regras do banco, no console do
  // Firebase (Realtime Database > Regras). TROCAR pelo databaseURL do projeto real antes
  // de publicar.
  var FIREBASE_DB_URL = 'https://mkt-ovd-default-rtdb.firebaseio.com';

  function pathFor(key){
    return FIREBASE_DB_URL + '/store/' + encodeURIComponent(key) + '.json';
  }

  async function get(key){
    const res = await fetch(pathFor(key) + '?ts=' + Date.now(), { cache:'no-store' });
    if(!res.ok) throw new Error('sync get ' + res.status);
    const data = await res.json();
    if(!data || typeof data.updated_at !== 'number'){
      return { v: null, updated_at: 0 };
    }
    return { v: data.v === undefined ? null : data.v, updated_at: data.updated_at };
  }

  async function put(key, value, expectedVersion){
    const current = await get(key);
    if(current.updated_at !== (expectedVersion || 0)){
      // conflito: alguém salvou uma versão mais nova enquanto este cliente editava
      return { conflict: true, server: current };
    }
    const updated_at = Date.now();
    const res = await fetch(pathFor(key), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ v: value, updated_at: updated_at })
    });
    if(!res.ok) throw new Error('sync put ' + res.status);
    return { conflict: false, updated_at: updated_at };
  }

  global.SyncBackend = { get: get, put: put };
})(window);
