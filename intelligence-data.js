// ============================================================
// CAMADA COMPARTILHADA DE DADOS E ANÁLISE DA CENTRAL DE INTELIGÊNCIA
// ============================================================
// Ponto único de leitura/escrita/análise do "aprendizado" por editoria (localStorage +
// api.php), usado tanto pela tela que o alimenta (intelligence-center.js) quanto pelo
// calendário, que só consulta o DNA já gerado para sugerir conteúdo e validar publicações
// (app.js) — mantém as duas telas lendo/gravando exatamente o mesmo formato de dados.
//
// O "motor de IA" aqui é uma análise heurística de verdade sobre o que foi enviado
// (frequência de palavras nas legendas, detecção de ganchos/CTAs por padrão de texto,
// proporção de tags marcadas nas artes, formato visual predominante...) — não depende de
// nenhum serviço externo, então funciona 100% offline, mas por isso também só enxerga o que
// for enviado/marcado como referência; não "olha" o conteúdo visual da imagem em si.
// ============================================================
(function(global){
  const BRAND_SUFFIX = (global.PortalBrand && global.PortalBrand.suffix) || '';
  const STORAGE_KEY = 'calendar_intel_v1' + BRAND_SUFFIX;
  const API_KEY = 'intel' + BRAND_SUFFIX;

  function emptyBucket(){
    return {
      references: { visuals: [], captions: [], briefings: [] },
      productsNotes: '',
      dna: null
    };
  }

  function normalizeBucket(b){
    const out = Object.assign(emptyBucket(), b || {});
    out.references = Object.assign({ visuals:[], captions:[], briefings:[] }, out.references || {});
    if(!Array.isArray(out.references.visuals)) out.references.visuals = [];
    if(!Array.isArray(out.references.captions)) out.references.captions = [];
    if(!Array.isArray(out.references.briefings)) out.references.briefings = [];
    if(typeof out.productsNotes !== 'string') out.productsNotes = '';
    return out;
  }

  function normalize(parsed){
    const data = { editorias: {} };
    const src = (parsed && parsed.editorias) || {};
    Object.keys(src).forEach(name=>{ data.editorias[name] = normalizeBucket(src[name]); });
    return data;
  }

  function readLocal(){
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return { editorias:{} };
    try{ return normalize(JSON.parse(raw)); }
    catch(e){ return { editorias:{} }; }
  }

  // arquivos de referência em base64 podem ser numerosos (uma editoria pode acumular
  // dezenas de artes) — por isso as imagens já chegam aqui reduzidas (ver
  // intelligence-center.js), mas mesmo assim a gravação local pode estourar a cota do
  // navegador; devolve false nesse caso em vez de deixar estourar
  function writeLocal(data){
    try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); return true; }
    catch(e){ return false; }
  }

  async function fetchServer(){
    const res = await fetch(`api.php?k=${API_KEY}`, { cache:'no-store' });
    if(!res.ok) throw new Error('intel fetch '+res.status);
    return res.json(); // { v, updated_at }
  }

  async function pushServer(value, expectedVersion){
    const res = await fetch(`api.php?k=${API_KEY}`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ v:value, expected_updated_at: expectedVersion })
    });
    const data = await res.json().catch(()=>({}));
    if(res.status===409) return { conflict:true, server:data };
    if(!res.ok) throw new Error('intel push '+res.status);
    return { conflict:false, updated_at:data.updated_at };
  }

  function getBucket(data, editoriaName){
    if(!data.editorias[editoriaName]) data.editorias[editoriaName] = emptyBucket();
    return data.editorias[editoriaName];
  }

  function referenceCount(bucket){
    return bucket.references.visuals.length + bucket.references.captions.length + bucket.references.briefings.length;
  }

  // 'sem-dados' (nada enviado) · 'nao-treinado' (tem referência mas nunca analisou) ·
  // 'desatualizado' (novas referências chegaram depois da última análise) ·
  // 'poucas-referencias' (analisado, mas com poucas referências — DNA ainda frágil) ·
  // 'treinado' (analisado e com volume razoável de referências)
  function learningStatus(bucket){
    const n = referenceCount(bucket);
    if(n===0) return 'sem-dados';
    if(!bucket.dna) return 'nao-treinado';
    if(n !== bucket.dna.referenceCount) return 'desatualizado';
    if(n < 3) return 'poucas-referencias';
    return 'treinado';
  }

  // ============================================================
  // NLP-lite (pt-BR) — tokenização simples e sem dependências, suficiente para frequência
  // de palavras e casamento de padrões; não tenta ser um tokenizador linguisticamente correto
  // ============================================================
  const STOPWORDS = new Set(['a','o','as','os','de','da','do','das','dos','em','um','uma','uns','umas','para','por','com','sem','que','e','ou','se','no','na','nos','nas','ao','aos','é','são','foi','ser','estar','como','mais','muito','tambem','ja','nao','sim','seu','sua','seus','suas','este','esta','esse','essa','isso','isto','aquele','aquela','pelo','pela','pelos','pelas','entre','ate','apos','sobre','quando','onde','porque','pois','mas','entao','vai','vem','tem','ter','fazer','faz','voce','vc','nosso','nossa','nossos','nossas','ele','ela','eles','elas','the','and','for','este','esta']);
  function stripAccents(s){ return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,''); }
  function normalizeStrLite(s){ return stripAccents(String(s||'')).toLowerCase(); }
  function tokenize(text){
    return normalizeStrLite(text).replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(Boolean);
  }
  function wordFrequency(texts){
    const freq = {};
    texts.forEach(t=> tokenize(t).forEach(w=>{
      if(w.length<3 || STOPWORDS.has(w) || /^\d+$/.test(w)) return;
      freq[w] = (freq[w]||0)+1;
    }));
    return freq;
  }
  function topWords(texts, n){
    const freq = wordFrequency(texts);
    return Object.entries(freq).sort((a,b)=> b[1]-a[1]).slice(0, n).map(([word,count])=>({ word, count }));
  }

  const CTA_PATTERNS = [
    { re:/saiba mais/i, label:'"Saiba mais"' },
    { re:/link (na|no) (bio|perfil)/i, label:'"Link na bio"' },
    { re:/arraste|deslize/i, label:'"Arraste/deslize"' },
    { re:/coment[ae]|deixe (seu|nos) coment/i, label:'"Comente"' },
    { re:/compartilh/i, label:'"Compartilhe"' },
    { re:/marque (um amigo|alguem)/i, label:'"Marque um amigo"' },
    { re:/clique|toque (aqui|no link)/i, label:'"Clique/toque"' },
    { re:/garanta (o seu|ja)|aproveite|corra/i, label:'"Garanta/aproveite"' },
    { re:/chama(da)? no direct|manda(e)? mensagem|fale com a gente|entre em contato/i, label:'"Chama no direct"' },
    { re:/salve (esse|este) post|salva (esse|este) post/i, label:'"Salve este post"' },
    { re:/compre agora|adquira/i, label:'"Compre agora"' }
  ];
  function detectCtas(texts){
    const counts = {};
    texts.forEach(t=> CTA_PATTERNS.forEach(p=>{ if(p.re.test(t)) counts[p.label] = (counts[p.label]||0)+1; }));
    return Object.entries(counts).sort((a,b)=> b[1]-a[1]).map(([label,count])=>({ label, count }));
  }

  // classifica a abertura (1ª linha) de cada legenda num "tipo de gancho" — heurística por
  // padrão de texto, não entende o conteúdo de fato, só a forma como a frase é construída
  const HOOK_TESTS = [
    { test:first=> /\?\s*$/.test(first.trim()), label:'Pergunta' },
    { test:first=> /^(voce sabia|sabia que)/i.test(stripAccents(first).trim()), label:'"Você sabia?"' },
    { test:first=> /^(descubra|conheca|confira|veja|entenda)/i.test(stripAccents(first).trim()), label:'Convite/imperativo' },
    { test:first=> /\d+\s?%|\d+\s?(em cada|de cada)/i.test(first), label:'Dado/estatística' },
    { test:first=> /(cansad[oa] de|dificuldade|desafio de|problema (com|de|na|no))/i.test(stripAccents(first)), label:'Dor/problema' },
    { test:first=> /^(chegou|novidade|lancamento|apresentamos)/i.test(stripAccents(first).trim()), label:'Anúncio' }
  ];
  function hookLabelFor(text){
    const first = String(text||'').split('\n')[0] || '';
    const match = HOOK_TESTS.find(h=> h.test(first));
    return match ? match.label : 'Direto ao ponto';
  }
  function detectHooks(texts){
    const counts = {};
    texts.forEach(t=>{ const label = hookLabelFor(t); counts[label] = (counts[label]||0)+1; });
    return Object.entries(counts).sort((a,b)=> b[1]-a[1]).map(([label,count])=>({ label, count }));
  }

  function avgWords(texts){
    if(!texts.length) return 0;
    const total = texts.reduce((sum,t)=> sum + tokenize(t).length, 0);
    return Math.round(total/texts.length);
  }
  function hashtagRatio(texts){
    if(!texts.length) return 0;
    return texts.filter(t=> /#\w+/.test(t)).length / texts.length;
  }

  // ============================================================
  // Agregação das artes/carrosséis enviados (tags marcadas na hora do upload + proporção,
  // tipo estático/vídeo, formato visual predominante por proporção largura×altura)
  // ============================================================
  const VISUAL_TAG_DEFS = [
    { key:'realUse', label:'Produto sempre em uso real (não só em still de estúdio)' },
    { key:'lowText', label:'Peças com pouco texto, priorizando a imagem' },
    { key:'visibleCta', label:'Chamada para ação (CTA) visível na própria arte' },
    { key:'recurringElement', label:'Elemento gráfico recorrente (moldura, selo, marca-d\'água)' }
  ];
  function aggregateVisualTags(visuals){
    const total = visuals.length;
    if(total < 2) return [];
    const rules = [];
    VISUAL_TAG_DEFS.forEach(def=>{
      const count = visuals.filter(v=> v.tags && v.tags[def.key]).length;
      if(count/total >= 0.6) rules.push(`${def.label} (${count} de ${total} peças)`);
    });
    return rules;
  }
  function dominantFormat(visuals){
    const withRatio = visuals.filter(v=> v.ratio);
    if(withRatio.length < 2) return null;
    const counts = {};
    withRatio.forEach(v=>{ counts[v.ratio] = (counts[v.ratio]||0)+1; });
    const [format, count] = Object.entries(counts).sort((a,b)=> b[1]-a[1])[0];
    return { format, count, total: withRatio.length };
  }
  function videoStaticSplit(visuals){
    const video = visuals.filter(v=> v.kind==='video').length;
    return { video, static: visuals.length - video, total: visuals.length };
  }
  const RATIO_LABELS = { quadrado:'quadrado (1:1)', vertical:'vertical (4:5 / 9:16)', horizontal:'horizontal (16:9)' };

  // ============================================================
  // GERA O "DNA" DA EDITORIA a partir de tudo que foi enviado como referência
  // ============================================================
  function generateDNA(bucket){
    const visuals = bucket.references.visuals;
    const captionTexts = bucket.references.captions.map(c=> c.text).filter(Boolean);
    const total = referenceCount(bucket);

    const visualRules = aggregateVisualTags(visuals);
    const fmt = dominantFormat(visuals);
    if(fmt) visualRules.push(`Formato visual predominante: ${RATIO_LABELS[fmt.format]||fmt.format} (${fmt.count} de ${fmt.total} peças com dimensão identificada)`);
    const split = videoStaticSplit(visuals);
    if(split.total >= 2){
      if(split.video===0) visualRules.push('Conteúdo majoritariamente estático — nenhum vídeo entre as referências enviadas');
      else if(split.static===0) visualRules.push('Conteúdo majoritariamente em vídeo/Reels');
      else visualRules.push(`Mistura de estático e vídeo (${split.static} estático · ${split.video} vídeo)`);
    }
    if(!visualRules.length) visualRules.push('Referências visuais insuficientes para identificar um padrão ainda — envie mais artes e marque os padrões visuais na Área de treinamento.');

    const words = topWords(captionTexts, 8);
    const ctas = detectCtas(captionTexts);
    const hooks = detectHooks(captionTexts);
    const avg = avgWords(captionTexts);
    const hashRatio = hashtagRatio(captionTexts);

    const contentRules = [];
    if(hooks.length){
      const top = hooks[0];
      contentRules.push(`Gancho de abertura mais comum: ${top.label} (${top.count} de ${captionTexts.length} legenda${captionTexts.length===1?'':'s'})`);
    }
    if(ctas.length){
      contentRules.push(`CTA mais recorrente: ${ctas[0].label} (identificado em ${ctas[0].count} legenda${ctas[0].count>1?'s':''})`);
    } else if(captionTexts.length){
      contentRules.push('Nenhuma chamada para ação clara identificada nas legendas analisadas — considere padronizar um CTA para esta editoria.');
    }
    if(captionTexts.length){
      contentRules.push(avg<=25 ? `Legendas curtas e diretas (média de ${avg} palavras)` : avg<=60 ? `Legendas de tamanho médio (média de ${avg} palavras)` : `Legendas longas e explicativas (média de ${avg} palavras)`);
      if(hashRatio >= 0.5) contentRules.push(`Uso de hashtags em ${Math.round(hashRatio*100)}% das legendas analisadas`);
    }
    if(!contentRules.length) contentRules.push('Nenhuma legenda enviada ainda — adicione legendas já utilizadas para identificar padrões de comunicação.');

    const structure = [];
    structure.push(hooks.length ? `Gancho de abertura (${hooks[0].label.toLowerCase()})` : 'Gancho de abertura');
    structure.push('Desenvolvimento / benefício do produto');
    if(visuals.some(v=> v.tags && v.tags.realUse)) structure.push('Aplicação do produto em uso real');
    if(ctas.length || !captionTexts.length) structure.push('Chamada para ação (CTA)');
    if(hashRatio >= 0.3) structure.push('Bloco de hashtags');

    return {
      generatedAt: Date.now(),
      referenceCount: total,
      visualRules,
      contentRules,
      recommendedStructure: structure,
      recurringWords: words,
      ctas: ctas.map(c=> c.label),
      hooks: hooks.map(h=> h.label),
      dominantVisualFormat: fmt ? fmt.format : null,
      stats: { avgWords: avg, hashtagRatio: hashRatio, captionCount: captionTexts.length, visualCount: visuals.length }
    };
  }

  // ============================================================
  // VALIDAÇÃO INTELIGENTE — compara um rascunho (título + texto) com o DNA já gerado da
  // editoria e devolve um nível de aderência (0-100), pontos fortes e sugestões de melhoria
  // ============================================================
  function validatePost(draft, dna){
    if(!dna || !dna.referenceCount){
      return {
        score: null,
        mainConcept: null,
        strengths: [],
        improvements: ['Esta editoria ainda não tem um DNA gerado — treine a IA na Central de Inteligência (Área de treinamento → Analisar referências) antes de validar.']
      };
    }
    let score = 50;
    const strengths = [];
    const improvements = [];
    const caption = draft.caption || '';
    const title = draft.title || '';
    const combined = `${title} ${caption}`;

    if(dna.hooks && dna.hooks.length){
      const topHook = dna.hooks[0];
      const hookHere = hookLabelFor(caption || title);
      if(hookHere === topHook){ score += 12; strengths.push(`Abre com o gancho mais usado nesta editoria (${topHook}).`); }
      else improvements.push(`O gancho mais eficaz nesta editoria costuma ser "${topHook}" — considere reescrever a abertura do texto.`);
    }

    if(dna.ctas && dna.ctas.length){
      const hasCta = CTA_PATTERNS.some(p=> p.re.test(caption));
      if(hasCta){ score += 12; strengths.push('Contém uma chamada para ação, como nas referências desta editoria.'); }
      else improvements.push(`Adicione uma chamada para ação — o histórico desta editoria costuma usar algo como ${dna.ctas[0]}.`);
    }

    const words = tokenize(caption).length;
    if(dna.stats && dna.stats.captionCount){
      if(words===0) improvements.push('O texto da publicação ainda está vazio.');
      else{
        const target = dna.stats.avgWords || 0;
        const diff = Math.abs(words - target);
        if(target>0 && diff <= Math.max(10, target*0.5)){ score += 10; strengths.push(`Tamanho de texto compatível com o padrão da editoria (~${target} palavras).`); }
        else if(target>0) improvements.push(`O padrão desta editoria costuma ter textos de ~${target} palavras (esta publicação tem ${words}).`);
      }
    }

    if(dna.recurringWords && dna.recurringWords.length){
      const tokensHere = new Set(tokenize(combined));
      const hitWords = dna.recurringWords.filter(w=> tokensHere.has(w.word));
      if(hitWords.length){ score += Math.min(10, hitWords.length*3); strengths.push(`Usa termos recorrentes desta editoria: ${hitWords.slice(0,3).map(w=> w.word).join(', ')}.`); }
    }

    if(!title.trim()) improvements.push('Esta publicação ainda não tem título.');

    score = Math.max(0, Math.min(100, Math.round(score)));
    const mainConcept = (dna.hooks && dna.hooks[0])
      ? `Conteúdo com gancho "${dna.hooks[0]}", reforçando o padrão já validado desta editoria.`
      : 'Conteúdo alinhado ao histórico geral desta editoria.';
    if(!strengths.length) strengths.push('Publicação registrada, mas ainda com poucos sinais fortes de aderência ao padrão da editoria.');

    return { score, mainConcept, strengths, improvements };
  }

  global.IntelStore = {
    STORAGE_KEY, normalize, readLocal, writeLocal, fetchServer, pushServer,
    getBucket, referenceCount, learningStatus,
    generateDNA, validatePost,
    topWords, detectCtas, detectHooks, hookLabelFor, tokenize
  };
})(window);
