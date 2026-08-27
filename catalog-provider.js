// ============================================================
// CATALOGPROVIDER — camada única de acesso ao catálogo de produtos.
//
// Hoje a única origem é um arquivo JSON estático por marca, em data/catalog-{slug}.json
// (caminho relativo à página — não pode ser absoluto tipo "/data/...", porque o site pode
// estar publicado numa subpasta, como é o caso do GitHub Pages). Quem consome (hoje só o
// Post Editor, ver post-editor.js) sempre chama CatalogProvider.load(slug) e recebe uma
// Promise — nunca lê o arquivo JSON nem o cache diretamente. Isso é o que permite trocar a
// origem no futuro (uma API própria, um catálogo gerado por scraping agendado, etc.) mexendo
// só na função load() abaixo, sem tocar em nenhum consumidor.
//
// Convenção de marcas futuras: catalog-vonder.json (a única que existe hoje),
// catalog-fg.json, catalog-toolmix.json, catalog-dismatal.json — cada uma some/aparece só
// criando/removendo o arquivo; nenhum código muda. Uma marca sem arquivo próprio ainda
// resolve normalmente para uma lista vazia (mesmo comportamento de "catálogo sem produtos"
// que o Post Editor já tratava antes).
//
// Ferramentas Gerais e Dismatal revendem os mesmos produtos VONDER; por ora catalog-fg.json
// é uma cópia do catálogo completo da VONDER (a duplicação é no próprio arquivo, não aqui,
// porque logo esses dados vêm de uma consulta própria à planilha e o arquivo passa a ter
// conteúdo exclusivo da marca).
// ============================================================
(function(global){
  'use strict';

  const CACHE_PREFIX = 'catalog_cache_v1__';
  const FETCH_TIMEOUT_MS = 8000;

  function cacheKey(slug){ return CACHE_PREFIX + slug; }

  function readCache(slug){
    try{
      const raw = localStorage.getItem(cacheKey(slug));
      if(!raw) return null;
      const parsed = JSON.parse(raw);
      if(!parsed || !Array.isArray(parsed.items)) return null;
      return parsed;
    }catch(e){ return null; }
  }

  function writeCache(slug, items){
    try{
      localStorage.setItem(cacheKey(slug), JSON.stringify({ items, fetchedAt: Date.now() }));
    }catch(e){
      // catálogo grande demais pro localStorage (ou modo privado sem storage disponível) —
      // não é fatal, só significa que não vai ter cópia offline desta vez
    }
  }

  // aceita qualquer campo extra como veio do JSON (ex: background, preferredLayout) — só
  // garante o mínimo (um nome) pra entrada ser exibível; formato completo aceito, ver README
  // do schema no objetivo #2 do pedido que originou este arquivo: name, title, subtitle,
  // code, codes/variants, sourceUrl, imageUrl, category
  function normalizeItem(raw){
    if(!raw || typeof raw !== 'object') return null;
    const name = String(raw.name || raw.title || '').trim();
    if(!name) return null;
    return Object.assign({}, raw, { name: raw.name || name });
  }

  function normalizeList(raw){
    if(!Array.isArray(raw)) return [];
    return raw.map(normalizeItem).filter(Boolean);
  }

  function fetchWithTimeout(url){
    if(typeof AbortController === 'undefined') return fetch(url);
    const controller = new AbortController();
    const timer = setTimeout(()=> controller.abort(), FETCH_TIMEOUT_MS);
    return fetch(url, { signal: controller.signal }).finally(()=> clearTimeout(timer));
  }

  function fetchFromNetwork(slug){
    const url = 'data/catalog-' + encodeURIComponent(slug) + '.json';
    return fetchWithTimeout(url).then(res=>{
      if(!res.ok) throw new Error('catalog fetch ' + res.status);
      return res.json();
    }).then(raw=>{
      const items = normalizeList(raw);
      writeCache(slug, items);
      return { items, source: 'network', fetchedAt: Date.now() };
    });
  }

  // resolve sempre — nunca rejeita: rede indisponível ou arquivo ainda inexistente cai pro
  // cache local (se houver) e, na ausência de cache também, pra lista vazia. Quem chama não
  // precisa de try/catch; o campo `source` diz de onde veio ('network' | 'cache' | 'none')
  function load(slug){
    return fetchFromNetwork(slug).catch(()=>{
      const cached = readCache(slug);
      if(cached) return { items: cached.items, source: 'cache', fetchedAt: cached.fetchedAt };
      return { items: [], source: 'none', fetchedAt: null };
    });
  }

  global.CatalogProvider = { load };
})(window);
