/**
 * Casca do portal — carregado ANTES de app.js/intelligence-center.js em toda página.
 *
 * Duas responsabilidades:
 * 1) Resolver a marca ativa de forma síncrona (só localStorage, sem esperar rede) e expor
 *    `window.PortalBrand.suffix` — é isso que app.js/intelligence-data.js usam para montar suas
 *    próprias chaves de localStorage/api.php sufixadas por marca, logo no topo desses arquivos.
 *    Por isso o <script src="portal-shell.js"> precisa vir ANTES dos scripts das ferramentas.
 * 2) Montar o menu lateral (navegação entre ferramentas + seletor de marca) dentro do
 *    <aside id="portalSidebar"></aside> que cada página já traz vazio.
 *
 * Trocar de marca não tenta atualizar o estado em memória da ferramenta atual — troca o id
 * salvo em localStorage e recarrega a página, reaproveitando 100% da lógica de bootstrap que
 * app.js já tem (loadState/loadSettings/syncPull) sem precisar mexer nela.
 */
(function(){

  function $(id){ return document.getElementById(id); }
  function escapeHtml(s){
    return String(s==null?'':s).replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }
  function svgIcon(paths, size){
    return `<svg width="${size||16}" height="${size||16}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
  }

  // ============================================================
  // MARCA ATIVA — resolvida já no topo do arquivo, de forma síncrona (precisa vir ANTES da
  // seção de TEMA logo abaixo: cada marca pode ter uma cor de destaque própria, então é preciso
  // saber qual é a marca ativa antes de aplicar o tema pela primeira vez, pra não haver flash)
  // ============================================================
  const BRANDS_KEY = 'portal_brands_v1';
  const ACTIVE_BRAND_KEY = 'portal_active_brand_v1';
  const COLLAPSE_KEY = 'portal_sidebar_collapsed_v1';
  // a marca "default" é a base de dados que já existia antes do portal (posts/settings/guia
  // sem sufixo) — por isso ela nunca é migrada, só vira a primeira entrada da lista. As demais
  // marcas do grupo já vêm pré-cadastradas aqui, com id fixo (não gerado por generateBrandId())
  // pra que qualquer navegador/computador que abra o portal pela primeira vez monte a mesma
  // lista, com os mesmos ids — essencial pro sufixo de isolamento (posts__{id}, settings__{id})
  // bater entre máquinas diferentes antes da lista ainda ter sido sincronizada pelo servidor.
  // Cada marca tem calendário, editorias, catálogo de produtos e metas 100% independentes —
  // isso já vem de graça do sufixo por marca que app.js aplica em toda chave de
  // localStorage/api.php (ver BRAND_SUFFIX no topo de app.js).
  // themeColor/themeColorInk = tema pré-definido da marca (ver seção TEMA logo abaixo): dois
  // tons — destaque (botões/links) e ênfase (rótulos/textos em destaque) — a partir da
  // identidade visual de cada marca. Fixo por marca (o grid de cores não grava mais aqui) —
  // quem quiser uma cor diferente da identidade oficial usa o tema "Personalizado" em
  // Configurações, que vale globalmente sem alterar este valor — ver getThemeSource().
  // onAccent (opcional) = cor do texto sobre botões da cor de destaque, quando a marca precisa
  // de algo diferente do que o cálculo automático de contraste escolheria (ex: TOOLMIX pediu
  // fonte branca nos botões laranja mesmo o preto tendo contraste técnico maior) — ver applyColorTheme().
  // GRUPO OVD usa a mesma identidade da VONDER (é o grupo por trás da marca) — pra diferenciar
  // sem herdar o amarelo da Vonder (a 1ª sugestão foi um dourado mais escuro, mas não agradou),
  // o destaque é um cinza claro neutro, sem tom de cor — reconhecível como "o grupo" (mais
  // institucional/neutro) em vez de "a marca" (mais vibrante/amarela).
  const DEFAULT_BRANDS = [
    { id:'default', name:'VONDER', shortName:'VD', photo:'icons/icon_vonder.jpg', themeColor:{ dark:'#F6BE00', light:'#F6BE00' }, themeColorInk:'#000000' },
    { id:'ferramentas-gerais', name:'FERRAMENTAS GERAIS', shortName:'FG', photo:'icons/icon_ferramentas_gerais.png', themeColor:{ dark:'#005745', light:'#005745' }, themeColorInk:'#005745' },
    { id:'osten-ferragens', name:'OSTEN FERRAGENS', shortName:'OF', photo:'icons/icon_osten_ferragens.jpg', themeColor:{ dark:'#ED8B00', light:'#ED8B00' }, themeColorInk:'#2E2E2E' },
    { id:'dismatal', name:'DISMATAL', shortName:'DM', photo:'icons/icon_dismatal.jpg', themeColor:{ dark:'#FFED00', light:'#FFED00' }, themeColorInk:'#000000' },
    { id:'toolmix', name:'TOOLMIX', shortName:'TM', photo:'icons/icon_toolmix.jpg', themeColor:{ dark:'#F26522', light:'#F26522' }, themeColorInk:'#FFFFFF', onAccent:'#FFFFFF' },
    { id:'dwt', name:'DWT', shortName:'DWT', photo:'icons/icon_dwt.jpg', themeColor:{ dark:'#285C4D', light:'#285C4D' }, themeColorInk:'#AB2328' },
    { id:'nove54', name:'NOVE54', shortName:'N54', photo:'icons/icon_nove54.jpg', themeColor:{ dark:'#BD1D1D', light:'#BD1D1D' }, themeColorInk:'#000000' },
    { id:'grupo-ovd', name:'GRUPO OVD', shortName:'GOVD', photo:'icons/icon_grupo_ovd.jpg', themeColor:{ dark:'#A6A6A6', light:'#A6A6A6' }, themeColorInk:'#000000' }
  ];

  // paleta de fundo do avatar quando a marca não tem foto — escolhida por hash do id, só
  // pra dar alguma variedade visual entre marcas sem foto (não é mais configurável pelo usuário)
  const AVATAR_COLORS = ['#F6BE00','#0ea5e9','#8b5cf6','#f97316','#10b981','#ec4899','#6366f1','#14b8a6'];
  function colorForBrand(id){
    let h = 0; for(let i=0;i<id.length;i++) h = (h*31 + id.charCodeAt(i)) >>> 0;
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
  }
  function brandAvatarHtml(b, extraClass){
    const initials = escapeHtml((b.shortName||b.name||'?').slice(0,2).toUpperCase());
    const cls = 'portal-brand-dot' + (extraClass ? (' '+extraClass) : '');
    if(b.photo) return `<span class="${cls}"><img src="${b.photo}" alt="" /></span>`;
    return `<span class="${cls}" style="background:${colorForBrand(b.id||b.name||'?')}">${initials}</span>`;
  }
  // lê um arquivo de imagem, recorta um quadrado central e reduz pra um avatar leve (evita
  // guardar fotos grandes no localStorage/SQLite, que aqui é só uma coluna de texto)
  function readBrandPhoto(file, cb){
    if(!/^image\//.test(file.type)){ alert('Envie um arquivo de imagem.'); return; }
    if(file.size > 5*1024*1024){ alert('Imagem muito grande (máx. 5MB).'); return; }
    const reader = new FileReader();
    reader.onload = ()=>{
      const img = new Image();
      img.onload = ()=>{
        const size = 160;
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side)/2, sy = (img.height - side)/2;
        ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
        cb(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  }

  function loadBrands(){
    try{
      const raw = localStorage.getItem(BRANDS_KEY);
      if(!raw) return DEFAULT_BRANDS.slice();
      const parsed = JSON.parse(raw);
      return (Array.isArray(parsed) && parsed.length) ? parsed : DEFAULT_BRANDS.slice();
    }catch(e){ return DEFAULT_BRANDS.slice(); }
  }

  let BRANDS = loadBrands();
  let ACTIVE_ID = localStorage.getItem(ACTIVE_BRAND_KEY) || 'default';
  if(!BRANDS.some(b=>b.id===ACTIVE_ID)) ACTIVE_ID = 'default';

  window.PortalBrand = {
    activeId: ACTIVE_ID,
    suffix: ACTIVE_ID === 'default' ? '' : ('__' + ACTIVE_ID),
    list: BRANDS
  };

  function activeBrand(){ return BRANDS.find(b=>b.id===ACTIVE_ID) || BRANDS[0]; }
  function generateBrandId(){ return 'b' + Math.random().toString(36).slice(2,9) + Date.now().toString(36).slice(-4); }
  function switchToBrand(id){
    localStorage.setItem(ACTIVE_BRAND_KEY, id);
    location.reload();
  }

  // ============================================================
  // TEMA (claro/escuro) e cor de destaque — aplicado o quanto antes (portal-shell.js é o
  // primeiro script de cada página, e é o único que ainda aplica essas chaves — app.js não
  // mexe nisso, e post-editor.js/intelligence-center.js pararam de reaplicar por conta própria
  // pra não sobrescrever o resultado já correto deste arquivo) pra evitar flash. O botão
  // "Configurações" no rodapé da sidebar abre um modal próprio (só a aba Aparência por
  // enquanto) que grava nessas chaves.
  // Duas fontes possíveis pra cor de destaque, escolhidas por THEME_SOURCE_KEY (padrão "brand")
  // — ver getThemeSource()/setThemeSource():
  // - "brand": usa activeBrand().themeColor/themeColorInk, a identidade pré-setada de cada
  //   marca (ver DEFAULT_BRANDS acima) — troca de marca troca de cor automaticamente, e cada
  //   marca sempre volta pra própria cor ao reativar esta fonte.
  // - "custom": ignora a marca ativa e usa COLOR_THEME_KEY/CUSTOM_COLOR_KEY (grid de cores ou
  //   cor livre, escolhidos em Configurações) — a mesma cor vale em qualquer marca que o
  //   usuário acessar depois, respeitando o modo claro/escuro selecionado.
  // ============================================================
  const THEME_KEY = 'calendar_theme_v1';
  const COLOR_THEME_KEY = 'calendar_color_theme_v1';
  const CUSTOM_COLOR_KEY = 'calendar_color_theme_custom_v1';
  const THEME_SOURCE_KEY = 'calendar_theme_source_v1'; // 'brand' (padrão) | 'custom'
  const COLOR_THEMES = [
    { id:'dourado',  name:'Dourado',   dark:'#F6BE00', light:'#F6BE00' },
    { id:'azul',     name:'Azul',      dark:'#2f6fed', light:'#7fb0f2' },
    { id:'cinza',    name:'Cinza',     dark:'#6b6b70', light:'#a8a8ae' },
    { id:'petroleo', name:'Petróleo',  dark:'#3c5878', light:'#8fa8c4' },
    { id:'ardosia',  name:'Ardósia',   dark:'#3e4f63', light:'#8898a8' },
    { id:'esverdeado',name:'Esverdeado',dark:'#3f5a52', light:'#a0b4ac' },
    { id:'turquesa', name:'Turquesa',  dark:'#0f9488', light:'#5fd6c4' },
    { id:'verde',    name:'Verde',     dark:'#2f8a3a', light:'#8fd68a' },
    { id:'oliva',    name:'Oliva',     dark:'#5a6a3a', light:'#b0c090' },
    { id:'laranja',  name:'Laranja',   dark:'#d9720f', light:'#f5b878' },
    { id:'marrom',   name:'Marrom',    dark:'#8a5a3a', light:'#d0ac8c' },
    { id:'vinho',    name:'Vinho',     dark:'#a8264a', light:'#f0a0be' },
    { id:'rose',     name:'Rosé',      dark:'#7a4650', light:'#cfa8ae' },
    { id:'magenta',  name:'Magenta',   dark:'#a52a92', light:'#f0a8e4' },
    { id:'roxo',     name:'Roxo',      dark:'#6a3fa0', light:'#c4a8f0' },
  ];
  function hexToRgbObj(hex){
    const h = (hex||'#000000').replace('#','');
    const full = h.length===3 ? h.split('').map(c=>c+c).join('') : h;
    const n = parseInt(full,16) || 0;
    return { r:(n>>16)&255, g:(n>>8)&255, b:n&255 };
  }
  function rgbToHex(r,g,b){
    return '#'+[r,g,b].map(v=> Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');
  }
  function mixHex(hex, withHex, amount){
    const a = hexToRgbObj(hex), b = hexToRgbObj(withHex);
    return rgbToHex(a.r+(b.r-a.r)*amount, a.g+(b.g-a.g)*amount, a.b+(b.b-a.b)*amount);
  }
  function relLuminance(hex){
    const { r, g, b } = hexToRgbObj(hex);
    const chan = v=>{ v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); };
    return 0.2126*chan(r) + 0.7152*chan(g) + 0.0722*chan(b);
  }
  function contrastRatio(l1, l2){ const a = Math.max(l1,l2), b = Math.min(l1,l2); return (a+0.05)/(b+0.05); }
  function pickOnColor(hex){
    const l = relLuminance(hex);
    return contrastRatio(l,0) >= contrastRatio(l,1) ? '#1a1a1a' : '#ffffff';
  }
  function hexToRgba(hex, alpha){
    const h = (hex||'#F6BE00').replace('#','');
    const full = h.length===3 ? h.split('').map(c=>c+c).join('') : h;
    const n = parseInt(full,16) || 0xF6BE00;
    return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${alpha})`;
  }
  function getColorTheme(){ return localStorage.getItem(COLOR_THEME_KEY) || 'dourado'; }
  function getThemeSource(){ return localStorage.getItem(THEME_SOURCE_KEY) || 'brand'; }
  function applyTheme(theme){
    document.documentElement.setAttribute('data-theme', theme);
  }
  function applyColorTheme(id){
    // fonte "brand": marca ativa manda na cor (identidade pré-setada, ver DEFAULT_BRANDS na
    // seção MARCA ATIVA acima). Fonte "custom": ignora a marca e usa sempre a escolha global,
    // pra valer em qualquer marca que o usuário acessar — ver getThemeSource()/THEME_SOURCE_KEY
    const b = activeBrand();
    const brandTheme = getThemeSource()==='brand' ? (b && b.themeColor) : null;
    let dark, light, inkOverride = null;
    if(brandTheme){
      dark = brandTheme.dark; light = brandTheme.light;
      inkOverride = b.themeColorInk || null;
    } else if(id === 'custom'){
      const hex = localStorage.getItem(CUSTOM_COLOR_KEY) || '#F6BE00';
      dark = hex; light = hex;
    } else {
      const palette = COLOR_THEMES.find(p=>p.id===id) || COLOR_THEMES[0];
      dark = palette.dark; light = palette.light;
    }
    const mode = document.documentElement.getAttribute('data-theme') || 'light';
    const accent = mode === 'dark' ? dark : light;
    const root = document.documentElement.style;
    root.setProperty('--accent', accent);
    root.setProperty('--accent-hover', mixHex(accent, '#000000', 0.15));
    root.setProperty('--accent-weak', hexToRgba(accent, 0.16));
    root.setProperty('--on-accent', (brandTheme && b.onAccent) || pickOnColor(accent));
    // no escuro, a ênfase (--accent-ink, usada em texto/ícone sobre fundo escuro — ex: item
    // ativo do menu lateral, botão ativo de Mês/Quinzena/Semana) sempre usa a própria cor de
    // destaque em vez da cor de ênfase da marca: um tom claro (como o amarelo da Vonder) lê bem
    // sobre fundo escuro, mas a cor de ênfase de várias marcas é um tom escuro/preto (pensado
    // pra contrastar em fundo CLARO) — usá-la também no escuro deixava o texto quase invisível.
    // no claro, --accent-ink também é sempre texto sobre fundo claro (menu lateral, rótulos) —
    // por isso só usa a ênfase da marca se ela própria for escura o bastante pra ler; uma ênfase
    // clara (ex: branco da TOOLMIX, pensada pra ler sobre o botão laranja, não sobre fundo
    // branco) cai pro mesmo tom escurecido do destaque usado quando não há ênfase definida.
    const inkFallback = relLuminance(dark) <= 0.18 ? dark : mixHex(dark, '#000000', 0.4);
    const inkOverrideLegible = inkOverride && contrastRatio(relLuminance(inkOverride), 1) >= 3;
    const ink = mode === 'dark'
      ? dark
      : (inkOverrideLegible ? inkOverride : inkFallback);
    root.setProperty('--accent-ink', ink);
  }
  // visual-editor.html tem sua própria aba Aparência (dentro de #settingsBackdrop, controlada
  // por app.js) com os mesmos dados — reflete a troca lá também, senão o radio/grid daquele
  // modal fica desatualizado até a próxima vez que a página carregar
  function syncLegacySettingsUi(){
    const theme = localStorage.getItem(THEME_KEY) || 'light';
    const legacyRadio = document.querySelector(`#settingsBackdrop input[name="sTheme"][value="${theme}"]`);
    if(legacyRadio) legacyRadio.checked = true;
    if(typeof window.renderColorThemeGrid === 'function') window.renderColorThemeGrid();
  }
  function setTheme(theme){
    localStorage.setItem(THEME_KEY, theme);
    applyTheme(theme);
    applyColorTheme(getColorTheme());
    syncLegacySettingsUi();
  }
  function setColorTheme(id){
    // só é chamado com a fonte "custom" ativa (o grid fica oculto na fonte "brand" — ver
    // renderPortalColorGrid) — grava sempre numa chave global, nunca na marca ativa, pra essa
    // escolha valer em qualquer marca que o usuário acessar depois (ver applyColorTheme acima)
    localStorage.setItem(COLOR_THEME_KEY, id);
    applyColorTheme(id);
    if(portalSettingsModalEl) renderPortalColorGrid();
    syncLegacySettingsUi();
  }
  function setThemeSource(src){
    localStorage.setItem(THEME_SOURCE_KEY, src);
    applyColorTheme(getColorTheme());
    if(portalSettingsModalEl) renderPortalColorGrid();
    syncLegacySettingsUi();
  }
  applyTheme(localStorage.getItem(THEME_KEY) || 'light');
  applyColorTheme(getColorTheme());

  // ============================================================
  // SINCRONIZAÇÃO DA LISTA DE MARCAS (api.php?k=brands) — mesma mecânica de sync de chave
  // única que intelligence-data.js já usa pra "intel" (fetch/push/versão otimista)
  // ============================================================
  const SYNC_ENABLED = location.protocol !== 'file:';
  let syncVersion = 0;
  let syncPushTimer = null;
  async function syncFetchBrands(){
    return SyncBackend.get('brands');
  }
  async function syncPushBrands(value){
    const result = await SyncBackend.put('brands', value, syncVersion);
    if(result.conflict) return { conflict:true, server:result.server };
    syncVersion = result.updated_at;
    return { conflict:false };
  }
  function saveBrands(list){
    BRANDS = list;
    window.PortalBrand.list = BRANDS;
    localStorage.setItem(BRANDS_KEY, JSON.stringify(BRANDS));
    if(!SYNC_ENABLED) return;
    clearTimeout(syncPushTimer);
    syncPushTimer = setTimeout(async ()=>{
      try{
        const result = await syncPushBrands(BRANDS);
        if(result.conflict){
          if(result.server.v === null){
            // chave ainda vazia no servidor: não apaga a lista local, só adota a versão
            // e reagenda o envio pra essa cópia acabar subindo
            syncVersion = result.server.updated_at;
            saveBrands(BRANDS);
          } else {
            // outra pessoa salvou a lista de marcas primeiro: adota a versão do servidor
            BRANDS = result.server.v;
            window.PortalBrand.list = BRANDS;
            localStorage.setItem(BRANDS_KEY, JSON.stringify(BRANDS));
            syncVersion = result.server.updated_at;
            if(!brandPopoverOpen) renderBrandTrigger();
          }
        }
      }catch(e){ /* offline — fica salvo só neste navegador, sem travar a UI */ }
    }, 700);
  }
  // completa a lista já carregada (local ou do servidor) com marcas padrão novas que ainda não
  // existiam nela, por id — mesma lógica de "somar sem sobrescrever" que app.js/loadSettings()
  // já usa pra editorias/redes: preserva qualquer customização (nome, foto) de marcas
  // existentes, só acrescenta as que faltam. Assim, uma marca nova do grupo aparece pra quem já
  // tinha uma lista salva (deste navegador ou vinda do servidor), sem precisar recriar tudo pela
  // UI de "Nova marca". A renomeação "Vonder" → "VONDER" só é aplicada se o nome ainda for
  // exatamente o valor padrão anterior — não sobrescreve um nome que alguém já tenha customizado.
  (function mergeDefaultBrands(){
    let changed = false;
    let activeChanged = false;
    const defaultEntry = BRANDS.find(b=>b.id==='default');
    if(defaultEntry && defaultEntry.name==='Vonder'){ defaultEntry.name = 'VONDER'; changed = true; }
    // correções pontuais de sugestões anteriores que não agradaram — só substitui se a cor
    // ainda for exatamente a sugestão antiga (não mexe se alguém já tiver escolhido outra pelo
    // seletor): GRUPO OVD saiu do dourado escuro pro cinza claro, TOOLMIX ganhou ênfase branca,
    // FERRAMENTAS GERAIS trocou a ênfase vermelha por um verde escuro
    const govdEntry = BRANDS.find(b=>b.id==='grupo-ovd');
    if(govdEntry && govdEntry.themeColor && govdEntry.themeColor.light==='#C09400'){ govdEntry.themeColor = { dark:'#A6A6A6', light:'#A6A6A6' }; changed = true; if(govdEntry.id===ACTIVE_ID) activeChanged = true; }
    const toolmixEntry = BRANDS.find(b=>b.id==='toolmix');
    if(toolmixEntry && toolmixEntry.themeColorInk==='#3C3C3B'){ toolmixEntry.themeColorInk = '#FFFFFF'; changed = true; if(toolmixEntry.id===ACTIVE_ID) activeChanged = true; }
    const fgEntry = BRANDS.find(b=>b.id==='ferramentas-gerais');
    if(fgEntry && fgEntry.themeColor && ['#004E32','#135844'].includes(fgEntry.themeColor.light)){ fgEntry.themeColor = { dark:'#005745', light:'#005745' }; changed = true; if(fgEntry.id===ACTIVE_ID) activeChanged = true; }
    if(fgEntry && ['#E42313','#0A6C43'].includes(fgEntry.themeColorInk)){ fgEntry.themeColorInk = '#005745'; changed = true; if(fgEntry.id===ACTIVE_ID) activeChanged = true; }
    DEFAULT_BRANDS.forEach(def=>{
      const existing = BRANDS.find(b=>b.id===def.id);
      if(!existing){
        BRANDS.push(Object.assign({}, def));
        changed = true;
        if(def.id===ACTIVE_ID) activeChanged = true;
        return;
      }
      // preenche a cor/foto pré-definida em quem ainda não tinha uma (sem sobrescrever o que
      // o usuário já tenha customizado) — mesma lógica de "completar sem sobrescrever"
      if(existing.themeColor==null && def.themeColor){ existing.themeColor = def.themeColor; changed = true; if(existing.id===ACTIVE_ID) activeChanged = true; }
      if(existing.themeColorInk==null && def.themeColorInk){ existing.themeColorInk = def.themeColorInk; changed = true; if(existing.id===ACTIVE_ID) activeChanged = true; }
      if(existing.onAccent==null && def.onAccent){ existing.onAccent = def.onAccent; changed = true; if(existing.id===ACTIVE_ID) activeChanged = true; }
      if(existing.photo==null && def.photo){ existing.photo = def.photo; changed = true; }
    });
    if(changed) saveBrands(BRANDS);
    // se a marca atualmente ativa ganhou uma cor pré-definida agora (lista carregada antes
    // desta atualização do portal-shell.js), reaplica o tema pra não precisar recarregar a
    // página pra ver a cor certa
    if(activeChanged) applyColorTheme(getColorTheme());
  })();
  async function syncPullBrands(){
    if(!SYNC_ENABLED || brandPopoverOpen) return;
    try{
      const res = await syncFetchBrands();
      if(res.v!==null && Array.isArray(res.v) && res.v.length && res.updated_at!==syncVersion){
        BRANDS = res.v;
        window.PortalBrand.list = BRANDS;
        localStorage.setItem(BRANDS_KEY, JSON.stringify(BRANDS));
        renderBrandTrigger();
      }
      syncVersion = res.updated_at;
    }catch(e){ /* sem conexão — segue com a cópia local */ }
  }

  // ============================================================
  // MENU DE NAVEGAÇÃO ENTRE FERRAMENTAS
  // ============================================================
  const NAV_ITEMS = [
    { href:'index.html', label:'Início', icon:'<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/>' },
    { href:'visual-editor.html', label:'Calendário de Postagens', icon:'<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>' },
    { href:'post-editor.html', label:'Editor de Posts', icon:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/><path d="m14 18 3-3"/>' },
    { href:'business-card-generator.html', label:'Gerador de Cartões', icon:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 10h5M7 14h3M15.5 10.5h2M15.5 14h2"/>' },
    { href:'intelligence-center.html', label:'Central de Inteligência', icon:'<path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2.3h6c0-1.1.4-1.8 1-2.3A7 7 0 0 0 12 2Z"/><path d="M9 18h6"/><path d="M10 22h4"/>' }
  ];
  function currentPageFile(){
    return (location.pathname.split('/').pop() || 'index.html');
  }
  function renderNavHtml(){
    const cur = currentPageFile();
    return `<nav class="portal-nav">${NAV_ITEMS.map(item=>{
      const active = cur === item.href;
      return `<a href="${item.href}" class="portal-nav-item${active?' active':''}">${svgIcon(item.icon)}<span>${escapeHtml(item.label)}</span></a>`;
    }).join('')}</nav>`;
  }

  // ============================================================
  // SELETOR DE MARCA — trigger + popover ancorado no <body> (mesma mecânica de
  // .icon-picker-trigger/.icon-picker-popover em app.js: a sidebar tem overflow-y:auto, que
  // cortaria um popover position:absolute preso nela)
  // ============================================================
  let brandPopoverOpen = false;
  let brandPopoverEl = null;

  function renderBrandTrigger(){
    const trigger = $('portalBrandTrigger'); if(!trigger) return;
    const b = activeBrand();
    trigger.innerHTML = `${brandAvatarHtml(b)}<span class="portal-brand-trigger-body"><span class="portal-brand-trigger-name">${escapeHtml(b.name)}</span></span><span class="portal-brand-trigger-chevron">${svgIcon('<path d="m6 9 6 6 6-6"/>', 14)}</span>`;
  }

  function closeBrandPopover(){
    if(brandPopoverEl && brandPopoverEl.parentNode) brandPopoverEl.parentNode.removeChild(brandPopoverEl);
    brandPopoverEl = null;
    brandPopoverOpen = false;
    const trigger = $('portalBrandTrigger');
    if(trigger) trigger.classList.remove('open');
    document.removeEventListener('mousedown', onDocClickClosePopover);
    window.removeEventListener('scroll', closeBrandPopover, true);
    window.removeEventListener('resize', closeBrandPopover);
  }
  function onDocClickClosePopover(ev){
    const trigger = $('portalBrandTrigger');
    if(brandPopoverEl && brandPopoverEl.contains(ev.target)) return;
    if(trigger && trigger.contains(ev.target)) return;
    closeBrandPopover();
  }

  // uma linha da lista: nome/curto/foto viram campos editáveis ao clicar no lápis (mesmo
  // padrão do botão de editar nome/nome curto/ícone de uma rede em Configurações > Redes, no app.js)
  let editingBrandId = null;

  function buildBrandRow(b){
    const row = document.createElement('div');
    if(editingBrandId === b.id){
      row.className = 'portal-brand-edit-fields';
      row.innerHTML = `<label class="pb-edit-photo" title="Alterar foto de perfil">${brandAvatarHtml(b)}<input type="file" accept="image/*" class="pb-edit-photo-input" style="display:none" /></label>
        <input type="text" class="pb-edit-name" value="${escapeHtml(b.name)}" placeholder="Nome da marca" />
        <input type="text" class="pb-edit-short" value="${escapeHtml(b.shortName||'')}" maxlength="4" placeholder="Curto" style="flex:0 0 52px" />`;
      const nameInput = row.querySelector('.pb-edit-name');
      const shortInput = row.querySelector('.pb-edit-short');
      const photoInput = row.querySelector('.pb-edit-photo-input');
      const commit = ()=>{
        const newName = nameInput.value.trim(); if(!newName) return;
        b.name = newName;
        b.shortName = shortInput.value.trim().toUpperCase() || newName.slice(0,2).toUpperCase();
        editingBrandId = null;
        saveBrands(BRANDS.slice());
        renderBrandTrigger();
        renderBrandPopoverList();
      };
      nameInput.addEventListener('keydown', ev=>{ if(ev.key==='Enter') commit(); if(ev.key==='Escape'){ editingBrandId=null; renderBrandPopoverList(); } });
      nameInput.addEventListener('blur', ()=> setTimeout(commit, 120));
      shortInput.addEventListener('keydown', ev=>{ if(ev.key==='Enter') commit(); });
      photoInput.addEventListener('click', ev=> ev.stopPropagation());
      photoInput.addEventListener('change', ()=>{
        const file = photoInput.files && photoInput.files[0]; if(!file) return;
        // a foto salva na hora, independente do nome/curto (que só commitam no blur/Enter) —
        // evita que trocar o foco pro seletor de arquivo dispare um commit de nome pela metade
        readBrandPhoto(file, dataUrl=>{
          b.photo = dataUrl;
          saveBrands(BRANDS.slice());
          renderBrandTrigger();
          renderBrandPopoverList();
        });
      });
    } else {
      row.className = 'portal-brand-row' + (b.id===ACTIVE_ID ? ' active' : '');
      row.innerHTML = `${brandAvatarHtml(b)}<span class="portal-brand-row-name">${escapeHtml(b.name)}</span><button type="button" class="portal-brand-row-edit" title="Editar marca" aria-label="Editar marca">${svgIcon('<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>', 13)}</button>`;
      row.addEventListener('click', ()=>{ if(b.id!==ACTIVE_ID) switchToBrand(b.id); });
      row.querySelector('.portal-brand-row-edit').addEventListener('click', ev=>{ ev.stopPropagation(); editingBrandId = b.id; renderBrandPopoverList(); });
    }
    return row;
  }

  function renderBrandPopoverList(){
    if(!brandPopoverEl) return;
    const list = brandPopoverEl.querySelector('.portal-brand-list');
    list.innerHTML = '';
    BRANDS.forEach(b=> list.appendChild(buildBrandRow(b)));
  }

  function positionPopover(el, anchor){
    const r = anchor.getBoundingClientRect();
    el.style.top = `${r.bottom + 6}px`;
    el.style.left = `${r.left}px`;
  }

  function openBrandPopover(){
    const trigger = $('portalBrandTrigger'); if(!trigger) return;
    brandPopoverEl = document.createElement('div');
    brandPopoverEl.className = 'portal-brand-popover';
    brandPopoverEl.innerHTML = `<div class="portal-brand-list"></div><div class="portal-brand-divider"></div><button type="button" class="portal-brand-add">${svgIcon('<path d="M12 5v14M5 12h14"/>', 14)}<span>Nova marca</span></button>`;
    document.body.appendChild(brandPopoverEl);
    renderBrandPopoverList();
    positionPopover(brandPopoverEl, trigger);
    brandPopoverEl.querySelector('.portal-brand-add').addEventListener('click', ()=>{ closeBrandPopover(); openNewBrandModal(); });
    trigger.classList.add('open');
    brandPopoverOpen = true;
    document.addEventListener('mousedown', onDocClickClosePopover);
    window.addEventListener('scroll', closeBrandPopover, true);
    window.addEventListener('resize', closeBrandPopover);
  }

  // ============================================================
  // MODAL "NOVA MARCA" — mesmo padrão .modal-backdrop/.modal usado pelo resto do app,
  // criado uma vez e reaproveitado a cada abertura
  // ============================================================
  let newBrandModalEl = null;
  let newBrandPhotoDataUrl = null;
  function buildNewBrandModal(){
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.id = 'newBrandBackdrop';
    backdrop.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
      <div class="modal-header">
        <h2>Nova marca</h2>
        <div class="modal-header-actions">
          <button type="button" class="modal-close" aria-label="Fechar">${svgIcon('<path d="M18 6 6 18"/><path d="M6 6l12 12"/>', 15)}</button>
        </div>
      </div>
      <div class="modal-body">
        <div style="display:flex;flex-direction:column;gap:10px">
          <div>
            <label>Nome da marca</label>
            <input id="newBrandName" type="text" placeholder="Ex: Vonder Pro" />
          </div>
          <div>
            <label>Nome curto</label>
            <input id="newBrandShort" type="text" placeholder="Ex: VP" maxlength="4" />
          </div>
          <div>
            <label>Foto de perfil</label>
            <label class="portal-brand-photo-upload" id="newBrandPhotoLabel">
              <span class="portal-brand-photo-preview" id="newBrandPhotoPreview">${svgIcon('<path d="M12 5v14M5 12h14"/>', 15)}</span>
              <span id="newBrandPhotoLabelText">Escolher foto</span>
              <input id="newBrandPhotoInput" type="file" accept="image/*" style="display:none" />
            </label>
          </div>
          <div style="font-size:11.5px;color:var(--text-faint)">Cria um Calendário de Postagens e uma Central de Inteligência próprios, sem nenhum dado das outras marcas.</div>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" id="cancelNewBrand" class="btn ghost">Cancelar</button>
        <button type="button" id="saveNewBrand" class="btn">Criar marca</button>
      </div>
    </div>`;
    document.body.appendChild(backdrop);
    const close = ()=>{ backdrop.style.display = 'none'; };
    backdrop.addEventListener('click', ev=>{ if(ev.target===backdrop) close(); });
    backdrop.querySelector('.modal-close').addEventListener('click', close);
    backdrop.querySelector('#cancelNewBrand').addEventListener('click', close);
    backdrop.querySelector('#newBrandPhotoInput').addEventListener('change', (ev)=>{
      const file = ev.target.files && ev.target.files[0]; if(!file) return;
      readBrandPhoto(file, dataUrl=>{
        newBrandPhotoDataUrl = dataUrl;
        $('newBrandPhotoPreview').innerHTML = `<img src="${dataUrl}" alt="" />`;
        $('newBrandPhotoLabelText').textContent = 'Trocar foto';
      });
    });
    backdrop.querySelector('#saveNewBrand').addEventListener('click', ()=>{
      const nameInput = $('newBrandName');
      const name = nameInput.value.trim();
      if(!name){ alert('Digite o nome da marca.'); return; }
      const shortInput = $('newBrandShort');
      const shortName = shortInput.value.trim().toUpperCase() || name.slice(0,2).toUpperCase();
      const id = generateBrandId();
      const next = BRANDS.concat([{ id, name, shortName, photo: newBrandPhotoDataUrl }]);
      saveBrands(next);
      switchToBrand(id);
    });
    return backdrop;
  }
  function openNewBrandModal(){
    if(!newBrandModalEl) newBrandModalEl = buildNewBrandModal();
    $('newBrandName').value = '';
    $('newBrandShort').value = '';
    newBrandPhotoDataUrl = null;
    $('newBrandPhotoInput').value = '';
    $('newBrandPhotoPreview').innerHTML = svgIcon('<path d="M12 5v14M5 12h14"/>', 15);
    $('newBrandPhotoLabelText').textContent = 'Escolher foto';
    newBrandModalEl.style.display = 'flex';
    $('newBrandName').focus();
  }

  // ============================================================
  // MODAL "CONFIGURAÇÕES" DO PORTAL — aberto pelo botão no rodapé da sidebar, em toda
  // página. Por enquanto só tem a aba Aparência (mesma funcionalidade da aba Aparência de
  // Configurações do calendário); a estrutura de abas já fica pronta pra receber mais seções
  // depois. IDs próprios (prefixo "portal") pra não colidir com o #settingsBackdrop que
  // visual-editor.html/app.js já tem na própria tela.
  // ============================================================
  let portalSettingsModalEl = null;
  function renderPortalColorGrid(){
    const grid = $('portalColorThemeGrid'); if(!grid) return;
    const hint = $('portalThemeSourceHint');
    if(getThemeSource() !== 'custom'){
      // fonte "brand": grid escondido — a cor vem da identidade pré-setada da marca ativa,
      // sem opção de escolha aqui (ver applyColorTheme/DEFAULT_BRANDS)
      grid.innerHTML = '';
      if(hint) hint.textContent = 'Cada marca usa a cor da própria identidade visual.';
      return;
    }
    if(hint) hint.textContent = 'Essa cor vale em qualquer marca que você acessar, no modo claro e escuro selecionado.';
    const current = getColorTheme();
    const customHex = localStorage.getItem(CUSTOM_COLOR_KEY) || '#F6BE00';
    const checkSvg = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
    const swatches = COLOR_THEMES.map(p=>{
      const selected = current === p.id;
      return `<button type="button" class="color-swatch${selected?' selected':''}" data-color-theme="${p.id}" title="${escapeHtml(p.name)}" style="--sw-dark:${p.dark};--sw-light:${p.light}">${selected? `<span class="color-swatch-check">${checkSvg}</span>` : ''}</button>`;
    }).join('');
    const customSelected = current === 'custom';
    const customSwatch = `<button type="button" class="color-swatch color-swatch-custom${customSelected?' selected':''}" data-color-theme="custom" title="Personalizada" style="--sw-dark:${customHex};--sw-light:${customHex}">${customSelected? `<span class="color-swatch-check">${checkSvg}</span>` : svgIcon('<path d="m2 22 1-4 12.5-12.5a2.12 2.12 0 0 1 3 3L6 21l-4 1Z"/><path d="m14.5 5.5 4 4"/>', 16)}<input type="color" id="portalCustomColorInput" value="${customHex}" title="Escolher cor personalizada" /></button>`;
    grid.innerHTML = swatches + customSwatch;
    grid.querySelectorAll('.color-swatch:not(.color-swatch-custom)').forEach(btn=>{
      btn.addEventListener('click', ()=> setColorTheme(btn.dataset.colorTheme));
    });
    const customInput = $('portalCustomColorInput');
    if(customInput){
      customInput.addEventListener('click', ev=> ev.stopPropagation());
      // ao vivo, enquanto arrasta o seletor: só reflete a cor na tela (sem gravar ainda, pra
      // não gravar um valor por pixel arrastado) — a gravação de fato acontece só no "change",
      // quando o usuário solta o seletor
      customInput.addEventListener('input', ()=>{
        localStorage.setItem(CUSTOM_COLOR_KEY, customInput.value);
        localStorage.setItem(COLOR_THEME_KEY, 'custom');
        applyColorTheme('custom');
      });
      customInput.addEventListener('change', ()=> renderPortalColorGrid());
    }
  }
  function buildPortalSettingsModal(){
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.id = 'portalSettingsBackdrop';
    backdrop.innerHTML = `<div class="modal modal--wide" role="dialog" aria-modal="true">
      <div class="modal-header">
        <h2>Configurações</h2>
        <div class="modal-header-actions">
          <button type="button" class="modal-close" aria-label="Fechar">${svgIcon('<path d="M18 6 6 18"/><path d="M6 6l12 12"/>', 15)}</button>
        </div>
      </div>
      <div class="modal-body">
        <div class="settings-layout">
          <div class="settings-sidebar" role="tablist">
            <button type="button" class="settings-nav-btn active" data-panel="portalSecAparencia">Aparência</button>
          </div>
          <div class="settings-content">
            <div class="settings-panel active" id="portalSecAparencia">
              <label>Modo</label>
              <div style="display:flex;gap:8px">
                <label class="chip"><input type="radio" name="portalSTheme" value="light" /> Claro</label>
                <label class="chip"><input type="radio" name="portalSTheme" value="dark" /> Escuro</label>
              </div>
              <label style="margin-top:10px">Tema de cor</label>
              <div style="display:flex;gap:8px">
                <label class="chip"><input type="radio" name="portalThemeSource" value="brand" /> Por marca</label>
                <label class="chip"><input type="radio" name="portalThemeSource" value="custom" /> Personalizado</label>
              </div>
              <div id="portalThemeSourceHint" style="font-size:11.5px;color:var(--text-faint);margin-top:6px"></div>
              <div id="portalColorThemeGrid" class="color-theme-grid"></div>
            </div>
          </div>
        </div>
      </div>
    </div>`;
    document.body.appendChild(backdrop);
    const close = ()=>{ backdrop.style.display = 'none'; };
    backdrop.addEventListener('click', ev=>{ if(ev.target===backdrop) close(); });
    backdrop.querySelector('.modal-close').addEventListener('click', close);
    // aba lateral escopada a este modal — não usa document.querySelectorAll pra não
    // interferir (nem sofrer interferência) do menu de Configurações do calendário, que já
    // faz sua própria troca de aba de forma global em app.js
    backdrop.querySelectorAll('.settings-nav-btn').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        backdrop.querySelectorAll('.settings-nav-btn').forEach(b=> b.classList.remove('active'));
        backdrop.querySelectorAll('.settings-panel').forEach(p=> p.classList.remove('active'));
        btn.classList.add('active');
        const panel = backdrop.querySelector('#'+btn.dataset.panel); if(panel) panel.classList.add('active');
      });
    });
    backdrop.querySelectorAll('input[name="portalSTheme"]').forEach(el=>{
      el.addEventListener('change', ()=> setTheme(el.value));
    });
    backdrop.querySelectorAll('input[name="portalThemeSource"]').forEach(el=>{
      el.addEventListener('change', ()=> setThemeSource(el.value));
    });
    return backdrop;
  }
  function openPortalSettingsModal(){
    if(!portalSettingsModalEl) portalSettingsModalEl = buildPortalSettingsModal();
    const current = localStorage.getItem(THEME_KEY) || 'light';
    const radio = portalSettingsModalEl.querySelector(`input[name="portalSTheme"][value="${current}"]`);
    if(radio) radio.checked = true;
    const sourceRadio = portalSettingsModalEl.querySelector(`input[name="portalThemeSource"][value="${getThemeSource()}"]`);
    if(sourceRadio) sourceRadio.checked = true;
    renderPortalColorGrid();
    portalSettingsModalEl.style.display = 'flex';
  }

  // ============================================================
  // RECOLHER/EXPANDIR A SIDEBAR — estado persistido, aplicado como classe no <aside>
  // ============================================================
  let sidebarCollapsed = localStorage.getItem(COLLAPSE_KEY) === '1';
  function applyCollapsedClass(){
    const el = $('portalSidebar'); if(!el) return;
    el.classList.toggle('collapsed', sidebarCollapsed);
  }
  function renderCollapseBtn(){
    const btn = $('portalCollapseBtn'); if(!btn) return;
    btn.title = sidebarCollapsed ? 'Expandir menu' : 'Recolher menu';
    btn.setAttribute('aria-label', btn.title);
    // ícone-only (sem texto), no estilo do botão quadradinho de recolher da referência
    btn.innerHTML = sidebarCollapsed
      ? svgIcon('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/><path d="m14 10 2 2-2 2"/>', 14)
      : svgIcon('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/><path d="m16 10-2 2 2 2"/>', 14);
  }
  function toggleSidebarCollapsed(){
    sidebarCollapsed = !sidebarCollapsed;
    localStorage.setItem(COLLAPSE_KEY, sidebarCollapsed ? '1' : '0');
    applyCollapsedClass();
    renderCollapseBtn();
  }

  // ============================================================
  // MONTAGEM DA SIDEBAR
  // ============================================================
  function renderSidebar(){
    const el = $('portalSidebar'); if(!el) return;
    el.innerHTML = `
      <div class="portal-topbar">
        <div class="portal-logo"><span class="portal-logo-mark">${svgIcon('<path d="m12 2 8.5 5-8.5 5-8.5-5Z"/><path d="m3.5 12 8.5 5 8.5-5"/><path d="m3.5 17 8.5 5 8.5-5"/>', 15)}</span><span class="portal-logo-text">Portal de Mídias</span></div>
        <button type="button" class="portal-collapse-btn" id="portalCollapseBtn"></button>
      </div>
      <div>
        <button type="button" class="portal-brand-trigger" id="portalBrandTrigger" aria-haspopup="true" aria-expanded="false"></button>
      </div>
      <div>
        ${renderNavHtml()}
      </div>
      <div style="margin-top:auto">
        <button type="button" class="portal-nav-item" id="portalSettingsBtn">${svgIcon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>')}<span>Configurações</span></button>
      </div>
    `;
    renderBrandTrigger();
    renderCollapseBtn();
    applyCollapsedClass();
    $('portalBrandTrigger').addEventListener('click', ()=>{ brandPopoverOpen ? closeBrandPopover() : openBrandPopover(); });
    $('portalCollapseBtn').addEventListener('click', toggleSidebarCollapsed);
    $('portalSettingsBtn').addEventListener('click', openPortalSettingsModal);
  }

  renderSidebar();

  if(SYNC_ENABLED){
    syncPullBrands();
    setInterval(syncPullBrands, 20000);
  }

})();

