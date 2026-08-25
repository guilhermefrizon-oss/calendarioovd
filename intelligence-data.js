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
// formato/proporção/cor média das artes...) — tudo extraído automaticamente do próprio
// arquivo, sem nenhuma marcação manual do usuário. Não depende de nenhum serviço externo,
// então funciona 100% offline, mas por isso também tem limites: não "olha" o conteúdo visual
// da imagem em si (não reconhece produto, texto na peça etc.), só o que dá pra calcular do
// arquivo (dimensão, tipo, cor média) e do texto das legendas/briefings.
// ============================================================
(function(global){
  const BRAND_SUFFIX = (global.PortalBrand && global.PortalBrand.suffix) || '';
  const STORAGE_KEY = 'calendar_intel_v1' + BRAND_SUFFIX;
  const API_KEY = 'intel' + BRAND_SUFFIX;

  function emptyBucket(){
    return {
      // cada "peça" é uma unidade completa de referência: rede social + briefing de como foi
      // pedida ao design + artes por formato daquela rede + legenda publicada — assim a IA
      // enxerga o processo inteiro (pedido → concepção → publicação), não pools soltos
      posts: [],
      instructions: '',
      dna: null,
      dnaHistory: []
    };
  }

  function emptyPost(){
    return { id:null, network:null, requestBriefing:'', caption:'', formats:{}, addedAt:Date.now() };
  }

  // migração: buckets salvos no modelo antigo (references.visuals/captions/briefings soltos,
  // sem vínculo entre si) viram uma peça avulsa por item — não dá pra reconstruir de verdade
  // qual arte/legenda/briefing pertencia à mesma publicação (esse vínculo nunca existiu no
  // formato antigo), mas nenhum dado enviado antes se perde
  function migrateLegacyReferences(legacy){
    const posts = [];
    if(!legacy) return posts;
    (legacy.visuals||[]).forEach(v=>{
      posts.push(Object.assign(emptyPost(), { id:v.id, addedAt:v.addedAt, formats:{ [v.format||'Feed']: [v] } }));
    });
    (legacy.captions||[]).forEach(c=>{
      posts.push(Object.assign(emptyPost(), { id:c.id, addedAt:c.addedAt, caption:c.text||'' }));
    });
    (legacy.briefings||[]).forEach(br=>{
      posts.push(Object.assign(emptyPost(), { id:br.id, addedAt:br.addedAt, requestBriefing:br.text||'' }));
    });
    return posts;
  }

  function normalizePost(p){
    const out = Object.assign(emptyPost(), p || {});
    if(!out.id) out.id = 'intel-' + Math.random().toString(36).slice(2,9) + Date.now().toString(36).slice(-4);
    if(typeof out.network !== 'string') out.network = null;
    if(typeof out.requestBriefing !== 'string') out.requestBriefing = '';
    if(typeof out.caption !== 'string') out.caption = '';
    out.formats = (out.formats && typeof out.formats==='object') ? out.formats : {};
    Object.keys(out.formats).forEach(k=>{ if(!Array.isArray(out.formats[k])) out.formats[k] = []; });
    return out;
  }

  function normalizeBucket(b){
    const out = Object.assign(emptyBucket(), b || {});
    if(!Array.isArray(out.posts)) out.posts = migrateLegacyReferences(b && b.references);
    out.posts = out.posts.map(normalizePost);
    delete out.references;
    if(!Array.isArray(out.dnaHistory)) out.dnaHistory = [];
    // migração: buckets salvos antes da troca do campo único de orientações
    if(typeof out.instructions !== 'string') out.instructions = (b && typeof b.productsNotes === 'string') ? b.productsNotes : '';
    delete out.productsNotes;
    return out;
  }

  // "achata" as peças em listas de visuais/legendas/briefings pra reaproveitar toda a análise
  // (Etapa 1 e 2) sem reescrevê-la — o vínculo peça→formato→arquivo continua disponível em
  // cada visual (campo network/postId), só a consolidação estatística é que trata tudo junto
  function flattenPosts(posts){
    const visuals = [], captions = [], briefings = [];
    (posts||[]).forEach(post=>{
      Object.entries(post.formats||{}).forEach(([formatName, files])=>{
        (files||[]).forEach(f=> visuals.push(Object.assign({}, f, { format: f.format || formatName, network: post.network, postId: post.id })));
      });
      if(post.caption && post.caption.trim()) captions.push({ id: post.id+'-caption', text: post.caption, addedAt: post.addedAt, postId: post.id });
      if(post.requestBriefing && post.requestBriefing.trim()) briefings.push({ id: post.id+'-briefing', text: post.requestBriefing, addedAt: post.addedAt, postId: post.id });
    });
    return { visuals, captions, briefings };
  }

  // registra no histórico o momento em que o DNA foi (re)gerado — usado na área "Referências
  // utilizadas" pra mostrar quando a inteligência da editoria foi atualizada ao longo do tempo
  function recordDnaGeneration(bucket){
    bucket.dnaHistory = Array.isArray(bucket.dnaHistory) ? bucket.dnaHistory : [];
    bucket.dnaHistory.push({ generatedAt: bucket.dna.generatedAt, referenceCount: bucket.dna.referenceCount });
    if(bucket.dnaHistory.length > 20) bucket.dnaHistory = bucket.dnaHistory.slice(-20);
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
    return SyncBackend.get(API_KEY); // { v, updated_at }
  }

  async function pushServer(value, expectedVersion){
    const result = await SyncBackend.put(API_KEY, value, expectedVersion);
    if(result.conflict) return { conflict:true, server:result.server };
    return { conflict:false, updated_at:result.updated_at };
  }

  function getBucket(data, editoriaName){
    if(!data.editorias[editoriaName]) data.editorias[editoriaName] = emptyBucket();
    return data.editorias[editoriaName];
  }

  function referenceCount(bucket){
    const { visuals, captions, briefings } = flattenPosts(bucket.posts);
    return visuals.length + captions.length + briefings.length;
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

  // testadas sempre contra o texto sem acento (stripAccents) — "garanta a sua"/"alguém"/"já"
  // têm que casar independente de acentuação ou de concordância de gênero (a sua vs o seu)
  const CTA_PATTERNS = [
    { re:/saiba mais/i, label:'"Saiba mais"' },
    { re:/link (na|no) (bio|perfil)/i, label:'"Link na bio"' },
    { re:/arraste|deslize/i, label:'"Arraste/deslize"' },
    { re:/coment[ae]|deixe (seu|nos) coment/i, label:'"Comente"' },
    { re:/compartilh/i, label:'"Compartilhe"' },
    { re:/marque (um amigo|alguem)/i, label:'"Marque um amigo"' },
    { re:/clique|toque (aqui|no link)/i, label:'"Clique/toque"' },
    { re:/garanta (a sua|o seu|ja)|aproveite|corra/i, label:'"Garanta/aproveite"' },
    { re:/chama(da)? no direct|manda(e)? mensagem|fale com a gente|entre em contato/i, label:'"Chama no direct"' },
    { re:/salve (esse|este) post|salva (esse|este) post/i, label:'"Salve este post"' },
    { re:/compre agora|adquira/i, label:'"Compre agora"' }
  ];
  // sinaliza qual CTA foi encontrado num texto só (usado na análise individual — Etapa 1 — e
  // na validação de publicação); é só o primeiro padrão que bater, não todos
  function ctaMatchFor(text){
    const normalized = stripAccents(text);
    return CTA_PATTERNS.find(p=> p.re.test(normalized));
  }
  function detectCtas(texts){
    const counts = {};
    texts.forEach(t=>{
      const normalized = stripAccents(t);
      CTA_PATTERNS.forEach(p=>{ if(p.re.test(normalized)) counts[p.label] = (counts[p.label]||0)+1; });
    });
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
  // ANÁLISE AUTOMÁTICA DAS ARTES/CARROSSÉIS — nenhuma marcação manual: só o que dá pra
  // extrair sozinho de cada arquivo (formato escolhido no upload, proporção largura×altura,
  // estático×vídeo e a cor média de cada imagem, usada pra notar paleta/luminosidade
  // recorrente). Isso substitui as antigas tags manuais ("produto em uso real", "pouco
  // texto"...) — sem visão computacional de verdade, essas quatro características deixaram
  // de dar pra detectar sozinhas e viraram sinais automáticos equivalentes (formato,
  // proporção, estático/vídeo, paleta de cor).
  // ============================================================
  function videoStaticSplit(visuals){
    const video = visuals.filter(v=> v.kind==='video').length;
    return { video, static: visuals.length - video, total: visuals.length };
  }
  const RATIO_LABELS = { quadrado:'quadrado (1:1)', vertical:'vertical (4:5 / 9:16)', horizontal:'horizontal (16:9)' };

  function hexToRgbLite(hex){
    const h = (hex||'#808080').replace('#','');
    const full = h.length===3 ? h.split('').map(c=>c+c).join('') : h;
    const n = parseInt(full,16) || 0x808080;
    return { r:(n>>16)&255, g:(n>>8)&255, b:n&255 };
  }
  function relLuminanceLite(hex){
    const { r, g, b } = hexToRgbLite(hex);
    const chan = v=>{ v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); };
    return 0.2126*chan(r) + 0.7152*chan(g) + 0.0722*chan(b);
  }
  function hexToHslLite(hex){
    const { r, g, b } = hexToRgbLite(hex);
    const rn=r/255, gn=g/255, bn=b/255;
    const max=Math.max(rn,gn,bn), min=Math.min(rn,gn,bn);
    const l=(max+min)/2;
    let h=0, s=0;
    const d=max-min;
    if(d!==0){
      s = l>0.5 ? d/(2-max-min) : d/(max+min);
      if(max===rn) h = ((gn-bn)/d) % 6;
      else if(max===gn) h = (bn-rn)/d + 2;
      else h = (rn-gn)/d + 4;
      h *= 60;
      if(h<0) h += 360;
    }
    return { h, s, l };
  }
  const HUE_LABELS = [[0,'vermelhos'],[30,'laranjas'],[60,'amarelos'],[90,'verde-limão'],[120,'verdes'],[150,'verde-azulados'],[180,'ciano'],[210,'azuis'],[240,'azul-arroxeados'],[270,'roxos'],[300,'magentas'],[330,'rosados']];
  function hueLabel(h){
    const bucket = Math.floor((((h%360)+360)%360)/30)*30;
    const found = HUE_LABELS.find(([b])=> b===bucket);
    return found ? found[1] : 'variados';
  }

  function cap(s){ return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  // "Como os produtos são apresentados" — formato predominante (peça única × carrossel ×
  // stories × vídeo) e o quanto o conteúdo é estático ou em vídeo
  function visualPresentationNote(visuals){
    if(!visuals.length) return null;
    const counts = {};
    visuals.forEach(v=> counts[v.format] = (counts[v.format]||0)+1);
    const sorted = Object.entries(counts).sort((a,b)=> b[1]-a[1]);
    const [top, count] = sorted[0];
    const rest = sorted.slice(1).map(([f,c])=> `${f} (${c})`).join(', ');
    const split = videoStaticSplit(visuals);
    const modeText = split.total >= 2
      ? (split.video===0 ? 'sempre em peças estáticas' : split.static===0 ? 'sempre em vídeo/Reels' : `misturando estático (${split.static}) e vídeo (${split.video})`)
      : null;
    return `Predomina ${top} (${count} de ${visuals.length} peça${visuals.length===1?'':'s'})` + (modeText ? `, ${modeText}` : '') + (rest ? ` — também aparece ${rest}` : '');
  }
  // "Estilo das imagens" — luminosidade e paleta média das peças (claro/escuro, neutro/colorido).
  // Tira conclusão a partir de 1 peça só — a confiança (ver withConfidence) é quem sinaliza que
  // a amostra ainda é pequena, a nota em si não precisa esperar um volume mínimo de referências.
  function visualStyleNote(visuals){
    const withColor = visuals.filter(v=> v.color);
    if(!withColor.length) return null;
    const avgLum = withColor.reduce((s,v)=> s+relLuminanceLite(v.color), 0)/withColor.length;
    const brightness = avgLum >= 0.6 ? 'imagens predominantemente claras' : avgLum <= 0.22 ? 'imagens predominantemente escuras' : (withColor.length===1 ? 'imagem de luminosidade intermediária' : 'equilíbrio entre imagens claras e escuras');
    const grayCount = withColor.filter(v=> hexToHslLite(v.color).s < 0.12).length;
    const warmth = (grayCount/withColor.length >= 0.6) ? 'com paleta predominantemente neutra' : null;
    const suffix = withColor.length===1 ? ' (baseado numa única referência)' : '';
    return cap(brightness) + (warmth ? `, ${warmth}` : '') + suffix;
  }
  // "Hierarquia das informações" — inferida do formato predominante: carrossel/stories sugerem
  // hierarquia sequencial entre peças, peça única concentra tudo numa arte só
  function hierarchyNote(visuals){
    if(!visuals.length) return null;
    const counts = {};
    visuals.forEach(v=> counts[v.format] = (counts[v.format]||0)+1);
    const total = visuals.length;
    const carrossel = counts['Carrossel'] || 0;
    const stories = counts['Stories'] || 0;
    if(carrossel/total >= 0.4) return 'Predomínio de carrossel — hierarquia sequencial entre peças (capa → detalhe/benefício → CTA final)';
    if(stories/total >= 0.4) return 'Predomínio de Stories — hierarquia rápida e fragmentada, uma informação por tela';
    return 'Predomínio de arte única — hierarquia concentrada numa peça só, sem sequência entre imagens';
  }
  function compositionNote(visuals){
    const withRatio = visuals.filter(v=> v.ratio);
    if(!withRatio.length) return null;
    const counts = {};
    withRatio.forEach(v=> counts[v.ratio] = (counts[v.ratio]||0)+1);
    const [ratio, count] = Object.entries(counts).sort((a,b)=> b[1]-a[1])[0];
    if(withRatio.length===1) return `Proporção desta referência: ${RATIO_LABELS[ratio]||ratio} (baseado numa única peça)`;
    return `Proporção predominante: ${RATIO_LABELS[ratio]||ratio} (${count} de ${withRatio.length} peças com dimensão identificada)`;
  }
  function recurringVisualNote(visuals){
    const withColor = visuals.filter(v=> v.color);
    if(!withColor.length) return null;
    const grayCount = withColor.filter(v=> hexToHslLite(v.color).s < 0.12).length;
    if(withColor.length===1){
      const hsl = hexToHslLite(withColor[0].color);
      return hsl.s < 0.12
        ? 'Tom neutro (cinza/preto/branco) na única referência enviada até agora'
        : `Tom predominante na única referência enviada até agora: ${hueLabel(hsl.h)}`;
    }
    if(grayCount/withColor.length >= 0.6) return 'Paleta predominantemente neutra (tons de cinza/preto/branco) na maioria das peças';
    const bins = {};
    withColor.forEach(v=>{
      const hsl = hexToHslLite(v.color);
      if(hsl.s < 0.12) return;
      const bin = Math.floor(hsl.h/30)*30;
      bins[bin] = (bins[bin]||0)+1;
    });
    const entries = Object.entries(bins).sort((a,b)=> b[1]-a[1]);
    if(entries.length){
      const [bin, count] = entries[0];
      if(count/withColor.length >= 0.5) return `Paleta de cor consistente — predominância de tons ${hueLabel(Number(bin))} em ${count} de ${withColor.length} peças`;
    }
    return null;
  }

  // ============================================================
  // ANÁLISE AUTOMÁTICA DAS LEGENDAS/BRIEFINGS — identidade da editoria (objetivo, público,
  // tom) e padrões de conteúdo, tudo inferido dos ganchos/CTAs/palavras já detectados acima,
  // sem nenhum campo de marcação manual.
  // ============================================================
  // palavras-chave que apontam objetivo diretamente no texto (briefing costuma declarar isso
  // explicitamente: "o objetivo é vender...", "queremos engajar...") — checado ANTES do
  // gancho/CTA porque é um sinal mais direto que uma heurística indireta de padrão de escrita
  const OBJECTIVE_PATTERNS = [
    { re:/vender|venda|compr[ae]|adquir/i, label:'Conversão — incentivar a compra/aquisição do produto' },
    { re:/engaj|compartilh|coment[ae]|intera[cç][aã]o|alcance/i, label:'Engajamento — estimular interação e alcance' },
    { re:/educ|inform|ensin|explic|conscientiz/i, label:'Educar/informar o público sobre o produto ou uso' },
    { re:/lan[cç]amento|novidade|chegou|apresent/i, label:'Anunciar novidades e lançamentos' },
    { re:/problema|dificuldade|\bdor\b|desafio|resolv/i, label:'Resolver uma dor/problema do público com o produto' },
    { re:/fideliz|fortalecer a marca|posicionamento|autoridade/i, label:'Fortalecer o posicionamento/autoridade da marca' },
    { re:/saiba mais|link na bio|direcion|tr[aá]feg/i, label:'Direcionamento — levar o público a saber mais/comprar' }
  ];
  function objectiveFromKeywords(text){
    const found = OBJECTIVE_PATTERNS.find(p=> p.re.test(text));
    return found ? found.label : null;
  }
  // nunca devolve null quando existe texto pra analisar — se nenhuma palavra-chave nem
  // gancho/CTA específico bater, ainda assim dá uma conclusão genérica em vez de deixar o
  // campo em branco (era esse retorno silencioso de null que fazia "Objetivo identificado"
  // aparecer como "não identificado" mesmo com muitas referências enviadas)
  function classifyObjective(texts, ctas, hooks){
    const byKeyword = objectiveFromKeywords(texts.join(' '));
    if(byKeyword) return byKeyword;
    if(ctas.length){
      const top = ctas[0].label;
      if(/compre agora|garanta|adquira/i.test(top)) return 'Conversão — incentivar a compra/aquisição do produto';
      if(/coment|compartilh|marque/i.test(top)) return 'Engajamento — estimular interação e alcance';
      if(/link|saiba mais|clique/i.test(top)) return 'Direcionamento — levar o público a saber mais/comprar';
    }
    if(hooks.length){
      const top = hooks[0].label;
      if(top==='Pergunta' || top==='"Você sabia?"') return 'Educar/informar o público sobre o produto ou uso';
      if(top==='Anúncio') return 'Anunciar novidades e lançamentos';
      if(top==='Dor/problema') return 'Resolver uma dor/problema do público com o produto';
    }
    return texts.length ? 'Apresentar produto/conteúdo — sem sinal claro de objetivo mais específico nas referências enviadas' : null;
  }
  const AUDIENCE_TERM_GROUPS = [
    { label:'Público profissional/técnico (obra, oficina, instalação)', terms:['profissional','profissionais','obra','instalacao','eletricista','oficina','industria','tecnico','construcao','marcenaria','soldagem','ferramenta','ferramentas'] },
    { label:'Consumidor final/doméstico (casa, projetos pessoais)', terms:['casa','familia','jardim','domestico','reforma','decoracao'] }
  ];
  function classifyAudience(recurringWords){
    const set = new Set(recurringWords.map(w=> w.word));
    let best = null, bestHits = 0;
    AUDIENCE_TERM_GROUPS.forEach(group=>{
      const hits = group.terms.filter(t=> set.has(t)).length;
      if(hits > bestHits){ bestHits = hits; best = group.label; }
    });
    return bestHits > 0 ? best : null;
  }
  function classifyTone(texts){
    if(!texts.length) return null;
    const exclam = texts.filter(t=> /!/.test(t)).length/texts.length;
    const emoji = texts.filter(t=> /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(t)).length/texts.length;
    const informal = texts.filter(t=> /\bvc\b|\bpra\b|\bta\b/i.test(stripAccents(t))).length/texts.length;
    if(exclam >= 0.5 || emoji >= 0.4) return 'Descontraído e próximo — uso frequente de exclamações/emojis';
    if(informal >= 0.3) return 'Informal e direto';
    return 'Técnico e informativo — tom mais formal';
  }
  function recommendedLanguageNote(avg, hashRatio, captionCount){
    if(!captionCount) return null;
    const sizeNote = avg<=25 ? `legendas curtas e diretas (~${avg} palavras)` : avg<=60 ? `legendas de tamanho médio (~${avg} palavras)` : `legendas longas e explicativas (~${avg} palavras)`;
    const hashNote = hashRatio>=0.5 ? `, com uso de hashtags em ${Math.round(hashRatio*100)}% das legendas` : '';
    return sizeNote.charAt(0).toUpperCase() + sizeNote.slice(1) + hashNote + '.';
  }
  function textStructureSteps(hooks, ctas, hashRatio, captionCount){
    if(!captionCount) return [];
    const steps = [];
    steps.push(hooks.length ? `Gancho de abertura (${hooks[0].label.toLowerCase()})` : 'Gancho de abertura');
    steps.push('Desenvolvimento / benefício do produto');
    if(ctas.length) steps.push('Chamada para ação (CTA)');
    if(hashRatio >= 0.3) steps.push('Bloco de hashtags');
    return steps;
  }

  // ============================================================
  // INDICADOR DE CONFIANÇA — toda conclusão da Etapa 2 carrega o grau de confiança e a
  // quantidade de referências que a sustentam, em vez de apresentar a inferência como um
  // fato absoluto. Quanto mais referências apoiam uma conclusão, maior a confiança.
  // ============================================================
  function confidenceLevel(n){
    if(!n) return null;
    if(n >= 6) return 'Alta';
    if(n >= 3) return 'Média';
    return 'Baixa';
  }
  function withConfidence(value, count){
    const empty = Array.isArray(value) ? !value.length : (value===null || value===undefined);
    return { value: empty ? null : value, confidence: empty ? null : confidenceLevel(count), count: count||0 };
  }

  // ============================================================
  // ETAPA 1 — ANÁLISE INDIVIDUAL DE CADA REFERÊNCIA (arte, carrossel, vídeo, legenda ou
  // briefing), antes de qualquer consolidação. Artes/vídeos só têm sinais estruturais
  // (formato, proporção, estático×vídeo) — sem visão computacional real não dá pra extrair
  // objetivo/mensagem/benefício de uma imagem, então esses campos ficam null pra esse tipo de
  // referência. Legendas e briefings são onde o objetivo, a mensagem, o tema, o benefício e o
  // gatilho de comunicação realmente aparecem, então são analisados por texto.
  // ============================================================
  const BENEFIT_PATTERNS = [
    { re:/resistente|durabilidade|dur[aá]vel|aguenta/i, label:'Durabilidade/resistência' },
    { re:/econom|barato|custo.benef[ií]cio/i, label:'Economia' },
    { re:/r[aá]pid|agilidade|praticidade|f[aá]cil/i, label:'Praticidade/agilidade' },
    { re:/seguran[cç]a|seguro/i, label:'Segurança' },
    { re:/qualidade|profissional/i, label:'Qualidade profissional' },
    { re:/garantia/i, label:'Garantia' },
    { re:/pot[eê]ncia|for[cç]a/i, label:'Potência' },
    { re:/vers[aá]til|multiuso/i, label:'Versatilidade' }
  ];
  function detectBenefit(text){
    const found = BENEFIT_PATTERNS.find(p=> p.re.test(text));
    return found ? found.label : null;
  }
  // proxy leve de "produto/tema comunicado": as palavras mais frequentes só daquele texto
  // (não é reconhecimento de produto de verdade, é extração de palavra-chave)
  function detectTheme(text){
    const words = topWords([text], 2).map(w=> w.word);
    return words.length ? words.join(', ') : null;
  }
  function classifyObjectiveSingle(text, hook, ctaLabel){
    const byKeyword = objectiveFromKeywords(text);
    if(byKeyword) return byKeyword;
    if(ctaLabel){
      if(/compre agora|garanta|adquira/i.test(ctaLabel)) return 'Conversão — incentivar a compra/aquisição';
      if(/coment|compartilh|marque/i.test(ctaLabel)) return 'Engajamento — estimular interação';
      if(/link|saiba mais|clique/i.test(ctaLabel)) return 'Direcionamento — levar a saber mais/comprar';
    }
    if(hook==='Pergunta' || hook==='"Você sabia?"') return 'Educar/informar';
    if(hook==='Anúncio') return 'Anunciar novidade/lançamento';
    if(hook==='Dor/problema') return 'Resolver uma dor/problema';
    return 'Apresentar produto/conteúdo';
  }
  function buildTextStructureLabel(hook, hasCta, hasHashtag){
    const steps = [];
    steps.push(hook && hook!=='Direto ao ponto' ? `Gancho (${hook.toLowerCase()})` : 'Abertura direta');
    steps.push('Desenvolvimento/benefício');
    if(hasCta) steps.push('CTA');
    if(hasHashtag) steps.push('Hashtags');
    return steps.join(' → ');
  }
  function analyzeTextReference(text){
    const t = String(text||'').trim();
    if(!t){
      return { estruturaVisual:null, estruturaTextual:null, gatilho:null, mensagemPrincipal:null, produtoTema:null, beneficio:null, objetivo:null, _hasCta:false, _hasBenefit:false };
    }
    const hook = hookLabelFor(t);
    const ctaMatch = ctaMatchFor(t);
    const benefit = detectBenefit(t);
    const firstLine = t.split('\n')[0].trim();
    return {
      estruturaVisual: null,
      estruturaTextual: buildTextStructureLabel(hook, !!ctaMatch, /#\w+/.test(t)),
      gatilho: hook,
      mensagemPrincipal: firstLine || null,
      produtoTema: detectTheme(t),
      beneficio: benefit,
      objetivo: classifyObjectiveSingle(t, hook, ctaMatch ? ctaMatch.label : null),
      _hasCta: !!ctaMatch,
      _hasBenefit: !!benefit
    };
  }
  function analyzeVisualReference(item){
    const parts = [item.format];
    if(item.ratio) parts.push(RATIO_LABELS[item.ratio]);
    parts.push(item.kind==='video' ? 'vídeo' : 'imagem estática');
    return {
      estruturaVisual: parts.join(' · '),
      estruturaTextual: null,
      gatilho: null,
      mensagemPrincipal: null,
      produtoTema: null,
      beneficio: null,
      objetivo: null
    };
  }

  // ============================================================
  // MODELOS DE CONTEÚDO — padrões reutilizáveis detectados nas legendas (gancho + presença de
  // benefício/CTA). Cada legenda casa com o primeiro modelo cuja condição bater; o mais
  // genérico ("Gancho → desenvolvimento → CTA") fica por último, como modelo "catch-all".
  // ============================================================
  const CONTENT_MODEL_DEFS = [
    { name:'Problema → solução → benefício', test:a=> a.gatilho==='Dor/problema' && a._hasBenefit },
    { name:'Produto → diferencial → aplicação', test:a=> (a.gatilho==='Anúncio' || a.gatilho==='Direto ao ponto') && a._hasBenefit && a.produtoTema },
    { name:'Pergunta → resposta → CTA', test:a=> a.gatilho==='Pergunta' && a._hasCta },
    { name:'Dado/estatística → benefício → CTA', test:a=> a.gatilho==='Dado/estatística' && a._hasCta },
    { name:'Gancho → desenvolvimento → CTA', test:a=> a._hasCta }
  ];
  function detectContentModels(textAnalyses){
    const valid = textAnalyses.filter(a=> a.gatilho);
    if(!valid.length) return [];
    const counts = {};
    valid.forEach(a=>{
      const match = CONTENT_MODEL_DEFS.find(def=> def.test(a));
      if(match) counts[match.name] = (counts[match.name]||0) + 1;
    });
    return Object.entries(counts)
      .sort((a,b)=> b[1]-a[1])
      .map(([name,count])=> ({ name, pattern:name, count, confidence: confidenceLevel(count) }));
  }

  function buildReferencesSnapshot(bucket){
    const { visuals, captions, briefings } = flattenPosts(bucket.posts);
    return {
      visuals: visuals.map(v=> ({ refId:v.id, name:v.name, addedAt:v.addedAt, format:v.format, kind:v.kind, network:v.network })),
      captions: captions.map(c=> ({ refId:c.id, name: c.text.length>60 ? c.text.slice(0,60)+'…' : c.text, addedAt:c.addedAt })),
      briefings: briefings.map(b=> ({ refId:b.id, name: b.text.length>60 ? b.text.slice(0,60)+'…' : b.text, addedAt:b.addedAt })),
      // uma linha por peça completa — dá o quadro geral (rede, o que tem preenchido) sem
      // repetir cada arquivo individual, que já aparece detalhado nas listas acima
      posts: (bucket.posts||[]).map(p=> ({
        id:p.id, network:p.network, addedAt:p.addedAt,
        hasBriefing: !!(p.requestBriefing && p.requestBriefing.trim()),
        hasCaption: !!(p.caption && p.caption.trim()),
        formatCounts: Object.fromEntries(Object.entries(p.formats||{}).map(([k,v])=> [k, (v||[]).length]))
      }))
    };
  }

  // ============================================================
  // GERA O "DNA" DA EDITORIA em duas etapas:
  //  1) analisa cada referência individualmente (perReferenceAnalysis)
  //  2) consolida os achados numa inteligência estratégica (objetivo, como a marca comunica,
  //     estratégia visual, estratégia de conteúdo e modelos reutilizáveis), cada conclusão
  //     com seu grau de confiança e a quantidade de referências que a sustentam.
  // Objetivo/público usam um corpus mais amplo (legendas + briefings + orientações do
  // usuário) — um briefing ou uma instrução costuma declarar a intenção estratégica de forma
  // até mais direta que a legenda publicada. Já o estilo de escrita (tamanho, hashtags,
  // estrutura, CTAs usados) segue baseado só nas legendas realmente publicadas, pra não
  // misturar prosa de briefing com o texto que de fato vai pro post.
  // ============================================================
  function generateDNA(bucket){
    const { visuals, captions: captionItems, briefings: briefingItems } = flattenPosts(bucket.posts);
    const captionTexts = captionItems.map(c=> c.text).filter(Boolean);
    const briefingTexts = briefingItems.map(b=> b.text).filter(Boolean);
    const strategyTexts = captionTexts.concat(briefingTexts, bucket.instructions ? [bucket.instructions] : []);
    const total = referenceCount(bucket);

    // ETAPA 1 — análise individual de cada referência
    const perReferenceAnalysis = [];
    visuals.forEach(v=> perReferenceAnalysis.push(Object.assign({ refType:'visual', refId:v.id, name:v.name, addedAt:v.addedAt }, analyzeVisualReference(v))));
    captionItems.forEach(c=> perReferenceAnalysis.push(Object.assign({ refType:'caption', refId:c.id, name:(c.text||'').slice(0,60), addedAt:c.addedAt }, analyzeTextReference(c.text))));
    briefingItems.forEach(b=> perReferenceAnalysis.push(Object.assign({ refType:'briefing', refId:b.id, name: b.fileName || (b.text||'').slice(0,60) || 'Briefing', addedAt:b.addedAt }, analyzeTextReference(b.text))));

    const words = topWords(captionTexts, 8);
    const ctas = detectCtas(captionTexts);
    const hooks = detectHooks(captionTexts);
    const avg = avgWords(captionTexts);
    const hashRatio = hashtagRatio(captionTexts);
    const captionAnalyses = perReferenceAnalysis.filter(a=> a.refType==='caption');

    // objetivo/público enxergam legendas + briefings + orientações juntos
    const strategyWords = topWords(strategyTexts, 8);
    const strategyCtas = detectCtas(strategyTexts);
    const strategyHooks = detectHooks(strategyTexts);

    // ETAPA 2 — consolidação estratégica, cada conclusão com seu grau de confiança
    return {
      generatedAt: Date.now(),
      referenceCount: total,
      userInstructions: bucket.instructions || '',
      perReferenceAnalysis,
      referencesSnapshot: buildReferencesSnapshot(bucket),

      howItWorks: {
        objective: withConfidence(classifyObjective(strategyTexts, strategyCtas, strategyHooks), strategyTexts.length),
        audience: withConfidence(classifyAudience(strategyWords), strategyTexts.length)
      },
      howBrandCommunicates: {
        tone: withConfidence(classifyTone(captionTexts), captionTexts.length),
        language: withConfidence(recommendedLanguageNote(avg, hashRatio, captionTexts.length), captionTexts.length)
      },
      visualStrategy: {
        presentation: withConfidence(visualPresentationNote(visuals), visuals.length),
        style: withConfidence(visualStyleNote(visuals), visuals.filter(v=> v.color).length),
        composition: withConfidence(compositionNote(visuals), visuals.filter(v=> v.ratio).length),
        recurring: withConfidence(recurringVisualNote(visuals), visuals.filter(v=> v.color).length),
        hierarchy: withConfidence(hierarchyNote(visuals), visuals.length)
      },
      contentStrategy: {
        textStructure: withConfidence(textStructureSteps(hooks, ctas, hashRatio, captionTexts.length), captionTexts.length),
        openingTypes: withConfidence(hooks.map(h=> h.label), captionTexts.length),
        ctaFormats: withConfidence(ctas.map(c=> c.label), captionTexts.length)
      },
      contentModels: detectContentModels(captionAnalyses),

      // compatibilidade com validatePost() e a sugestão do calendário (app.js)
      hooks: hooks.map(h=> h.label),
      ctas: ctas.map(c=> c.label),
      recurringWords: words,
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
        improvements: ['Esta editoria ainda não tem um DNA gerado — crie a inteligência na Central de Inteligência (Base de conhecimento da editoria → Criar inteligência da editoria) antes de validar.']
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
      const hasCta = !!ctaMatchFor(caption);
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
    getBucket, referenceCount, learningStatus, recordDnaGeneration,
    emptyPost, generateDNA, validatePost,
    topWords, detectCtas, detectHooks, hookLabelFor, tokenize
  };
})(window);
