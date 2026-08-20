    // ============================================================
    // ESTADO GLOBAL DA APLICAÇÃO
    // ============================================================
    // Estado principal: lista de postagens do calendário
    const state = { posts: [] };

    const $ = id => document.getElementById(id);
    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    // Mês inicial exibido (contexto atual do projeto). Navegação livre a partir daqui.
    let viewDate = new Date(2026,7,18);
    let activeTab = 'All';
    let currentView = 'month'; // 'month' | 'week' | 'list'
    // alturas das células do dia capturadas por buildCalendar() logo antes de reconstruir o grid;
    // render() consome isso no final pra animar a troca de altura das linhas (ver ambas as funções)
    let pendingRowHeights = null;
    // meta configurável (persistida nas Configurações)
    let TARGET = 3;
    let isEditing = false;
    let editingId = null;
    // estado dos filtros aplicados ao calendário/lista
    const filters = { editorias: [], places: [], types: [], statuses: [], collab: 'any' };
    // modo de seleção múltipla / edição em lote
    let selectMode = false;
    const selectedIds = new Set();
    // produtos selecionados no modal de criar/editar postagem: [{code,name}, ...]
    let selectedProducts = [];

    // ============================================================
    // TEMA (claro/escuro) — aplicado o quanto antes para evitar um
    // "flash" da tela clara antes do tema salvo ser lido. A opção fica
    // dentro de Configurações > Aparência e é aplicada imediatamente.
    // ============================================================
    const THEME_KEY = 'calendar_theme_v1';
    function applyTheme(theme){
      document.documentElement.setAttribute('data-theme', theme);
      const el = document.querySelector(`input[name="sTheme"][value="${theme}"]`);
      if(el) el.checked = true;
    }
    function setTheme(theme){
      localStorage.setItem(THEME_KEY, theme);
      applyTheme(theme);
      applyColorTheme(getColorTheme());
    }
    applyTheme(localStorage.getItem(THEME_KEY) || 'light');

    // ============================================================
    // COR DO TEMA — paleta de destaque (accent) do calendário. Cada
    // opção traz uma cor para o modo escuro e outra para o modo claro;
    // ao trocar, recalcula --accent/--accent-ink/--accent-hover/
    // --accent-weak/--on-accent na hora, sem precisar de "Salvar".
    // ============================================================
    const COLOR_THEME_KEY = 'calendar_color_theme_v1';
    const CUSTOM_COLOR_KEY = 'calendar_color_theme_custom_v1';
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
    function getColorTheme(){ return localStorage.getItem(COLOR_THEME_KEY) || 'dourado'; }
    function hexToRgbObj(hex){
      const h = (hex||'#000000').replace('#','');
      const full = h.length===3 ? h.split('').map(c=>c+c).join('') : h;
      const n = parseInt(full,16) || 0;
      return { r:(n>>16)&255, g:(n>>8)&255, b:n&255 };
    }
    function rgbToHex(r,g,b){
      return '#'+[r,g,b].map(v=> Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');
    }
    // mistura hex com withHex; amount 0..1 = quanto de withHex entra na mistura
    function mixHex(hex, withHex, amount){
      const a = hexToRgbObj(hex), b = hexToRgbObj(withHex);
      return rgbToHex(a.r+(b.r-a.r)*amount, a.g+(b.g-a.g)*amount, a.b+(b.b-a.b)*amount);
    }
    // luminância relativa (WCAG) — usada pra decidir se um texto claro ou escuro
    // fica mais legível em cima de uma cor de destaque
    function relLuminance(hex){
      const { r, g, b } = hexToRgbObj(hex);
      const chan = v=>{ v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); };
      return 0.2126*chan(r) + 0.7152*chan(g) + 0.0722*chan(b);
    }
    // razão de contraste WCAG entre duas luminâncias relativas
    function contrastRatio(l1, l2){ const a = Math.max(l1,l2), b = Math.min(l1,l2); return (a+0.05)/(b+0.05); }
    // escolhe #1a1a1a ou #ffffff, o que der mais contraste em cima da cor de fundo dada
    function pickOnColor(hex){
      const l = relLuminance(hex);
      return contrastRatio(l,0) >= contrastRatio(l,1) ? '#1a1a1a' : '#ffffff';
    }
    function applyColorTheme(id){
      let dark, light;
      if(id === 'custom'){
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
      root.setProperty('--on-accent', pickOnColor(accent));
      // contraste mínimo ~4.5:1 contra fundo branco corresponde a luminância <= ~0.18
      const ink = mode === 'dark'
        ? dark
        : (relLuminance(dark) <= 0.18 ? dark : mixHex(dark, '#000000', 0.4));
      root.setProperty('--accent-ink', ink);
    }
    function setColorTheme(id){
      localStorage.setItem(COLOR_THEME_KEY, id);
      applyColorTheme(id);
      renderColorThemeGrid();
    }
    function renderColorThemeGrid(){
      const grid = $('colorThemeGrid'); if(!grid) return;
      const current = getColorTheme();
      const customHex = localStorage.getItem(CUSTOM_COLOR_KEY) || '#F6BE00';
      const checkSvg = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
      const swatches = COLOR_THEMES.map(p=>{
        const selected = current === p.id;
        return `<button type="button" class="color-swatch${selected?' selected':''}" data-color-theme="${p.id}" title="${escapeHtml(p.name)}" style="--sw-dark:${p.dark};--sw-light:${p.light}">${selected? `<span class="color-swatch-check">${checkSvg}</span>` : ''}</button>`;
      }).join('');
      const customSelected = current === 'custom';
      const customSwatch = `<button type="button" class="color-swatch color-swatch-custom${customSelected?' selected':''}" data-color-theme="custom" title="Personalizada" style="--sw-dark:${customHex};--sw-light:${customHex}">${customSelected? `<span class="color-swatch-check">${checkSvg}</span>` : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="m2 22 1-4 12.5-12.5a2.12 2.12 0 0 1 3 3L6 21l-4 1Z"/><path d="m14.5 5.5 4 4"/></svg>'}<input type="color" id="customColorInput" value="${customHex}" title="Escolher cor personalizada" /></button>`;
      grid.innerHTML = swatches + customSwatch;
      grid.querySelectorAll('.color-swatch:not(.color-swatch-custom)').forEach(btn=>{
        btn.addEventListener('click', ()=> setColorTheme(btn.dataset.colorTheme));
      });
      const customInput = $('customColorInput');
      if(customInput){
        customInput.addEventListener('click', ev=> ev.stopPropagation());
        // 'input' dispara continuamente enquanto o usuário arrasta no seletor nativo de cor:
        // só aplica ao vivo (sem recriar o grid, senão o picker aberto pode fechar no meio do
        // arraste). O grid só é re-renderizado em 'change', quando a escolha é confirmada.
        customInput.addEventListener('input', ()=>{
          localStorage.setItem(CUSTOM_COLOR_KEY, customInput.value);
          localStorage.setItem(COLOR_THEME_KEY, 'custom');
          applyColorTheme('custom');
        });
        customInput.addEventListener('change', ()=> renderColorThemeGrid());
      }
    }
    applyColorTheme(getColorTheme());
    renderColorThemeGrid();

    // ============================================================
    // HELPERS DE COR E EXIBIÇÃO — cores de tags/status, ícones de rede,
    // normalização de texto e montagem de URL de imagem de produto
    // ============================================================
    const TAG_PALETTE = ['#7c3aed','#0284c7','#16a34a','#b45309','#dc2626','#db2777','#0d9488','#4f46e5','#65a30d','#ea580c'];
    function hexToRgba(hex, alpha){
      const h = (hex||'#F6BE00').replace('#','');
      const full = h.length===3 ? h.split('').map(c=>c+c).join('') : h;
      const n = parseInt(full,16) || 0xF6BE00;
      const r=(n>>16)&255,g=(n>>8)&255,b=n&255;
      return `rgba(${r},${g},${b},${alpha})`;
    }
    function tagColor(name, list){
      const idx = (list||[]).indexOf(name);
      return TAG_PALETTE[(idx<0?0:idx) % TAG_PALETTE.length];
    }
    function statusColor(name){
      const s = APP_SETTINGS.statuses.find(x=>x.name===name);
      return (s && s.color) || '#94a3b8';
    }
    function networkColor(name){
      const n = (APP_SETTINGS.networks||[]).find(x=>x.name===name);
      if(n && n.color) return n.color;
      return tagColor(name, (APP_SETTINGS.networks||[]).map(x=>x.name));
    }
    // ícones coloridos oficiais (arquivos em icons/) — usados quando o nome da rede bate com um
    // preset conhecido, ou quando a rede tem um ícone explícito (preset escolhido ou SVG customizado
    // enviado em Configurações → Redes)
    const PRESET_ICONS = {
      instagram: 'icons/instagram.svg',
      facebook: 'icons/facebook.svg',
      twitter: 'icons/twitter.svg',
      linkedin: 'icons/linkedin.svg',
      youtube: 'icons/youtube.svg',
      tiktok: 'icons/tiktok.svg'
    };
    function normalizeIconKey(s){
      return (s||'').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
    }
    function resolveNetworkIconSrc(name){
      const n = (APP_SETTINGS.networks||[]).find(x=>x.name===name);
      if(n && n.icon){
        if(n.icon.type==='custom' && n.icon.dataUrl) return n.icon.dataUrl;
        if(n.icon.type==='preset' && PRESET_ICONS[n.icon.key]) return PRESET_ICONS[n.icon.key];
      }
      const key = normalizeIconKey(name);
      if(PRESET_ICONS[key]) return PRESET_ICONS[key];
      return null;
    }
    function networkIcon(name){
      const src = resolveNetworkIconSrc(name);
      if(src) return `<img class="net-icon-img" src="${escapeHtml(src)}" alt="${escapeHtml(name)}" />`;
      return ICONS[name] || `<span class="dot" style="background:${networkColor(name)}"></span>`;
    }
    // seletor de ícone de rede: um botão-gatilho circular (mostra o ícone atual) que abre um
    // popover com os presets coloridos (icons/*.svg) + opção de enviar um SVG próprio, em vez de
    // jogar tudo numa fileira inline (que quebrava linha de forma torta ao lado dos outros campos
    // da linha, na edição de uma rede já cadastrada).
    // `current` é o valor salvo em n.icon ({type:'preset',key} | {type:'custom',dataUrl} | null);
    // `onChange` é chamado com o novo valor sempre que o usuário escolhe outra opção.
    function renderIconPicker(container, current, onChange){
      if(!container) return;
      container.innerHTML = '';
      container.className = (container.className ? container.className + ' ' : '') + 'icon-picker-wrap';

      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'icon-picker-trigger';
      trigger.title = 'Escolher ícone da rede';
      trigger.setAttribute('aria-haspopup', 'true');
      trigger.setAttribute('aria-expanded', 'false');
      if(current && current.type==='custom' && current.dataUrl) trigger.innerHTML = `<img src="${current.dataUrl}" alt="ícone personalizado" />`;
      else if(current && current.type==='preset' && PRESET_ICONS[current.key]) trigger.innerHTML = `<img src="${PRESET_ICONS[current.key]}" alt="${current.key}" />`;
      else trigger.innerHTML = '<span class="icon-picker-none">–</span>';

      // o popover é ancorado ao <body> (não fica dentro de `container`) porque o gatilho costuma
      // estar dentro de uma linha de rede com overflow:hidden (truque do cantos arredondados) ou
      // de um painel de Configurações com scroll — um popover position:absolute preso ali dentro
      // seria cortado. Fica desanexado do body exceto enquanto estiver aberto.
      const popover = document.createElement('div');
      popover.className = 'icon-picker-popover';

      function positionPopover(){
        const r = trigger.getBoundingClientRect();
        popover.style.top = `${r.bottom + 6}px`;
        popover.style.left = `${r.left}px`;
      }
      function closePopover(){
        if(popover.parentNode) popover.parentNode.removeChild(popover);
        trigger.classList.remove('open');
        trigger.setAttribute('aria-expanded', 'false');
        document.removeEventListener('mousedown', onDocClick);
        window.removeEventListener('scroll', closePopover, true);
        window.removeEventListener('resize', closePopover);
      }
      function onDocClick(ev){ if(!container.contains(ev.target) && !popover.contains(ev.target)) closePopover(); }
      function openPopover(){
        document.querySelectorAll('.icon-picker-popover').forEach(el=>{ if(el.parentNode) el.parentNode.removeChild(el); });
        document.querySelectorAll('.icon-picker-trigger.open').forEach(el=> el.classList.remove('open'));
        document.body.appendChild(popover);
        positionPopover();
        trigger.classList.add('open');
        trigger.setAttribute('aria-expanded', 'true');
        document.addEventListener('mousedown', onDocClick);
        window.addEventListener('scroll', closePopover, true);
        window.addEventListener('resize', closePopover);
      }
      trigger.addEventListener('click', ()=> popover.parentNode ? closePopover() : openPopover());

      const pick = (val)=>{ onChange(val); closePopover(); };

      const grid = document.createElement('div');
      grid.className = 'icon-picker-grid';

      const noneBtn = document.createElement('button');
      noneBtn.type = 'button';
      noneBtn.className = 'icon-picker-opt' + (!current ? ' selected' : '');
      noneBtn.title = 'Sem ícone';
      noneBtn.innerHTML = '<span class="icon-picker-none">–</span>';
      noneBtn.addEventListener('click', ()=> pick(null));
      grid.appendChild(noneBtn);

      Object.keys(PRESET_ICONS).forEach(key=>{
        const btn = document.createElement('button');
        btn.type = 'button';
        const isSel = !!(current && current.type==='preset' && current.key===key);
        btn.className = 'icon-picker-opt' + (isSel ? ' selected' : '');
        btn.title = key;
        btn.innerHTML = `<img src="${PRESET_ICONS[key]}" alt="${key}" />`;
        btn.addEventListener('click', ()=> pick({ type:'preset', key }));
        grid.appendChild(btn);
      });
      popover.appendChild(grid);

      const isCustom = !!(current && current.type==='custom' && current.dataUrl);
      const uploadBtn = document.createElement('label');
      uploadBtn.className = 'icon-picker-upload-btn' + (isCustom ? ' selected' : '');
      uploadBtn.innerHTML = `${isCustom ? `<img src="${current.dataUrl}" alt="ícone personalizado" class="icon-picker-upload-preview" />` : UI_ICONS.upload(15)}<span>${isCustom ? 'Trocar arquivo personalizado' : 'Subir arquivo personalizado'}</span>`;
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = '.svg,image/svg+xml';
      fileInput.style.display = 'none';
      fileInput.addEventListener('click', ev=> ev.stopPropagation());
      fileInput.addEventListener('change', ()=>{
        const file = fileInput.files && fileInput.files[0];
        if(!file) return;
        if(!/\.svg$/i.test(file.name) && file.type !== 'image/svg+xml'){ alert('Envie um arquivo .svg'); fileInput.value=''; return; }
        if(file.size > 100*1024){ alert('SVG muito grande (máx. 100KB).'); fileInput.value=''; return; }
        const reader = new FileReader();
        reader.onload = ()=>{
          // remove <script> e handlers "on*" por precaução (o <img> já bloqueia execução de script,
          // isso é só uma camada extra de higiene antes de guardar o SVG)
          let svgText = String(reader.result || '')
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
            .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '');
          const dataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgText)));
          pick({ type:'custom', dataUrl });
        };
        reader.readAsText(file);
      });
      uploadBtn.appendChild(fileInput);
      popover.appendChild(uploadBtn);

      container.appendChild(trigger);
      container.appendChild(popover);
    }
    // nome curto da rede (ex: "IG"), usado em exibições compactas — cai para o nome completo se não houver
    function networkShortName(name){
      const n = (APP_SETTINGS.networks||[]).find(x=>x.name===name);
      return (n && n.shortName) || name || '';
    }

    // normaliza rede(s)/tipo(s)/formato(s) de uma postagem numa lista de { channel, types, places }.
    // Usa post.channels quando presente — postagens geradas a partir do agendamento de uma
    // editoria cobrem várias redes de uma vez, cada uma com seus próprios tipos e formatos — e
    // cai para uma lista de um item só a partir dos campos legados (channel/place/type) usados
    // pelas postagens criadas manualmente pelo modal (uma rede por postagem).
    function postChannelEntries(p){
      if(Array.isArray(p.channels) && p.channels.length>0) return p.channels;
      if(!p.channel) return [];
      return [{ channel: p.channel, types: [p.type||'Static'], places: Array.isArray(p.place)?p.place.slice():[p.place].filter(Boolean) }];
    }
    // texto legível com o detalhe completo de redes/formatos/tipos de uma postagem — usado em tooltips
    function postChannelsDetailText(p){
      return postChannelEntries(p).map(c=>{
        const typesLabel = (c.types||[]).map(t=> t==='Video'?'Vídeo':'Estático').join('/');
        return `${networkShortName(c.channel)}: ${(c.places||[]).join(', ')}${typesLabel?` (${typesLabel})`:''}`;
      }).join(' · ');
    }
    // true se as redes da postagem têm tipos/formatos diferentes entre si — só acontece em cards
    // vindos do agendamento de uma editoria (cada rede pode ter sua própria combinação). Nesse
    // caso o modal simples (um Tipo + um conjunto de Formatos para a postagem toda) não consegue
    // representar a distribuição, então Formato/Tipo/Redes ficam travados na edição.
    function isHeterogeneousChannels(entries){
      if(entries.length<=1) return false;
      const sig = e=> JSON.stringify([(e.types||[]).slice().sort(), (e.places||[]).slice().sort()]);
      const first = sig(entries[0]);
      return entries.some(e=> sig(e)!==first);
    }
    function normalizeStr(s){
      return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
    }
    // remove pontos/espaços/traços de um código de produto, para comparar independente de formatação
    // (ex: "16.62.075.001" e "1662075001" devem casar)
    function normalizeCode(s){
      return String(s||'').replace(/[.\s-]/g,'').toLowerCase();
    }
    function productImageUrl(code){
      const digits = String(code||'').replace(/\D/g,'');
      if(!digits) return '';
      // O host de imagens estáticas da Vonder bloqueia embeds <img> de outros sites
      // (proteção contra hotlink além de um simples check de Referer — só "no-referrer"
      // não bastou). Por isso passamos por um proxy público que busca a imagem no servidor.
      const origin = `www.vonder.com.br/estatico/vonder/temp/320_${digits}.jpg`;
      return `https://images.weserv.nl/?url=${encodeURIComponent(origin)}`;
    }

    // ============================================================
    // PRODUTOS SELECIONADOS NO MODAL — chips de produto escolhidos
    // para a postagem em criação/edição
    // ============================================================
    function hideProductSuggestions(){
      const box = $('productSuggestions'); if(box){ box.style.display = 'none'; box.innerHTML = ''; }
    }

    // lê os produtos de uma postagem, migrando o formato antigo (productCode/productName únicos)
    function getPostProducts(post){
      if(Array.isArray(post.products) && post.products.length) return post.products;
      if(post.productCode || post.productName) return [{ code: post.productCode||'', name: post.productName||'' }];
      return [];
    }

    function renderSelectedProducts(){
      const wrap = $('selectedProductsList'); if(!wrap) return;
      wrap.innerHTML = '';
      selectedProducts.forEach((p, idx)=>{
        const chip = document.createElement('span'); chip.className = 'product-chip';
        const img = p.code ? `<img src="${productImageUrl(p.code)}" alt="" referrerpolicy="no-referrer" onerror="this.style.display='none'" />` : '';
        chip.innerHTML = `${img}<div class="pc-body"><span class="pc-name">${escapeHtml(p.name)}</span>${p.code?`<span class="pc-code">${escapeHtml(p.code)}</span>`:''}</div><button type="button" class="pc-remove" data-idx="${idx}" aria-label="Remover produto">${UI_ICONS.x(12)}</button>`;
        wrap.appendChild(chip);
      });
      wrap.querySelectorAll('.pc-remove').forEach(bt=> bt.addEventListener('click', ()=>{ const i = parseInt(bt.dataset.idx,10); selectedProducts.splice(i,1); renderSelectedProducts(); }));
      refreshModalDynamic();
    }

    // ============================================================
    // SUGESTÃO DE TÍTULO — gera propostas de título a partir do(s)
    // produto(s), editoria(s) e rede(s) escolhidos no modal
    // ============================================================
    // encurta um nome de catálogo como "Adesivo instantâneo cianoacrilato, 7,5 g, blister, VONDER"
    // para "Adesivo instantâneo cianoacrilato", pronto para entrar num título
    function shortenProductName(name){
      let n = String(name||'').replace(/,\s*VONDER\s*$/i, '').trim();
      const commaIdx = n.indexOf(',');
      if(commaIdx > 0) n = n.slice(0, commaIdx);
      return n.trim();
    }

    const EDITORIA_TITLE_TEMPLATES = {
      'Lançamentos': p => `Lançamento: ${p}`,
      'Dica VONDER': p => `Dica VONDER: como usar o ${p}`,
      'Destaques': p => `Destaque da semana: ${p}`,
      'Informativo': p => `Saiba mais sobre o ${p}`
    };
    const NETWORK_TITLE_TEMPLATES = {
      Instagram: p => `Confira o ${p} da VONDER`,
      Twitter: p => `${p} já disponível!`,
      LinkedIn: p => `VONDER apresenta: ${p}`,
      Blog: p => `Blog: conheça o ${p}`,
      Email: p => `Novidade VONDER: ${p}`
    };
    // ângulos extras, inspirados em formatos comuns de marketing de conteúdo (listas,
    // dicas, perguntas, como fazer, prova social...), para variar além dos templates de editoria/rede
    const GENERIC_ANGLE_TEMPLATES = [
      p => `${pickListNumber()} lugares para usar o ${p}`,
      p => `${pickListNumber()} dicas para tirar o máximo do ${p}`,
      p => `Você já conhece o ${p}?`,
      p => `Como o ${p} facilita seu trabalho`,
      p => `Como usar o ${p} corretamente`,
      p => `Chegou: ${p}`,
      p => `Por que profissionais recomendam o ${p}`,
      p => `Guia rápido: ${p}`,
      p => `Onde usar o ${p} no dia a dia`,
      p => `Resolva seu problema com o ${p}`
    ];
    function pickListNumber(){ const nums = [3,5,7]; return nums[Math.floor(Math.random()*nums.length)]; }

    function joinProductNames(names){
      return names.length===1 ? names[0]
        : names.length===2 ? `${names[0]} e ${names[1]}`
        : `${names.slice(0,-1).join(', ')} e ${names[names.length-1]}`;
    }

    function suggestTitles(count){
      if(selectedProducts.length===0) return [];
      const nets = Array.from(document.querySelectorAll('.mNet:checked')).map(n=>n.value);
      if(nets.length===0) return [];
      const names = selectedProducts.map(p=>shortenProductName(p.name)).filter(Boolean);
      if(names.length===0) return [];
      const productPhrase = joinProductNames(names);
      const editorias = Array.from(document.querySelectorAll('.mEditoria:checked')).map(e=>e.value);

      const candidates = [];
      editorias.forEach(ed=>{ if(EDITORIA_TITLE_TEMPLATES[ed]) candidates.push(EDITORIA_TITLE_TEMPLATES[ed](productPhrase)); });
      const netTpl = NETWORK_TITLE_TEMPLATES[nets[0]];
      if(netTpl) candidates.push(netTpl(productPhrase));
      const shuffled = GENERIC_ANGLE_TEMPLATES.slice().sort(()=>Math.random()-0.5);
      for(const fn of shuffled){ if(candidates.length>=count) break; candidates.push(fn(productPhrase)); }
      return Array.from(new Set(candidates)).slice(0, count);
    }

    function renderTitleSuggestion(){
      const box = $('titleSuggestion'); if(!box) return;
      if($('mTitle').value.trim()){ box.style.display = 'none'; return; }
      const suggestions = suggestTitles(3);
      if(suggestions.length===0){ box.style.display = 'none'; return; }
      box.innerHTML = `<div class="ts-header"><span class="ts-icon">${UI_ICONS.idea(13)}</span><span>Sugestões de título</span><button type="button" class="ts-shuffle" title="Gerar outras opções">${UI_ICONS.shuffle(13)}</button></div>` +
        suggestions.map(s=>`<div class="ts-option"><span class="ts-text">${escapeHtml(s)}</span><button type="button" class="ts-use" data-text="${escapeHtml(s)}">Usar</button></div>`).join('');
      box.querySelectorAll('.ts-use').forEach(bt=> bt.addEventListener('click', ()=>{ $('mTitle').value = bt.dataset.text; box.style.display = 'none'; refreshModalDynamic(); }));
      box.querySelector('.ts-shuffle').addEventListener('click', renderTitleSuggestion);
      box.style.display = 'flex';
    }

    // ============================================================
    // SUGESTÕES DE CONTEÚDO — 3 pautas com estrutura recomendada,
    // de acordo com a(s) editoria(s) marcada(s) no modal
    // ============================================================
    // frase do produto para entrar nas sugestões ("o <produto>"); cai para um termo
    // genérico quando nada foi selecionado ainda, pra sugestão nunca ficar vazia
    function contentProductPhrase(){
      if(selectedProducts.length===0) return 'produto';
      const names = selectedProducts.map(p=>shortenProductName(p.name)).filter(Boolean);
      return names.length ? joinProductNames(names) : 'produto';
    }

    // cada editoria tem exatamente 3 pautas fixas, com estrutura (gancho/desenvolvimento/CTA)
    // e boas práticas de web/formato — pensadas pro objetivo específico daquela editoria
    const CONTENT_SUGGESTIONS_BY_EDITORIA = {
      'Informativo': [
        p => ({ subject: `Como escolher a ferramenta certa para cada tipo de reparo`,
          structure: `<b>Gancho:</b> parta de uma dúvida comum do público. <b>Desenvolvimento:</b> explique o critério de escolha em 3 passos simples. <b>CTA:</b> convide a conferir o catálogo. <b>Boas práticas web:</b> título claro e buscável (SEO), parágrafos curtos e escaneáveis, uma imagem por ideia.` }),
        p => ({ subject: `Curiosidades técnicas sobre ${p} que poucas pessoas conhecem`,
          structure: `<b>Gancho:</b> um dado ou fato pouco conhecido. <b>Desenvolvimento:</b> 2-3 curiosidades em linguagem simples. <b>CTA:</b> reforce a autoridade da marca no tema. <b>Boas práticas web:</b> use bullet points, evite jargão sem explicação, capriche no alt text das imagens.` }),
        p => ({ subject: `Perguntas frequentes sobre uso e conservação de ${p}`,
          structure: `<b>Formato:</b> FAQ com 3-5 perguntas reais de clientes. <b>Desenvolvimento:</b> respostas objetivas e diretas. <b>CTA:</b> convide a tirar dúvidas nos comentários/DM. <b>Boas práticas web:</b> hierarquia visual clara (pergunta em destaque, resposta abaixo), facilita compartilhamento.` })
      ],
      'Destaques': [
        p => ({ subject: `Os produtos mais vendidos da semana e por que os profissionais confiam neles`,
          structure: `<b>Gancho:</b> prova social (número de vendas/avaliações). <b>Desenvolvimento:</b> 2-3 diferenciais técnicos. <b>CTA:</b> confira a linha completa. <b>Boas práticas web:</b> depoimentos reais quando possível, imagens de alta qualidade do produto em uso.` }),
        p => ({ subject: `Comparativo rápido: qual ${p} combina com a sua necessidade`,
          structure: `<b>Desenvolvimento:</b> 2-3 opções lado a lado, com o diferencial de cada uma. <b>CTA:</b> oriente a escolha e direcione para falar com um consultor. <b>Boas práticas web:</b> tabela ou carrossel comparativo, texto direto ao ponto.` }),
        p => ({ subject: `Bastidores da qualidade: como a VONDER testa seus produtos`,
          structure: `<b>Gancho:</b> processo/controle de qualidade como história. <b>Desenvolvimento:</b> prova de autoridade (certificações, testes). <b>CTA:</b> reforce confiança na marca. <b>Boas práticas web:</b> storytelling autêntico, carrossel ou vídeo curto funcionam bem aqui.` })
      ],
      'Lançamentos': [
        p => ({ subject: `Chegou ${p}: a novidade que resolve um problema comum`,
          structure: `<b>Atenção:</b> anúncio forte logo na primeira frase. <b>Interesse:</b> o problema que resolve. <b>Desejo:</b> benefícios e diferenciais. <b>Ação:</b> onde comprar/saiba mais. <b>Boas práticas web:</b> use urgência real (edição limitada, pré-venda), link direto na bio/primeiro comentário.` }),
        p => ({ subject: `Antes e depois: o que muda no seu trabalho com ${p}`,
          structure: `<b>Desenvolvimento:</b> mostre o cenário anterior (dor) → a solução (o lançamento) → o resultado (transformação). <b>CTA:</b> compre agora/saiba mais. <b>Boas práticas web:</b> vídeo ou comparação visual antes/depois performa melhor, legenda curta e direta.` }),
        p => ({ subject: `5 motivos para conhecer ${p} hoje`,
          structure: `<b>Formato:</b> lista numerada, um benefício claro por item (não só característica). <b>CTA:</b> saiba mais/compre. <b>Boas práticas web:</b> use números ímpares (3, 5, 7), o primeiro e o último item são os mais fortes.` })
      ],
      'Dica VONDER': [
        p => ({ subject: `Como usar ${p} com segurança e eficiência`,
          structure: `<b>Formato:</b> passo a passo numerado (3-5 passos). <b>Desenvolvimento:</b> um verbo de ação por passo. <b>CTA:</b> dica extra de especialista no fim. <b>Boas práticas web:</b> vídeo curto ou carrossel funciona melhor para tutoriais.` }),
        p => ({ subject: `Erro comum que reduz a vida útil de ${p} (e como evitar)`,
          structure: `<b>Gancho:</b> o erro/mito comum. <b>Desenvolvimento:</b> por que ele prejudica o resultado. <b>CTA:</b> mostre o jeito correto. <b>Boas práticas web:</b> título com gatilho de curiosidade, imagem clara do "jeito certo".` }),
        p => ({ subject: `Truque rápido: economize tempo usando ${p} desta forma`,
          structure: `<b>Formato:</b> dica única e direta, com demonstração visual. <b>CTA:</b> convide a testar e compartilhar o resultado. <b>Boas práticas web:</b> ótimo para Reels/Stories, use texto na tela para quem assiste sem áudio.` })
      ],
      'Trend': [
        p => ({ subject: `Como aproveitar a tendência do momento no dia a dia de trabalho`,
          structure: `<b>Desenvolvimento:</b> conecte a tendência ao universo da marca de forma natural, aplicando com o produto. <b>CTA:</b> leve e participativo. <b>Boas práticas web:</b> aja rápido (newsjacking), use os formatos/áudios em alta da rede, mantenha o tom autêntico.` }),
        p => ({ subject: `Desafio ou meme do momento adaptado para o universo VONDER`,
          structure: `<b>Formato:</b> use o formato viral já conhecido do público, com um toque de humor ligado ao produto. <b>CTA:</b> convide a interagir/marcar alguém. <b>Boas práticas web:</b> não force a venda dentro do trend, priorize entretenimento e responda comentários rápido.` }),
        p => ({ subject: `Opinião rápida da marca sobre um assunto em alta no setor`,
          structure: `<b>Gancho:</b> traga o fato/notícia em alta. <b>Desenvolvimento:</b> posicione a marca com uma opinião curta e relevante. <b>CTA:</b> pergunta que abre a conversa. <b>Boas práticas web:</b> texto curto, cuidado com temas sensíveis, funciona bem em LinkedIn/Twitter.` })
      ],
      'Personalizado': [
        p => ({ subject: `Defina aqui o tema específico desta campanha personalizada`,
          structure: `<b>Antes de tudo:</b> defina objetivo e público-alvo da peça. <b>Estrutura:</b> gancho, desenvolvimento e CTA claros, com tom adaptado à ocasião. <b>Boas práticas web:</b> uma única mensagem central por peça, CTA único e mensurável.` }),
        p => ({ subject: `Conteúdo sob demanda alinhado a uma data ou ação comercial específica`,
          structure: `<b>Desenvolvimento:</b> parta do briefing/ação comercial e construa a narrativa em torno do motivo (data, parceria, evento). <b>CTA:</b> específico da ação. <b>Boas práticas web:</b> confirme prazos e aprovações antes da produção, mantenha a identidade visual da marca.` }),
        p => ({ subject: `Colaboração ou parceria com conteúdo sob medida`,
          structure: `<b>Desenvolvimento:</b> apresente o parceiro/contexto e destaque o valor conjunto para o público. <b>CTA:</b> direcione para a ação combinada (link, evento, sorteio). <b>Boas práticas web:</b> alinhe expectativas com o parceiro antes de publicar, use marcação cruzada quando fizer sentido.` })
      ]
    };

    // monta até 3 sugestões combinando as editorias marcadas em rodízio (1ª de cada editoria,
    // depois a 2ª de cada...) — assim o bloco mostra sempre 3 opções, tanto com uma única
    // editoria marcada (as 3 dela) quanto com várias (uma de cada, até completar 3)
    function pickContentSuggestions(){
      const editorias = Array.from(document.querySelectorAll('.mEditoria:checked')).map(e=>e.value);
      if(editorias.length===0) return [];
      const p = contentProductPhrase();
      const lists = editorias.map(ed=>{
        const gens = CONTENT_SUGGESTIONS_BY_EDITORIA[ed] || CONTENT_SUGGESTIONS_BY_EDITORIA['Personalizado'];
        return gens.map(fn=> Object.assign({ editoria: ed }, fn(p)));
      });
      const result = [];
      for(let i=0; result.length<3; i++){
        let addedAny = false;
        for(const list of lists){ if(i < list.length){ result.push(list[i]); addedAny = true; if(result.length>=3) break; } }
        if(!addedAny) break;
      }
      return result;
    }

    function renderContentSuggestions(){
      const box = $('contentSuggestions'); if(!box) return;
      const multiEditoria = document.querySelectorAll('.mEditoria:checked').length > 1;
      const suggestions = pickContentSuggestions();
      if(suggestions.length===0){ box.innerHTML = `<div class="cs-empty">Selecione uma editoria em Categorização para ver sugestões de pauta.</div>`; return; }
      box.innerHTML = `<div class="cs-list">${suggestions.map((s,idx)=>`<div class="cs-card">${multiEditoria?`<span class="cs-editoria">${escapeHtml(s.editoria)}</span>`:''}<div class="cs-subject">${escapeHtml(s.subject)}</div><div class="cs-structure">${s.structure}</div><div class="cs-actions"><button type="button" class="cs-use" data-idx="${idx}">Usar no conteúdo</button></div></div>`).join('')}</div>`;
      box.querySelectorAll('.cs-use').forEach(bt=> bt.addEventListener('click', ()=>{
        const s = suggestions[parseInt(bt.dataset.idx,10)]; if(!s) return;
        const plainStructure = s.structure.replace(/<[^>]+>/g,'');
        const block = `Pauta: ${s.subject}\nEstrutura: ${plainStructure}`;
        const notes = $('mNotes');
        notes.value = notes.value.trim() ? `${notes.value.trim()}\n\n${block}` : block;
        refreshModalDynamic();
      }));
    }

    // formata uma data "YYYY-MM-DD" como "20 de agosto de 2026"
    function formatDatePt(dateStr){
      const [y,m,d] = dateStr.split('-').map(Number);
      return new Date(y, m-1, d).toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric' });
    }

    // junta uma lista em português natural: "A", "A e B", "A, B e C"
    function joinPt(items){
      if(items.length===0) return '';
      if(items.length===1) return items[0];
      return `${items.slice(0,-1).join(', ')} e ${items[items.length-1]}`;
    }

    // texto puro (sem HTML) da pré-visualização atual do briefing — atualizado a cada
    // renderBriefingPreview(), é o que o botão de copiar manda pra área de transferência
    let currentBriefingText = '';

    // monta uma linha rotulada (label em destaque + valor) da pré-visualização do briefing —
    // `truncate` deixa o valor em uma linha só com reticências (bom pra links/caminhos longos,
    // que são o que mais "engorda" o bloco visualmente); o valor completo fica no title (tooltip)
    function bpRow(label, value, truncate){
      return `<div class="bp-row"><span class="bp-row-label">${escapeHtml(label)}</span><span class="bp-row-value${truncate?' bp-row-value--clip':''}"${truncate?` title="${escapeHtml(value)}"`:''}>${escapeHtml(value)}</span></div>`;
    }

    // mesma linha rotulada, mas com o valor em lista (um item por linha) em vez de texto corrido
    // — usado em Produto(s), pra ficar fácil de ler quando há mais de um produto na postagem
    function bpListRow(label, items){
      const li = items.map(item=> `<li>${escapeHtml(item)}</li>`).join('');
      return `<div class="bp-row"><span class="bp-row-label">${escapeHtml(label)}</span><ul class="bp-row-list">${li}</ul></div>`;
    }

    // linha divisória entre o cabeçalho (título + campos) e o Conteúdo — feita de caracteres de
    // texto reais (não só uma borda CSS), pra ir junto tanto ao copiar pelo botão quanto ao
    // selecionar o texto na mão e colar em outro editor
    const BRIEFING_SEPARATOR = '─'.repeat(32);

    // monta as linhas de texto puro do briefing de uma postagem, na ordem: Título, Publicação
    // prevista para, Formatos, Salvar em, Referências salvas em, Produto(s), Imagem, Observações
    // e Conteúdo — compartilhada entre a pré-visualização ao vivo do modal (a partir dos campos
    // do formulário) e a exportação de briefing (a partir de um post já salvo)
    function buildBriefingPlainLines({ title, dateLabel, formatsText, hasFormats, artsLink, referencesLink, productItems, imageLink, imageNotes, content }){
      const plainLines = [];
      if(title) plainLines.push(title);
      if(title && (dateLabel || hasFormats || artsLink || referencesLink || productItems.length || imageLink || imageNotes)) plainLines.push(BRIEFING_SEPARATOR);
      if(dateLabel) plainLines.push(`Publicação prevista para ${dateLabel}`);
      if(hasFormats) plainLines.push(`Formatos: ${formatsText}`);
      if(artsLink) plainLines.push(`Salvar em: ${artsLink}`);
      if(referencesLink) plainLines.push(`Referências salvas em: ${referencesLink}`);
      if(productItems.length){
        plainLines.push('Produto(s):');
        productItems.forEach(item=> plainLines.push(`- ${item}`));
      }
      if(imageLink) plainLines.push(`Imagem: ${imageLink}`);
      if(imageNotes) plainLines.push(`Observações: ${imageNotes}`);
      if(content){
        if(plainLines.length) plainLines.push(BRIEFING_SEPARATOR);
        plainLines.push(`Conteúdo:\n${content}`);
      }
      return plainLines;
    }

    // mesmo texto de briefing (título, formatos, links, produto(s), imagem, observações e
    // conteúdo) de uma postagem já salva em state.posts — usado na exportação em lote
    function buildPostBriefingText(post){
      const title = (post.title||'').trim();
      const dateLabel = post.date ? formatDatePt(post.date) : '';
      const entries = postChannelEntries(post);
      const checkedPlaces = [...new Set(entries.flatMap(c=>c.places||[]))];
      const formats = formatsForNetworks(entries.map(c=>c.channel)).filter(f=> checkedPlaces.includes(f.name));
      const formatsText = formats.length
        ? formats.map(f=> (f.width && f.height) ? `${f.name} (${f.width}x${f.height}px)` : f.name).join(', ')
        : joinPt(checkedPlaces);
      const products = getPostProducts(post);
      const productItems = products.map(p=> [p.code, p.name].filter(Boolean).join(' – '));
      const plainLines = buildBriefingPlainLines({
        title, dateLabel, formatsText, hasFormats: checkedPlaces.length>0,
        artsLink: (post.artsLink||'').trim(), referencesLink: (post.referencesLink||'').trim(),
        productItems, imageLink: (post.imageLink||'').trim(), imageNotes: (post.imageNotes||'').trim(),
        content: (post.notes||'').trim()
      });
      return plainLines.join('\n');
    }

    // pré-visualização do texto do briefing, abaixo de Conteúdo da publicação — consolida
    // título, data prevista, formatos (com dimensões), links de onde salvar arte/referências,
    // produto(s), imagem de referência e o próprio conteúdo da publicação. A versão em texto
    // puro (currentBriefingText, usada pelo botão de copiar) segue a ordem: Título, Publicação
    // prevista para, Formatos, Salvar em, Referências salvas em, Produto, Imagem, Observações e
    // Conteúdo — mas a exibição visual é montada à parte, em linhas rotuladas mais fáceis de
    // escanear que um parágrafo corrido, com o Conteúdo destacado num bloco próprio no fim.
    // Não inclui "Briefing salvo em" porque esse campo indica onde o PRÓPRIO briefing fica,
    // não é conteúdo do briefing em si.
    function renderBriefingPreview(){
      const el = $('mBriefingPreview'); if(!el) return;
      const title = $('mTitle').value.trim();
      const nets = Array.from(document.querySelectorAll('.mNet:checked')).map(n=>n.value);
      const checkedPlaces = [...new Set(Array.from(document.querySelectorAll('input[name="mPlace"]:checked')).map(n=>n.value))];
      const formats = formatsForNetworks(nets).filter(f=> checkedPlaces.includes(f.name));
      const formatsText = formats.length
        ? formats.map(f=> (f.width && f.height) ? `${f.name} (${f.width}x${f.height}px)` : f.name).join(', ')
        : joinPt(checkedPlaces);
      const artsLink = $('mArtsLink').value.trim();
      const referencesLink = $('mReferencesLink').value.trim();
      const imageLink = $('mImageLink').value.trim();
      const imageNotes = $('mImageNotes').value.trim();
      const content = $('mNotes').value.trim();
      const dateVal = $('mDate').value;
      const dateLabel = dateVal ? formatDatePt(dateVal) : '';
      // um item de texto por produto ("código – nome completo"), sem código quando o produto não tem um
      const productItems = selectedProducts.map(p=> [p.code, p.name].filter(Boolean).join(' – '));

      // texto puro pro botão de copiar — uma frase natural por campo, na mesma ordem da exibição
      const plainLines = buildBriefingPlainLines({ title, dateLabel, formatsText, hasFormats: checkedPlaces.length>0, artsLink, referencesLink, productItems, imageLink, imageNotes, content });
      currentBriefingText = plainLines.join('\n');

      if(plainLines.length===0){
        el.innerHTML = `<span style="color:var(--text-faint)">Preencha os campos acima para ver o texto do briefing aqui.</span>`;
        return;
      }

      // exibição visual: título como cabeçalho, campos agrupados em linhas rotuladas e o
      // conteúdo da publicação isolado num bloco próprio, separado por uma linha divisória
      const metaRows = [];
      if(dateLabel) metaRows.push(bpRow('Publicação prevista', dateLabel));
      if(checkedPlaces.length) metaRows.push(bpRow('Formatos', formatsText));
      if(artsLink) metaRows.push(bpRow('Salvar em', artsLink, true));
      if(referencesLink) metaRows.push(bpRow('Referências salvas em', referencesLink, true));
      if(productItems.length) metaRows.push(bpListRow('Produto(s)', productItems));
      if(imageLink) metaRows.push(bpRow('Imagem', imageLink, true));
      if(imageNotes) metaRows.push(bpRow('Observações', imageNotes));

      let html = '';
      if(title) html += `<div class="bp-title">${escapeHtml(title)}</div>`;
      if(title && metaRows.length) html += `<div class="bp-separator">${BRIEFING_SEPARATOR}</div>`;
      if(metaRows.length) html += `<div class="bp-meta">${metaRows.join('')}</div>`;
      if(content){
        if(title || metaRows.length) html += `<div class="bp-separator">${BRIEFING_SEPARATOR}</div>`;
        html += `<div class="bp-content"><div class="bp-content-label">Conteúdo</div><div class="bp-content-text">${escapeHtml(content).replace(/\n/g,'<br>')}</div></div>`;
      }
      el.innerHTML = html;
    }

    // copia texto para a área de transferência — tenta a Clipboard API moderna e cai para o
    // truque do textarea temporário + execCommand quando ela não está disponível (comum em
    // páginas abertas como arquivo local, fora de um contexto seguro/https)
    function copyTextToClipboard(text){
      if(navigator.clipboard && navigator.clipboard.writeText){
        return navigator.clipboard.writeText(text).catch(()=> legacyCopyToClipboard(text));
      }
      legacyCopyToClipboard(text);
      return Promise.resolve();
    }
    function legacyCopyToClipboard(text){
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.focus(); ta.select();
      try{ document.execCommand('copy'); } catch(e){}
      document.body.removeChild(ta);
    }

    function refreshModalDynamic(){
      renderTitleSuggestion();
      renderBriefingPreview();
      renderContentSuggestions();
    }

    // ============================================================
    // AUTOCOMPLETE DO CATÁLOGO DE PRODUTOS (campo "Nome do produto")
    // ============================================================
    function addSelectedProduct(item){
      if(item.code && selectedProducts.some(p=>p.code===item.code)){ $('mProductName').value=''; hideProductSuggestions(); return; }
      selectedProducts.push({ code: item.code||'', name: item.name });
      $('mProductName').value = '';
      hideProductSuggestions();
      renderSelectedProducts();
      $('mProductName').focus();
    }

    function showProductSuggestions(query){
      const box = $('productSuggestions'); if(!box) return;
      const q = normalizeStr(query.trim());
      if(q.length < 2){ hideProductSuggestions(); return; }
      const qCode = normalizeCode(query.trim());
      const matches = (APP_SETTINGS.catalog||[]).filter(item=>
        !selectedProducts.some(p=>p.code===item.code) &&
        (normalizeStr(item.name).includes(q) || normalizeStr(item.code).includes(q) || normalizeCode(item.code).includes(qCode))
      ).slice(0, 8);
      if(matches.length===0){
        box.innerHTML = `<div class="autocomplete-item ac-manual"><span class="ac-name">+ Adicionar "${escapeHtml(query.trim())}" (sem catálogo)</span></div>`;
        box.querySelector('.ac-manual').addEventListener('mousedown', (ev)=>{ ev.preventDefault(); addSelectedProduct({ code:'', name: query.trim() }); });
        box.style.display = 'block';
        return;
      }
      box.innerHTML = matches.map(item=>
        `<div class="autocomplete-item" data-code="${escapeHtml(item.code)}"><img src="${productImageUrl(item.code)}" alt="" referrerpolicy="no-referrer" onerror="this.style.visibility='hidden'" /><span class="ac-name">${escapeHtml(item.name)}</span><span class="ac-code">${escapeHtml(item.code)}</span></div>`
      ).join('');
      box.querySelectorAll('.autocomplete-item').forEach(el=>{
        el.addEventListener('mousedown', (ev)=>{ ev.preventDefault(); const item = (APP_SETTINGS.catalog||[]).find(x=>x.code===el.dataset.code); if(item) addSelectedProduct(item); });
      });
      box.style.display = 'block';
    }

    // ============================================================
    // MODO DE SELEÇÃO E EDIÇÃO EM LOTE — selecionar várias postagens
    // no calendário e aplicar mudanças a todas de uma vez
    // ============================================================
    function toggleSelectMode(){
      selectMode = !selectMode;
      if(!selectMode) selectedIds.clear();
      // indicação visual do botão "Selecionar" ativo
      document.getElementById('toggleSelect').classList.toggle('btn--active', selectMode);
      render();
    }

    function openBulkEdit(){
      if(selectedIds.size===0){ alert('Nenhuma postagem selecionada'); return; }
      $('bDate').value = '';
      document.querySelector('input[name="bPlace"][value=""]').checked = true;
      document.querySelector('input[name="bType"][value=""]').checked = true;
      if($('bStatusSelect')) $('bStatusSelect').value = '';
      $('bCollabToggle').checked = false;
      $('bulkEditBackdrop').style.display = 'flex';
    }

    function closeBulkEdit(){ $('bulkEditBackdrop').style.display = 'none'; }

    function applyBulkEdit(){
      const date = $('bDate').value || null;
      const place = document.querySelector('input[name="bPlace"]:checked').value || null;
      const type = document.querySelector('input[name="bType"]:checked').value || null;
      const status = $('bStatusSelect') ? ($('bStatusSelect').value || null) : null;
      const beforeStates = [];
      selectedIds.forEach(id=>{ const p = state.posts.find(x=>x.id===id); if(p){ beforeStates.push(Object.assign({},p)); if(date && date!==p.date){ p.date = date; p.order = nextOrderForDate(date, p.id); } if(place) p.place = place; if(type) p.type = type; if(status) p.status = status; if($('bCollabToggle').checked) p.collab = true; } });
      saveState(); buildCalendar(); render(); closeBulkEdit();
      pushUndo({ type:'edit-multi', before: beforeStates }); redoStack = [];
      // sai do modo de seleção
      selectMode = false; selectedIds.clear(); document.getElementById('toggleSelect').classList.remove('btn--active');
    }

    // ============================================================
    // ÍCONES SVG — redes sociais e formatos (Feed/Story)
    // ============================================================
    // no estilo "app icon" (círculo colorido + glifo branco), igual aos ícones de arquivo em
    // icons/*.svg — usados só para redes sem preset de arquivo (Blog, Email, redes customizadas)
    const ICONS = {
      Blog: `<svg width="14" height="14" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="16" fill="#ef4444"/><path d="M9 12h14M9 16h10M9 20h7" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>`,
      Email: `<svg width="14" height="14" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="16" fill="#374151"/><rect x="7" y="10" width="18" height="13" rx="2" stroke="white" stroke-width="1.6" fill="none"/><path d="M8 11.5l8 6 8-6" stroke="white" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    };
    const FORMAT_ICONS = {
      Feed: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" stroke-width="1.6"/><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/><path d="M21 15l-5-5-4 4-3-3-6 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      Story: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="6" y="2" width="12" height="20" rx="6" stroke="currentColor" stroke-width="1.6"/></svg>`,
      Stories: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="6" y="2" width="12" height="20" rx="6" stroke="currentColor" stroke-width="1.6"/></svg>`,
      Reels: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" stroke-width="1.6"/><path d="M10 9l5 3-5 3V9z" fill="currentColor"/></svg>`
    };

    // ============================================================
    // ÍCONES DE INTERFACE — substitui emojis/glifos de texto (✕ ✏️ ✨ 🔄 📅 📋 ⋮ ⠿ ↩ ↪ ‹ › ▾)
    // por contornos SVG (estilo Feather/Lucide: stroke=currentColor, herda cor e tamanho do
    // elemento pai). Cada helper aceita um tamanho opcional (padrão 14px).
    // ============================================================
    function svgIcon(paths, size, extraAttrs){
      return `<svg class="icon" width="${size||14}" height="${size||14}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" ${extraAttrs||''}>${paths}</svg>`;
    }
    const UI_ICONS = {
      x: (s)=> svgIcon('<path d="M18 6 6 18"/><path d="M6 6l12 12"/>', s),
      edit: (s)=> svgIcon('<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>', s),
      check: (s)=> svgIcon('<path d="M20 6 9 17l-5-5"/>', s),
      idea: (s)=> svgIcon('<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2.3h6c0-1.1.4-1.8 1-2.3A7 7 0 0 0 12 2Z"/>', s),
      shuffle: (s)=> svgIcon('<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>', s),
      calendar: (s)=> svgIcon('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>', s),
      copy: (s)=> svgIcon('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>', s),
      undo: (s)=> svgIcon('<path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>', s),
      redo: (s)=> svgIcon('<path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10"/>', s),
      chevronLeft: (s)=> svgIcon('<path d="m15 18-6-6 6-6"/>', s),
      chevronRight: (s)=> svgIcon('<path d="m9 18 6-6-6-6"/>', s),
      chevronDown: (s)=> svgIcon('<path d="m6 9 6 6 6-6"/>', s),
      moreVertical: (s)=> svgIcon('<circle cx="12" cy="5" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.3" fill="currentColor" stroke="none"/>', s),
      grip: (s)=> svgIcon('<circle cx="9" cy="5" r="1.2" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="9" cy="19" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="5" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="15" cy="19" r="1.2" fill="currentColor" stroke="none"/>', s),
      film: (s)=> svgIcon('<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M10.5 9.5l5 2.5-5 2.5v-5z" fill="currentColor" stroke="none"/>', s),
      clock: (s)=> svgIcon('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>', s),
      checkCircle: (s)=> svgIcon('<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/>', s),
      circle: (s)=> svgIcon('<circle cx="12" cy="12" r="9"/>', s),
      upload: (s)=> svgIcon('<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>', s)
    };
    // escolhe um ícone para um status pelo nome (heurística por palavra-chave — cobre os status
    // padrão e a maioria dos nomes customizados; cai num círculo neutro quando não reconhece)
    function statusIconFor(name){
      const n = normalizeIconKey(name);
      if(/public/.test(n)) return UI_ICONS.checkCircle;
      if(/aprov|conclu|final|done/.test(n)) return UI_ICONS.checkCircle;
      if(/agend|schedul/.test(n)) return UI_ICONS.clock;
      if(/produc|producao|progress|revis/.test(n)) return UI_ICONS.shuffle;
      if(/rascunho|draft/.test(n)) return UI_ICONS.edit;
      return UI_ICONS.circle;
    }

    // gera um id único para uma nova postagem
    function generateId(){ return 'p-' + Math.random().toString(36).slice(2,9) + Date.now().toString(36).slice(-4); }

    // ============================================================
    // ORDEM DAS POSTAGENS DENTRO DE UM MESMO DIA — cada post carrega
    // um campo `order` (inteiro, por data). Isso permite ao usuário
    // reordenar manualmente as postagens de um dia por drag-and-drop,
    // e essa ordem é respeitada em toda leitura sequencial do calendário
    // (grade mensal, lista e exportações/briefings futuros).
    // ============================================================
    function sortByOrder(list){
      return list.slice().sort((a,b)=> (a.order||0) - (b.order||0));
    }
    function nextOrderForDate(date, excludeId){
      const existing = state.posts.filter(p=>p.date===date && p.id!==excludeId);
      if(existing.length===0) return 0;
      return Math.max(...existing.map(p=> typeof p.order==='number'?p.order:0)) + 1;
    }
    // atribui `order` a postagens antigas que ainda não têm (migração), preservando
    // a ordem em que já apareciam no array para cada data
    function migratePostOrders(){
      const counters = {};
      state.posts.forEach(p=>{
        if(typeof p.order !== 'number'){
          counters[p.date] = counters[p.date] || 0;
          p.order = counters[p.date]++;
        } else {
          counters[p.date] = Math.max(counters[p.date]||0, p.order+1);
        }
      });
    }
    // move `draggedPost` para o dia/posição de `targetPost` (antes ou depois dele)
    // e reindexa o `order` dos dias afetados; registra a ação no histórico de desfazer
    function reorderPost(draggedPost, targetPost, insertBefore){
      if(draggedPost.id===targetPost.id) return;
      const fromDate = draggedPost.date;
      const toDate = targetPost.date;
      const affectedDates = new Set([fromDate, toDate]);
      const beforeStates = state.posts.filter(p=>affectedDates.has(p.date)).map(p=>({ id:p.id, date:p.date, order:p.order }));

      draggedPost.date = toDate;
      const destList = sortByOrder(state.posts.filter(p=>p.date===toDate && p.id!==draggedPost.id));
      const targetIdx = destList.findIndex(p=>p.id===targetPost.id);
      const insertIdx = insertBefore ? targetIdx : targetIdx+1;
      destList.splice(insertIdx, 0, draggedPost);
      destList.forEach((p,i)=> p.order = i);
      if(fromDate !== toDate){
        const srcList = sortByOrder(state.posts.filter(p=>p.date===fromDate));
        srcList.forEach((p,i)=> p.order = i);
      }
      saveState();
      buildCalendar(); render();
      pushUndo({ type:'reorder', changes: beforeStates });
      redoStack = [];
    }
    // aplica um conjunto de estados {id,date,order} salvos, retornando os estados anteriores (para desfazer/refazer)
    function applyOrderStates(changes){
      const inverse = [];
      changes.forEach(c=>{
        const post = state.posts.find(p=>p.id===c.id);
        if(post){ inverse.push({ id:c.id, date:post.date, order:post.order }); post.date = c.date; post.order = c.order; }
      });
      return inverse;
    }

    // data de hoje no formato YYYY-MM-DD, usado para destacar o dia atual
    function todayStr(){ const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }

    // ============================================================
    // CALENDÁRIO MENSAL — monta as células (4 a 6 semanas, conforme
    // o necessário) do mês exibido e liga o drag-and-drop de
    // postagens entre os dias
    // ============================================================
    // clique no número do dia/contador (abre o popup do dia) + soltar uma postagem arrastada —
    // comportamento de uma célula de dia, compartilhado entre a grade mensal (buildCalendar) e as
    // colunas da visão semanal (buildWeekView), pra não duplicar a lógica de drag&drop entre as duas.
    function attachDayCellInteractions(cell, dateStr){
      cell.querySelectorAll('.date, .day-count').forEach(el=>{
        el.style.cursor = 'pointer';
        el.title = 'Ver todas as postagens deste dia';
        el.addEventListener('click', (ev)=>{ ev.stopPropagation(); openDayPosts(dateStr); });
      });
      // permite soltar uma postagem arrastada nesta célula
      cell.addEventListener('dragover', ev=>{ ev.preventDefault(); cell.classList.add('drag-over'); });
      cell.addEventListener('dragleave', ev=>{ cell.classList.remove('drag-over'); });
      cell.addEventListener('drop', ev=>{
        ev.preventDefault(); cell.classList.remove('drag-over');
        const id = ev.dataTransfer.getData('text/plain');
        if(!id) return;
        const post = state.posts.find(x=>x.id===id);
        if(!post) return;
        const from = post.date;
        const to = cell.dataset.date;
        if(from===to) return;
        // animação FLIP: captura a posição do card antes de mover
        const srcEl = document.querySelector(`.event[data-id="${post.id}"]`) || document.querySelector(`.event[data-id='${post.id}']`);
        const oldRect = srcEl ? srcEl.getBoundingClientRect() : null;
        // efetiva a mudança de data (soltar na célula, fora de um card específico, envia a postagem para o fim do dia)
        const beforeState = [{ id: post.id, date: post.date, order: post.order }];
        post.date = to;
        post.order = nextOrderForDate(to, post.id);
        saveState();
        buildCalendar();
        render();
        // anima da posição antiga até a nova
        if(oldRect){
          const newEl = document.querySelector(`.event[data-id="${post.id}"]`) || document.querySelector(`.event[data-id='${post.id}']`);
          if(newEl){
            const newRect = newEl.getBoundingClientRect();
            const dx = oldRect.left - newRect.left;
            const dy = oldRect.top - newRect.top;
            newEl.style.transform = `translate(${dx}px, ${dy}px)`;
            requestAnimationFrame(()=>{
              newEl.classList.add('moving');
              newEl.style.transform = '';
              setTimeout(()=>{ newEl.classList.remove('moving'); }, 380);
            });
          }
        }
        // registra a ação no histórico de desfazer
        pushUndo({ type:'reorder', changes: beforeState });
        // uma nova ação invalida o histórico de refazer
        redoStack = [];
      });
    }

    function buildCalendar(){
      const grid = $('grid');
      // guarda a altura atual de cada célula (por data) antes de destruir o grid — usado por
      // render() pra animar suavemente a troca de altura das linhas quando um card muda de dia,
      // em vez do corte seco de uma célula que encolhe/cresce instantaneamente
      const oldHeights = new Map();
      grid.querySelectorAll('.day[data-date]').forEach(cell=> oldHeights.set(cell.dataset.date, cell.getBoundingClientRect().height));
      if(oldHeights.size) pendingRowHeights = oldHeights;
      grid.innerHTML = '';
      const YEAR = viewDate.getFullYear();
      const MONTH = viewDate.getMonth();
      const first = new Date(YEAR, MONTH, 1);
      const last = new Date(YEAR, MONTH + 1, 0);
      const total = last.getDate();
      const startDay = first.getDay(); // 0 (Sun) - 6 (Sat)
      // número de semanas realmente necessário para exibir o mês (4, 5 ou 6), em vez de sempre fixar 6
      const cells = Math.ceil((startDay + total) / 7) * 7;
      const tStr = todayStr();
      for(let i=0;i<cells;i++){
        const cell = document.createElement('div');
        cell.className = 'day';
        const dayIndex = i - startDay + 1;
        if(dayIndex>0 && dayIndex<=total){
          const dateStr = `${YEAR}-${String(MONTH+1).padStart(2,'0')}-${String(dayIndex).padStart(2,'0')}`;
          cell.dataset.date = dateStr;
          if(dateStr===tStr) cell.classList.add('today');
          cell.innerHTML = `<div class="day-head"><span class="date">${dayIndex}</span><span class="day-count"></span></div><div class="posts"></div>`;
          // clicar no número do dia ou no contador (0/3, 1/3...) abre o popup com todas as
          // postagens daquela data — igual ao badge "+N", mas funciona mesmo com 0, 1, 2 ou 3
          // postagens (quando não há badge "+N" porque tudo já cabe na célula)
          attachDayCellInteractions(cell, dateStr);
        } else {
          cell.classList.add('empty');
          cell.innerHTML = `<div style="height:18px"></div>`;
        }
        grid.appendChild(cell);
      }
      // atualiza o rótulo do mês exibido (ex: "Agosto 2026")
      updateMonthLabelText();
    }

    // domingo da semana que contém `date` (mesma convenção Dom→Sáb do cabeçalho do mês)
    function getWeekStart(date){
      const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      d.setDate(d.getDate() - d.getDay());
      return d;
    }

    // ============================================================
    // VISÃO SEMANAL — 7 colunas (Dom→Sáb) com as postagens só daquela semana, cada uma com um
    // "+ Adicionar postagem" no rodapé pra criar já com a data daquele dia preenchida. Diferente
    // do mês, aqui não há limite de cards por coluna (ver render()) — a coluna cresce.
    // ============================================================
    function buildWeekView(){
      const grid = $('weekGrid'); if(!grid) return;
      grid.innerHTML = '';
      const weekStart = getWeekStart(viewDate);
      const tStr = todayStr();
      for(let i=0;i<7;i++){
        const d = new Date(weekStart); d.setDate(d.getDate()+i);
        const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        const cell = document.createElement('div');
        cell.className = 'day week-day';
        cell.dataset.date = dateStr;
        if(dateStr===tStr) cell.classList.add('today');
        cell.innerHTML = `<div class="week-day-head"><div class="week-day-top-row"><span class="week-day-label">${WEEKDAY_ABBR[i]}</span><span class="day-count"></span></div><span class="date">${d.getDate()}</span></div><div class="posts"></div><button type="button" class="week-day-add">+ Adicionar postagem</button>`;
        attachDayCellInteractions(cell, dateStr);
        cell.querySelector('.week-day-add').addEventListener('click', (ev)=>{ ev.stopPropagation(); closeEditState(); openModal(dateStr); });
        grid.appendChild(cell);
      }
    }

    // ============================================================
    // POPOVER DE SELEÇÃO RÁPIDA DE MÊS DENTRO DO ANO — clicar no
    // rótulo do mês abre uma grade com os 12 meses do ano exibido,
    // permitindo pular direto para qualquer mês sem clicar em "‹ ›"
    // repetidamente. Enquanto aberto, o próprio rótulo mostra só o
    // ano e as setas ‹ › do cabeçalho passam a navegar por ano.
    // ============================================================
    const MONTH_ABBR = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    // ano exibido no popover — pode ser navegado (via ‹ ›) independente do calendário até um mês ser escolhido
    let pickerYear = viewDate.getFullYear();

    // rótulo padrão ("Agosto 2026"), usado quando o popover está fechado
    function updateMonthLabelText(){
      if(currentView==='week'){
        // rótulo vira o intervalo da semana visível (ex: "17 – 23 de agosto de 2026"), já que
        // "Agosto de 2026" sozinho não diz qual semana está sendo mostrada
        const start = getWeekStart(viewDate);
        const end = new Date(start); end.setDate(end.getDate()+6);
        const sameMonth = start.getMonth()===end.getMonth() && start.getFullYear()===end.getFullYear();
        const endLabel = `${end.getDate()} de ${end.toLocaleString('pt-BR',{month:'long'})} de ${end.getFullYear()}`;
        const startLabel = sameMonth ? `${start.getDate()}` : `${start.getDate()} de ${start.toLocaleString('pt-BR',{month:'long'})}`;
        $('monthLabelText').textContent = `${startLabel} – ${endLabel}`;
        return;
      }
      const monthLabel = viewDate.toLocaleString('pt-BR',{month:'long',year:'numeric'});
      $('monthLabelText').textContent = monthLabel.charAt(0).toUpperCase()+monthLabel.slice(1);
    }

    function renderMonthYearPicker(){
      const today = new Date();
      const grid = $('mypMonths');
      grid.innerHTML = '';
      for(let m=0; m<12; m++){
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'myp-month';
        btn.textContent = MONTH_ABBR[m];
        const isPast = pickerYear < today.getFullYear() || (pickerYear===today.getFullYear() && m < today.getMonth());
        const isCurrent = pickerYear===today.getFullYear() && m===today.getMonth();
        const isSelected = pickerYear===viewDate.getFullYear() && m===viewDate.getMonth();
        if(isPast) btn.classList.add('past');
        if(isCurrent) btn.classList.add('current');
        if(isSelected) btn.classList.add('selected');
        btn.addEventListener('click', ()=>{
          viewDate = new Date(pickerYear, m, 1);
          buildCalendar(); render();
          closeMonthYearPicker();
        });
        grid.appendChild(btn);
      }
    }

    function openMonthYearPicker(){
      pickerYear = viewDate.getFullYear();
      renderMonthYearPicker();
      $('monthYearPicker').classList.add('open');
      $('monthLabel').setAttribute('aria-expanded','true');
      $('monthLabelText').textContent = pickerYear;
    }
    function closeMonthYearPicker(){
      $('monthYearPicker').classList.remove('open');
      $('monthLabel').setAttribute('aria-expanded','false');
      updateMonthLabelText();
    }
    function toggleMonthYearPicker(){
      if($('monthYearPicker').classList.contains('open')) closeMonthYearPicker();
      else openMonthYearPicker();
    }
    // navega o ano exibido no popover (chamado pelas setas ‹ › do cabeçalho enquanto ele está aberto)
    function stepPickerYear(delta){
      pickerYear += delta;
      $('monthLabelText').textContent = pickerYear;
      renderMonthYearPicker();
    }

    // ============================================================
    // FILTRAGEM — aplica a aba de canal ativa e os filtros do modal
    // de Filtros sobre a lista completa de postagens
    // ============================================================
    function getFilteredPosts(){
      const items = state.posts.filter(p => activeTab==='All' || postChannelEntries(p).some(c=>c.channel===activeTab));
      return items.filter(p=>{
        // editorias
        if(filters.editorias && filters.editorias.length>0){
          const eds = Array.isArray(p.editoria)?p.editoria:[p.editoria].filter(Boolean);
          if(!eds.some(e=> filters.editorias.includes(e))) return false;
        }
        // formatos (Feed/Story) — considera os formatos de todas as redes da postagem
        if(filters.places && filters.places.length>0){
          const pls = postChannelEntries(p).flatMap(c=>c.places||[]);
          if(!pls.some(z=> filters.places.includes(z))) return false;
        }
        // tipo (Estático/Vídeo) — considera os tipos de todas as redes da postagem
        if(filters.types && filters.types.length>0){
          const tys = postChannelEntries(p).flatMap(c=>c.types||['Static']);
          if(!tys.some(t=> filters.types.includes(t))) return false;
        }
        // status
        if(filters.statuses && filters.statuses.length>0){ if(!filters.statuses.includes(p.status)) return false; }
        // collab
        if(filters.collab==='only' && !p.collab) return false;
        if(filters.collab==='no' && p.collab) return false;
        return true;
      });
    }

    // ============================================================
    // AÇÕES RÁPIDAS DO CARD — duplicar e excluir uma postagem,
    // acessadas pelo menu "⋮" de cada card
    // ============================================================
    // menu "⋮" flutuante único, reaproveitado por todos os cards — se cada card criasse o seu
    // próprio menu como filho, o "overflow:hidden" do card (usado para arredondar os cantos)
    // cortaria o menu (foi o que causava só "Duplicar" aparecer e "Excluir" ficar cortado fora
    // da área visível). Por isso ele fica fixo em document.body e é reposicionado a cada abertura.
    let cardMenuEl = null;
    function getCardMenuEl(){
      if(cardMenuEl) return cardMenuEl;
      cardMenuEl = document.createElement('div');
      cardMenuEl.className = 'event-menu';
      cardMenuEl.innerHTML = `<button type="button" class="menu-duplicate">Duplicar</button><button type="button" class="menu-delete danger">Excluir</button>`;
      cardMenuEl.addEventListener('click', ev=> ev.stopPropagation());
      document.body.appendChild(cardMenuEl);
      return cardMenuEl;
    }
    // fecha o menu "⋮" aberto — chamado ao abrir outro menu, ao clicar fora ou ao rolar a página
    function closeAllCardMenus(){ if(cardMenuEl) cardMenuEl.classList.remove('open'); }
    document.addEventListener('click', closeAllCardMenus);
    window.addEventListener('scroll', closeAllCardMenus, true);

    // liga o clique de um botão "⋮" já existente à postagem de id `idSource` — string fixa (cards,
    // recriados a cada render, então o listener nunca é reaproveitado) ou função que devolve o id
    // atual (botão fixo do modal de edição, ligado uma única vez no início e reaproveitado a cada
    // postagem editada, então precisa ler `editingId` no momento do clique, não travar num valor)
    function wireCardMenuButton(btn, idSource){
      btn.addEventListener('click', (ev)=>{
        ev.stopPropagation();
        const id = typeof idSource === 'function' ? idSource() : idSource;
        if(!id) return;
        const menu = getCardMenuEl();
        const wasOpenForThisCard = menu.classList.contains('open') && menu.dataset.forId===id;
        closeAllCardMenus();
        if(wasOpenForThisCard) return;
        menu.dataset.forId = id;
        menu.querySelector('.menu-duplicate').onclick = (e)=>{ e.stopPropagation(); closeAllCardMenus(); duplicatePost(id); };
        menu.querySelector('.menu-delete').onclick = (e)=>{ e.stopPropagation(); closeAllCardMenus(); deletePost(id); };
        const rect = btn.getBoundingClientRect();
        menu.style.top = `${rect.bottom + 4}px`;
        menu.style.left = `${Math.max(4, rect.right - 136)}px`;
        menu.classList.add('open');
      });
    }

    // monta o botão "⋮" de um card — usado tanto na grade do calendário quanto na lista, onde
    // cada card é recriado do zero a cada render (então religar o clique não acumula listeners)
    function buildCardMenu(p, btnClass){
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = btnClass; btn.setAttribute('aria-label','Mais ações'); btn.title = 'Mais ações'; btn.innerHTML = UI_ICONS.moreVertical(14);
      wireCardMenuButton(btn, p.id);
      return { btn };
    }

    // duplica uma postagem — cópia idêntica, com nova id, inserida logo após a original no mesmo dia
    function duplicatePost(id){
      const post = state.posts.find(p=>p.id===id); if(!post) return;
      const copy = Object.assign({}, post, { id: generateId(), order: nextOrderForDate(post.date) });
      if(Array.isArray(post.channels)) copy.channels = post.channels.map(c=>({ channel:c.channel, types:(c.types||[]).slice(), places:(c.places||[]).slice() }));
      if(Array.isArray(post.place)) copy.place = post.place.slice();
      if(Array.isArray(post.editoria)) copy.editoria = post.editoria.slice();
      if(Array.isArray(post.products)) copy.products = post.products.map(x=>Object.assign({},x));
      state.posts.push(copy);
      saveState(); buildCalendar(); render();
      pushUndo({ type:'create', posts:[copy.id] }); redoStack = [];
    }

    // exclui uma única postagem, com confirmação e possibilidade de desfazer (Ctrl+Z)
    function deletePost(id){
      const idx = state.posts.findIndex(p=>p.id===id); if(idx===-1) return;
      if(!confirm('Excluir esta postagem?')) return;
      const [removed] = state.posts.splice(idx,1);
      saveState(); buildCalendar(); render();
      pushUndo({ type:'delete', posts:[removed] }); redoStack = [];
      // se a postagem excluída era a que estava aberta no modal de edição, fecha o modal
      if(isEditing && editingId===id){ closeModal(); closeEditState(); }
    }

    // apaga de uma vez todas as postagens do mês atualmente visível no calendário — "resetar o
    // mês do zero". Ignora os filtros ativos (apaga tudo do mês, filtrado ou não, pra realmente
    // começar do zero) e pode ser desfeito com Ctrl+Z logo em seguida, como qualquer exclusão
    function resetMonth(){
      const YEAR = viewDate.getFullYear(), MONTH = viewDate.getMonth();
      const prefix = `${YEAR}-${String(MONTH+1).padStart(2,'0')}-`;
      const toRemove = state.posts.filter(p=> (p.date||'').startsWith(prefix));
      if(toRemove.length===0){ alert('Não há postagens neste mês para apagar.'); return; }
      const monthLabel = $('monthLabelText') ? $('monthLabelText').textContent : `${MONTH+1}/${YEAR}`;
      if(!confirm(`Isso vai apagar ${toRemove.length} postagem(ns) de ${monthLabel}. Dá pra desfazer com Ctrl+Z logo em seguida. Continuar?`)) return;
      const removedIds = new Set(toRemove.map(p=>p.id));
      state.posts = state.posts.filter(p=> !removedIds.has(p.id));
      saveState(); buildCalendar(); render();
      pushUndo({ type:'delete', posts: toRemove }); redoStack = [];
      closeAllCardMenus();
      // se a postagem aberta no modal de edição era uma das apagadas, fecha o modal
      if(isEditing && editingId && removedIds.has(editingId)){ closeModal(); closeEditState(); }
    }

    // ============================================================
    // RENDERIZAÇÃO DE CARDS — cria os elementos visuais de uma
    // postagem, tanto na grade mensal quanto na visão em lista
    // ============================================================
    // cria o elemento do card de postagem (evento) usado na grade do calendário
    function createEventElement(p){
      const div = document.createElement('div'); div.className='event'; div.setAttribute('draggable','true'); div.dataset.id = p.id;
      const entries = postChannelEntries(p);
      const eds = Array.isArray(p.editoria)?p.editoria:[p.editoria].filter(Boolean);
      const eyebrowText = eds.length ? joinPt(eds) : 'Sem editoria';
      const eyebrowColor = eds.length ? editoriaColor(eds[0]) : 'var(--text-faint)';
      const netsIconsHtml = entries.map(c=>`<span class="event-net-icon">${networkIcon(c.channel)}</span>`).join('');
      const typeLabel = entries.some(c=>(c.types||[]).some(t=>(t||'').toLowerCase()==='video')) ? 'Vídeo' : 'Estático';
      const prods = getPostProducts(p);
      const productNames = prods.map(x=>x.name).filter(Boolean).join(', ');
      div.title = [p.status, postChannelsDetailText(p), productNames].filter(Boolean).join(' · ');
      div.innerHTML = `<div class="event-bar" style="background:${eyebrowColor}"></div><div class="event-body"><div class="event-nets">${netsIconsHtml}</div><div class="event-eyebrow" style="color:${eyebrowColor}">${escapeHtml(eyebrowText)}</div><div class="event-title">${escapeHtml(p.title)}</div><div class="event-subtitle">${typeLabel}</div></div>`;
      div.addEventListener('dragstart', (ev)=>{ ev.dataTransfer.setData('text/plain', p.id); div.classList.add('dragging'); ev.dataTransfer.effectAllowed='move'; });
      div.addEventListener('dragend', ()=>{ div.classList.remove('dragging'); });
      // soltar sobre um card específico reordena/insere a postagem arrastada antes ou depois dele
      div.addEventListener('dragover', (ev)=>{
        ev.preventDefault(); ev.stopPropagation();
        const rect = div.getBoundingClientRect();
        const before = (ev.clientY - rect.top) < rect.height/2;
        div.classList.toggle('drop-before', before);
        div.classList.toggle('drop-after', !before);
      });
      div.addEventListener('dragleave', ()=> div.classList.remove('drop-before','drop-after'));
      div.addEventListener('drop', (ev)=>{
        ev.preventDefault(); ev.stopPropagation();
        const before = div.classList.contains('drop-before');
        div.classList.remove('drop-before','drop-after');
        const draggedId = ev.dataTransfer.getData('text/plain');
        if(!draggedId || draggedId===p.id) return;
        const draggedPost = state.posts.find(x=>x.id===draggedId);
        if(!draggedPost) return;
        reorderPost(draggedPost, p, before);
      });
      div.addEventListener('click', (ev)=>{ if(selectMode){ ev.stopPropagation(); const cb = div.querySelector('.select-checkbox'); if(cb){ cb.checked = !cb.checked; if(cb.checked) selectedIds.add(p.id); else selectedIds.delete(p.id); } return; } openEditModal(p.id); });
      if(selectMode){ const cb = document.createElement('input'); cb.type='checkbox'; cb.className='select-checkbox'; cb.checked = selectedIds.has(p.id); cb.addEventListener('click', (ev)=>{ ev.stopPropagation(); if(cb.checked) selectedIds.add(p.id); else selectedIds.delete(p.id); }); div.appendChild(cb); }
      else { const { btn } = buildCardMenu(p, 'event-menu-btn'); div.appendChild(btn); }
      return div;
    }

    // cria a linha de postagem usada na visão em lista
    function createListRow(p){
      const row = document.createElement('div'); row.className='list-row'; row.dataset.id = p.id; row.setAttribute('draggable','true');
      const entries = postChannelEntries(p);
      const eds = Array.isArray(p.editoria)?p.editoria:[p.editoria].filter(Boolean);
      const eyebrowText = eds.length ? joinPt(eds) : 'Sem editoria';
      const eyebrowColor = eds.length ? editoriaColor(eds[0]) : 'var(--text-faint)';
      const netsIconsHtml = entries.map(c=>`<span class="event-net-icon">${networkIcon(c.channel)}</span>`).join('');
      const typeLabel = entries.some(c=>(c.types||[]).some(t=>(t||'').toLowerCase()==='video')) ? 'Vídeo' : 'Estático';
      row.title = [p.status, postChannelsDetailText(p)].filter(Boolean).join(' · ');
      row.innerHTML = `<span class="drag-handle" title="Arraste para reordenar">${UI_ICONS.grip(14)}</span><span class="list-row-bar" style="background:${eyebrowColor}"></span><div class="list-row-body"><div class="list-row-nets">${netsIconsHtml}</div><div class="list-row-eyebrow" style="color:${eyebrowColor}">${escapeHtml(eyebrowText)}</div><div class="list-row-title">${escapeHtml(p.title)}</div><div class="list-row-subtitle">${typeLabel}</div></div>`;
      const { btn: menuBtn } = buildCardMenu(p, 'list-row-menu-btn');
      row.appendChild(menuBtn);
      row.addEventListener('click', ()=> openEditModal(p.id));
      // arrastar uma linha e soltar sobre outra reordena as postagens dentro do mesmo dia
      // (soltar em um dia diferente move a postagem para lá, ao fim daquele dia)
      row.addEventListener('dragstart', (ev)=>{ ev.dataTransfer.setData('text/plain', p.id); row.classList.add('dragging'); ev.dataTransfer.effectAllowed='move'; });
      row.addEventListener('dragend', ()=> row.classList.remove('dragging'));
      row.addEventListener('dragover', (ev)=>{
        ev.preventDefault(); ev.stopPropagation();
        const rect = row.getBoundingClientRect();
        const before = (ev.clientY - rect.top) < rect.height/2;
        row.classList.toggle('drop-before', before);
        row.classList.toggle('drop-after', !before);
      });
      row.addEventListener('dragleave', ()=> row.classList.remove('drop-before','drop-after'));
      row.addEventListener('drop', (ev)=>{
        ev.preventDefault(); ev.stopPropagation();
        const before = row.classList.contains('drop-before');
        row.classList.remove('drop-before','drop-after');
        const draggedId = ev.dataTransfer.getData('text/plain');
        if(!draggedId || draggedId===p.id) return;
        const draggedPost = state.posts.find(x=>x.id===draggedId);
        if(!draggedPost) return;
        reorderPost(draggedPost, p, before);
      });
      return row;
    }

    // monta a visão em lista, agrupando as postagens filtradas por dia do mês
    function renderListView(){
      const container = $('listView');
      if(!container) return;
      container.innerHTML = '';
      const YEAR = viewDate.getFullYear(), MONTH = viewDate.getMonth();
      const last = new Date(YEAR, MONTH+1, 0).getDate();
      const filtered = getFilteredPosts();
      const map = {};
      filtered.forEach(p=>{ (map[p.date] = map[p.date] || []).push(p); });
      const tStr = todayStr();
      let any = false;
      for(let d=1; d<=last; d++){
        const dateStr = `${YEAR}-${String(MONTH+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const list = sortByOrder(map[dateStr] || []);
        if(list.length===0) continue;
        any = true;
        const dow = new Date(YEAR,MONTH,d).toLocaleDateString('pt-BR',{weekday:'short'}).replace('.','');
        const isToday = dateStr===tStr;
        const group = document.createElement('div'); group.className = 'list-group';
        const dateEl = document.createElement('div'); dateEl.className = `list-date ${isToday?'today':''}`;
        dateEl.innerHTML = `<span class="list-date-num">${d}</span><span class="list-date-dow">${dow}</span>${isToday?'<span class="today-badge">Hoje</span>':''}`;
        group.appendChild(dateEl);
        list.forEach(p=> group.appendChild(createListRow(p)));
        container.appendChild(group);
      }
      if(!any){ container.innerHTML = `<div class="list-empty">Nenhuma postagem encontrada para este mês com os filtros atuais.</div>`; }
    }

    // ============================================================
    // RENDERIZAÇÃO PRINCIPAL — alterna entre Mês/Lista e desenha
    // as postagens filtradas nas células, badges e resumo da IA
    // ============================================================
    // alterna a visão ativa entre "month" (grade), "week" (colunas da semana) e "list" (lista)
    function setView(v){
      currentView = v;
      $('grid').style.display = v==='month' ? 'grid' : 'none';
      $('weekdayHeader').style.display = v==='month' ? 'grid' : 'none';
      $('weekView').style.display = v==='week' ? 'block' : 'none';
      $('listView').style.display = v==='list' ? 'flex' : 'none';
      document.querySelectorAll('#viewToggle button').forEach(b=> b.classList.toggle('active', b.dataset.view===v));
      updateMonthLabelText();
      render();
    }

    function render(){
      // visão semanal: reconstrói as 7 colunas da semana visível (viewDate) toda vez — é
      // barato (só 7 células) e mantém render() como o único ponto que precisa saber disso,
      // em vez de espalhar "if currentView==='week'" pelas dezenas de chamadas de
      // buildCalendar()+render() que já existem no app inteiro
      if(currentView==='week') buildWeekView();
      // limpa as postagens já desenhadas em cada célula
      document.querySelectorAll('.day').forEach(c=>{ const posts = c.querySelector('.posts'); if(posts) posts.innerHTML = ''; });
      const filtered = getFilteredPosts();
      // agrupa as postagens filtradas por data
      const postsMap = {};
      filtered.forEach(p=>{ postsMap[p.date] = postsMap[p.date] || []; postsMap[p.date].push(p); });

      // desenha cada célula do mês com limite de cards visíveis + badge "+N"
      const maxVisible = 3;
      document.querySelectorAll('#grid .day[data-date]').forEach(cell=>{
        const date = cell.dataset.date;
        const postsEl = cell.querySelector('.posts');
        const list = sortByOrder(postsMap[date] || []);
        // adiciona os cards visíveis (até o limite)
        list.slice(0, maxVisible).forEach(p=>{ postsEl.appendChild(createEventElement(p)); });
        // badge indicando quantas postagens ficaram escondidas
        const more = list.length>maxVisible ? list.length-maxVisible : 0;
        let mb = cell.querySelector('.more-badge');
        if(more>0){
          // o badge é criado uma vez por célula e reaproveitado entre renders — o clique
          // abre o popup com todas as postagens do dia (a grade só mostra até `maxVisible`)
          if(!mb){ mb = document.createElement('div'); mb.className='more-badge'; mb.title='Ver todas as postagens deste dia'; mb.addEventListener('click', (ev)=>{ ev.stopPropagation(); openDayPosts(date); }); cell.appendChild(mb); }
          mb.textContent = `+${more}`;
        }
        else { if(mb) mb.remove(); }
      });

      // colunas da visão semanal: sem limite de cards (há bastante espaço vertical), então
      // mostra tudo em vez de cortar com "+N" como no mês
      if(currentView==='week'){
        document.querySelectorAll('#weekGrid .day[data-date]').forEach(cell=>{
          const date = cell.dataset.date;
          const postsEl = cell.querySelector('.posts');
          const list = sortByOrder(postsMap[date] || []);
          list.forEach(p=>{ postsEl.appendChild(createEventElement(p)); });
        });
      }

      // badges de meta diária por dia
      const YEAR = viewDate.getFullYear(), MONTH = viewDate.getMonth();
      document.querySelectorAll('.day[data-date]').forEach(cell=>{
        const date = cell.dataset.date;
        if(!date) return;
        const postsAll = state.posts.filter(p=>p.date===date && !p.collab);
        const total = postsAll.length;

        const badge = cell.querySelector('.day-count');
        if(badge){
          badge.className = `day-count ${total < TARGET ? 'low':'ok'}`;
          badge.textContent = `${total}/${TARGET}`;
          badge.title = (total < TARGET ? `Sugestão: meta ${TARGET} posts/dia. Atualmente ${total}. Collab não conta.` : 'Meta diária atingida') + ' — clique para ver todas as postagens do dia';
        }
      });

      // contagem no topo da toolbar — só o total de postagens do mês (inclui collab, ao
      // contrário do badge por dia acima, que é uma métrica de meta diária). Clicar nela
      // abre o resumo do mês (renderMonthSummary), quebrado por Tipo/Editoria/Redes sociais
      const summaryEl = $('aiSummary');
      if(summaryEl){
        const prefix = `${YEAR}-${String(MONTH+1).padStart(2,'0')}-`;
        const monthPostsCount = state.posts.filter(p=> (p.date||'').startsWith(prefix)).length;
        summaryEl.textContent = `${monthPostsCount} postage${monthPostsCount===1?'m':'ns'} neste mês`;
      }
      if(currentView==='list') renderListView();
      // mantém os popups de "postagens do dia" e "resumo do mês" em dia com qualquer mudança
      // (edição, exclusão, duplicação, arrastar...), já que praticamente toda ação de estado
      // passa por aqui — cada função só faz algo se o respectivo modal estiver aberto
      renderDayPostsList();
      renderMonthSummary();

      // se buildCalendar() capturou alturas antes de reconstruir o grid, anima a troca (FLIP):
      // fixa a célula na altura antiga, força reflow, e solta pra altura nova já com a transição
      // de "height" definida em .day — assim a linha da semana cresce/encolhe suavemente em vez
      // de saltar direto pro tamanho final quando um card muda de dia
      if(pendingRowHeights){
        const old = pendingRowHeights; pendingRowHeights = null;
        document.querySelectorAll('.day[data-date]').forEach(cell=>{
          const oldH = old.get(cell.dataset.date);
          if(oldH==null) return;
          const newH = cell.getBoundingClientRect().height;
          if(Math.abs(newH-oldH)<1) return;
          cell.style.height = oldH+'px';
          void cell.offsetHeight; // força reflow com a altura antiga antes de animar
          requestAnimationFrame(()=>{
            cell.style.height = newH+'px';
            cell.addEventListener('transitionend', function te(ev){
              if(ev.propertyName && ev.propertyName!=='height') return;
              cell.style.height = '';
              cell.removeEventListener('transitionend', te);
            });
          });
        });
      }
    }

    // ============================================================
    // POPUP "POSTAGENS DO DIA" — abre ao clicar no badge "+N" da célula,
    // quando o dia tem mais cards do que cabem nela (grade mostra só 3)
    // ============================================================
    let openDayPostsDate = null; // data (YYYY-MM-DD) do popup aberto, ou null se fechado
    function openDayPosts(dateStr){
      openDayPostsDate = dateStr;
      renderDayPostsList();
      $('dayPostsBackdrop').style.display = 'flex';
    }
    function closeDayPosts(){ openDayPostsDate = null; $('dayPostsBackdrop').style.display = 'none'; }
    function renderDayPostsList(){
      if(!openDayPostsDate) return;
      const container = $('dayPostsList'); if(!container) return;
      const list = sortByOrder(getFilteredPosts().filter(p=>p.date===openDayPostsDate));
      // dia sem postagens (ou que ficou sem nenhuma, filtrada/apagada, enquanto o modal estava
      // aberto) mostra uma mensagem em vez de fechar sozinho — o modal abre pra qualquer
      // quantidade de postagens, incluindo zero
      container.innerHTML = list.length>0
        ? ''
        : `<div style="padding:28px 16px;text-align:center;color:var(--muted);font-size:13px">Nenhuma postagem neste dia.</div>`;
      list.forEach(p=> container.appendChild(createListRow(p)));
      const [y,m,d] = openDayPostsDate.split('-').map(Number);
      const label = new Date(y, m-1, d).toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long' });
      $('dayPostsTitle').textContent = `Postagens de ${label}`;
    }

    // ============================================================
    // RESUMO DO MÊS — dropdown pequeno, ancorado logo abaixo do botão
    // de contagem de postagens da toolbar, quebrando o total do mês
    // por Tipo, Editoria ou Redes sociais, conforme o botão selecionado
    // ============================================================
    let monthSummaryOpen = false;
    let monthSummaryGroupBy = 'type'; // 'type' | 'editoria' | 'rede' — persiste entre aberturas
    function openMonthSummary(){
      monthSummaryOpen = true;
      renderMonthSummary();
      $('monthSummaryDropdown').classList.add('open');
      $('aiSummary').setAttribute('aria-expanded','true');
    }
    function closeMonthSummary(){
      monthSummaryOpen = false;
      $('monthSummaryDropdown').classList.remove('open');
      $('aiSummary').setAttribute('aria-expanded','false');
    }
    function toggleMonthSummary(){ monthSummaryOpen ? closeMonthSummary() : openMonthSummary(); }
    // agrupa as postagens do mês atualmente visível (viewDate) por Tipo (Estático/Vídeo),
    // Editoria ou Rede social, contando 1 por rede quando a postagem tem várias (uma
    // postagem com Instagram+Facebook soma 1 em cada uma dessas redes no agrupamento "rede")
    function computeMonthSummaryData(groupBy){
      const YEAR = viewDate.getFullYear(), MONTH = viewDate.getMonth();
      const prefix = `${YEAR}-${String(MONTH+1).padStart(2,'0')}-`;
      const posts = state.posts.filter(p=> (p.date||'').startsWith(prefix));
      const counts = {};
      const bump = (key, color)=>{ counts[key] = counts[key] || { count:0, color }; counts[key].count++; };
      posts.forEach(p=>{
        if(groupBy==='type'){
          const isVideo = postChannelEntries(p).some(c=>(c.types||[]).some(t=>(t||'').toLowerCase()==='video'));
          bump(isVideo?'Vídeo':'Estático', isVideo?'var(--accent-ink)':'var(--muted)');
        } else if(groupBy==='editoria'){
          const eds = Array.isArray(p.editoria)?p.editoria:[p.editoria].filter(Boolean);
          if(eds.length===0) bump('Sem editoria','var(--text-faint)');
          else eds.forEach(ed=> bump(ed, editoriaColor(ed)));
        } else {
          postChannelEntries(p).forEach(c=> bump(c.channel, networkColor(c.channel)));
        }
      });
      const rows = Object.entries(counts).map(([name,v])=>({ name, count:v.count, color:v.color })).sort((a,b)=> b.count-a.count);
      return { total: posts.length, rows };
    }
    function renderMonthSummary(){
      if(!monthSummaryOpen) return;
      const list = $('monthSummaryList'); if(!list) return;
      const data = computeMonthSummaryData(monthSummaryGroupBy);
      const monthLabel = viewDate.toLocaleString('pt-BR', { month:'long', year:'numeric' });
      $('monthSummaryTitle').textContent = `${data.total} postage${data.total===1?'m':'ns'} em ${monthLabel}`;
      if(data.rows.length===0){ list.innerHTML = `<div style="padding:16px 4px;text-align:center;color:var(--muted);font-size:12.5px">Nenhuma postagem neste mês.</div>`; return; }
      list.innerHTML = data.rows.map(r=>
        `<div class="ms-row"><span class="ms-row-label"><span class="dot" style="background:${r.color}"></span>${escapeHtml(r.name)}</span><span class="ms-row-count">${r.count}</span></div>`
      ).join('');
    }

    // ============================================================
    // BUSCA DE POSTAGENS — painel ancorado na lupa do cabeçalho, ao lado de "Configurações".
    // Filtra state.posts inteiro (não só o mês visível no calendário) por título, produto ou
    // observações, pra achar uma postagem antiga sem precisar navegar mês a mês. Clicar num
    // resultado abre a postagem direto no modal de edição.
    // ============================================================
    function openSearchPanel(){
      $('pageHeaderActions').classList.add('search-active');
      $('openSearch').setAttribute('aria-expanded','true');
      renderSearchResults($('searchInput').value);
      $('searchInput').focus();
    }
    function closeSearchPanel(){
      $('pageHeaderActions').classList.remove('search-active');
      $('openSearch').setAttribute('aria-expanded','false');
      $('searchResults').classList.remove('open');
      $('searchInput').value = '';
    }
    function toggleSearchPanel(){ $('pageHeaderActions').classList.contains('search-active') ? closeSearchPanel() : openSearchPanel(); }
    function renderSearchResults(rawQuery){
      const box = $('searchResults'); if(!box) return;
      box.classList.add('open');
      const query = normalizeStr(rawQuery.trim());
      if(!query){ box.innerHTML = `<div class="search-hint">Digite para buscar em todas as postagens.</div>`; return; }
      const matches = state.posts.filter(p=>{
        const productsText = getPostProducts(p).map(pr=> `${pr.code||''} ${pr.name||''}`).join(' ');
        const haystack = normalizeStr([p.title, p.notes, productsText].filter(Boolean).join(' '));
        return haystack.includes(query);
      }).sort((a,b)=> (b.date||'').localeCompare(a.date||'')).slice(0, 30);
      if(matches.length===0){ box.innerHTML = `<div class="search-empty">Nenhuma postagem encontrada.</div>`; return; }
      box.innerHTML = matches.map(p=>{
        const entries = postChannelEntries(p);
        const netsHtml = entries.map(c=> networkIcon(c.channel)).join('');
        const dateLabel = p.date ? formatDatePt(p.date) : 'Sem data';
        return `<div class="search-result-row" data-id="${escapeHtml(p.id)}"><span class="search-result-nets">${netsHtml}</span><span class="search-result-body"><span class="search-result-title">${escapeHtml(p.title || '(Sem título)')}</span><span class="search-result-meta">${escapeHtml(dateLabel)}</span></span></div>`;
      }).join('');
      box.querySelectorAll('.search-result-row').forEach(row=>{
        row.addEventListener('click', ()=>{
          closeSearchPanel();
          openEditModal(row.dataset.id);
        });
      });
    }

    // ============================================================
    // MODAL DE CRIAR/EDITAR POSTAGEM — abrir, fechar e salvar
    // (uma postagem por rede selecionada é criada ao salvar)
    // ============================================================
    // mostra/esconde o aviso sobre a distribuição atual da postagem — Redes, Formato e Tipo
    // continuam sempre editáveis (mesmo numa postagem vinda do agendamento de uma editoria, que
    // por padrão pode ter uma combinação diferente de tipo/formato por rede); o aviso só avisa
    // que, ao salvar, o Formato/Tipo escolhidos abaixo passam a valer para todas as redes
    // marcadas, substituindo a combinação por rede que o agendamento tinha configurado
    function setModalMultiChannelState(heterogeneous, post){
      const note = $('mMultiChannelNote');
      if(note){
        note.style.display = heterogeneous ? 'block' : 'none';
        if(heterogeneous) note.textContent = `Esta postagem tem formato/tipo diferentes por rede (definidos pelo agendamento da editoria): ${postChannelsDetailText(post)}. Ao salvar aqui, o Formato e o Tipo escolhidos abaixo passam a valer para todas as redes marcadas.`;
      }
    }

    function openModal(dateStr){
      $('modalBackdrop').style.display = 'flex';
      // pré-preenche a data: a recebida por parâmetro (ex: "+ Adicionar postagem" de uma coluna
      // da semana) ou, na ausência dela, o mês/dia atualmente visível no calendário
      const defaultDate = dateStr || viewDate.toISOString().slice(0,10);
      $('mDate').value = defaultDate;
      // limpa os campos do formulário
      $('mTitle').value=''; $('mNotes').value=''; $('mProductName').value='';
      $('mBriefingLink').value=''; $('mReferencesLink').value=''; $('mArtsLink').value='';
      $('mImageLink').value=''; $('mImageNotes').value='';
      document.querySelectorAll('.mNet').forEach(n=>n.checked=false); document.querySelectorAll('.mEditoria').forEach(e=>e.checked=false);
      // formato depende da(s) rede(s) escolhida(s) — sem rede marcada, não há formato para pré-selecionar
      renderModalFormatsUI();
      document.querySelector('input[name="mType"][value="Static"]').checked = true;
      selectedProducts = [];
      renderSelectedProducts();
      hideProductSuggestions();
      setModalMultiChannelState(false, null);
      // postagem nova ainda não existe — não há o que duplicar/excluir
      if($('modalMenuBtn')) $('modalMenuBtn').style.display = 'none';
      $('mTitle').focus();
    }

    function closeModal(){
      $('modalBackdrop').style.display = 'none';
    }

    function saveModal(){
      const title = $('mTitle').value.trim() || 'Untitled';
      const date = $('mDate').value;
      if(!date){ alert('Escolha uma data'); return; }
      const place = [...new Set(Array.from(document.querySelectorAll('input[name="mPlace"]:checked')).map(n=>n.value))];
      const type = document.querySelector('input[name="mType"]:checked').value;
      // o status e o collab não têm mais controle próprio neste modal (mudança de status/collab
      // agora é feita pela edição em lote, com várias postagens selecionadas) — postagem nova
      // recebe o primeiro status configurado e collab desligado; ao editar, ambos são preservados
      const defaultStatus = (APP_SETTINGS.statuses[0] && APP_SETTINGS.statuses[0].name) || 'Rascunho';
      const notes = $('mNotes').value.trim();
      const briefingLink = $('mBriefingLink').value.trim();
      const referencesLink = $('mReferencesLink').value.trim();
      const artsLink = $('mArtsLink').value.trim();
      const imageLink = $('mImageLink').value.trim();
      const imageNotes = $('mImageNotes').value.trim();
      const nets = Array.from(document.querySelectorAll('.mNet:checked')).map(n=>n.value);
      const editorias = Array.from(document.querySelectorAll('.mEditoria:checked')).map(e=>e.value);
      const products = selectedProducts.slice();
      if(nets.length===0){ alert('Selecione pelo menos uma rede'); return; }
      if(place.length===0){ alert('Selecione pelo menos um formato'); return; }
      if(isEditing && editingId){
        // modo edição: atualiza apenas a postagem existente
        const pid = editingId;
        const post = state.posts.find(p=>p.id===pid);
        if(!post) return;
        const before = Object.assign({}, post);
        const dateChanged = post.date !== date;
        post.title = title; post.date = date; post.notes = notes;
        post.briefingLink = briefingLink; post.referencesLink = referencesLink; post.artsLink = artsLink;
        post.imageLink = imageLink; post.imageNotes = imageNotes;
        post.editoria = editorias; post.products = products; delete post.productCode; delete post.productName;
        // redes, formato e tipo são sempre reconstruídos a partir do que está marcado no modal —
        // mesmo numa postagem vinda do agendamento de uma editoria (que por padrão pode ter uma
        // combinação diferente de tipo/formato por rede), o Formato/Tipo escolhidos aqui passam
        // a valer para todas as redes marcadas, sobrescrevendo essa combinação por rede
        post.channel = nets[0]; post.place = place.slice(); post.type = type;
        post.channels = nets.map(net=>({ channel: net, types: [type], places: place.slice() }));
        // se a data mudou, a postagem vai para o fim do novo dia
        if(dateChanged) post.order = nextOrderForDate(date, post.id);
        saveState(); render(); closeModal();
        pushUndo({ type:'edit', id: pid, before });
        redoStack = [];
        closeEditState();
        return;
      }

      // uma postagem só, mesmo com várias redes marcadas — a distribuição fica em post.channels
      // e aparece resumida no card ("N redes", "N formatos")
      const p = {
        id: generateId(), title, date, channel: nets[0], place: place.slice(), type,
        channels: nets.map(net=>({ channel: net, types: [type], places: place.slice() })),
        status: defaultStatus, notes, briefingLink, referencesLink, artsLink, imageLink, imageNotes, collab: false, color: null, editoria: editorias, products: products.slice(), order: nextOrderForDate(date)
      };
      state.posts.push(p);
      saveState();
      render();
      closeModal();
      // registra a ação no histórico (desfazer = apagar a postagem criada)
      pushUndo({ type:'create', posts: [p.id] });
      // uma nova ação invalida o histórico de refazer
      redoStack = [];
      // limpa o modal para a próxima criação
      $('mTitle').value=''; $('mNotes').value=''; $('mBriefingLink').value=''; $('mReferencesLink').value=''; $('mArtsLink').value='';
      $('mImageLink').value=''; $('mImageNotes').value='';
      document.querySelectorAll('.mNet').forEach(n=>n.checked=false);
      document.querySelectorAll('.mEditoria').forEach(e=>e.checked=false); $('mProductName').value=''; selectedProducts=[]; renderSelectedProducts();
      renderModalFormatsUI();
    }

    // ============================================================
    // PERSISTÊNCIA DAS POSTAGENS (localStorage)
    // ============================================================
    function saveState(){
      localStorage.setItem('calendar_posts_v1', JSON.stringify(state.posts));
      scheduleSyncPush('posts', ()=> state.posts);
    }

    function loadState(){
      const raw = localStorage.getItem('calendar_posts_v1');
      if(raw){ try{ state.posts = JSON.parse(raw) || []; }catch(e){ state.posts=[]; } }
      // garante que toda postagem tenha id e status válidos
      const defaultStatus = (APP_SETTINGS.statuses[0] && APP_SETTINGS.statuses[0].name) || 'Rascunho';
      state.posts.forEach(p=>{ if(!p.id) p.id = generateId(); if(!p.status) p.status = defaultStatus; });
      // atribui `order` às postagens salvas antes desse campo existir
      migratePostOrders();
    }

    // ============================================================
    // CONFIGURAÇÕES DA APLICAÇÃO — redes, editorias, formatos,
    // status, catálogo de produtos e metas (persistidas no localStorage)
    // ============================================================
    const BRAND_COLORS = { Instagram:'#E4405F', Facebook:'#1877F2', Twitter:'#1DA1F2', LinkedIn:'#0A66C2', TikTok:'#010101', Blog:'#ef4444', Email:'#374151' };
    const BRAND_SHORT_NAMES = { Instagram:'IG', Twitter:'TW', LinkedIn:'LI', TikTok:'TT', Blog:'BL', Email:'EM' };
    // formatos padrão por rede — cada rede tem seu próprio conjunto (ex: Reels só existe no Instagram),
    // cada formato com as dimensões (px) e extensões de arquivo aceitas
    const NETWORK_DEFAULT_FORMATS = {
      Instagram: [
        { name:'Feed Vertical', width:1080, height:1350, extensions:['JPG','PNG','MP4'] },
        { name:'Stories', width:1080, height:1920, extensions:['JPG','PNG','MP4'] },
        { name:'Reels', width:1080, height:1920, extensions:['MP4'] }
      ],
      Facebook: [
        { name:'Feed', width:1200, height:630, extensions:['JPG','PNG','MP4'] },
        { name:'Stories', width:1080, height:1920, extensions:['JPG','PNG','MP4'] },
        { name:'Reels', width:1080, height:1920, extensions:['MP4'] }
      ],
      Twitter: [{ name:'Post', width:1200, height:675, extensions:['JPG','PNG','MP4'] }],
      LinkedIn: [
        { name:'Post', width:1200, height:627, extensions:['JPG','PNG','MP4'] },
        { name:'Artigo', width:1200, height:644, extensions:['JPG','PNG'] }
      ],
      TikTok: [{ name:'Vídeo', width:1080, height:1920, extensions:['MP4'] }],
      Blog: [{ name:'Post', width:1200, height:630, extensions:['JPG','PNG'] }],
      Email: [{ name:'Email', width:600, height:800, extensions:['JPG','PNG'] }]
    };
    const DEFAULT_SETTINGS = {
      TARGET: 3,
      networks: [
        { name:'Instagram', shortName:'IG', color:'#E4405F', formats: NETWORK_DEFAULT_FORMATS.Instagram.map(f=>Object.assign({},f)) },
        { name:'Facebook', shortName:'FB', color:'#1877F2', formats: NETWORK_DEFAULT_FORMATS.Facebook.map(f=>Object.assign({},f)) },
        { name:'TikTok', shortName:'TT', color:'#010101', formats: NETWORK_DEFAULT_FORMATS.TikTok.map(f=>Object.assign({},f)) },
        { name:'Twitter', shortName:'TW', color:'#1DA1F2', formats: NETWORK_DEFAULT_FORMATS.Twitter.map(f=>Object.assign({},f)) },
        { name:'LinkedIn', shortName:'LI', color:'#0A66C2', formats: NETWORK_DEFAULT_FORMATS.LinkedIn.map(f=>Object.assign({},f)) },
        { name:'Blog', shortName:'BL', color:'#ef4444', formats: NETWORK_DEFAULT_FORMATS.Blog.map(f=>Object.assign({},f)) },
        { name:'Email', shortName:'EM', color:'#374151', formats: NETWORK_DEFAULT_FORMATS.Email.map(f=>Object.assign({},f)) }
      ],
      editorias: [
        { name:'Informativo', color:'#7c3aed' },
        { name:'Destaques', color:'#0284c7' },
        { name:'Lançamentos', color:'#16a34a' },
        { name:'Dica VONDER', color:'#b45309' },
        { name:'Trend', color:'#db2777' },
        { name:'Personalizado', color:'#64748b' }
      ],
      statuses: [
        { name:'Rascunho', color:'#94a3b8' },
        { name:'Em produção', color:'#f59e0b' },
        { name:'Aprovado', color:'#10b981' },
        { name:'Agendado', color:'#6366f1' }
      ],
      catalog: []
    };
    let APP_SETTINGS = Object.assign({}, DEFAULT_SETTINGS);

    function saveSettings(){
      // grava as configurações e a meta principal
      APP_SETTINGS.TARGET = TARGET;
      localStorage.setItem('calendar_settings_v1', JSON.stringify(APP_SETTINGS));
      scheduleSyncPush('settings', ()=> APP_SETTINGS);
    }

    function loadSettings(){
      const raw = localStorage.getItem('calendar_settings_v1');
      if(raw){ try{ const s = JSON.parse(raw); APP_SETTINGS = Object.assign({}, DEFAULT_SETTINGS, s||{}); if(!APP_SETTINGS.statuses || !APP_SETTINGS.statuses.length) APP_SETTINGS.statuses = DEFAULT_SETTINGS.statuses.slice();
        // acrescenta às editorias já salvas as categorizações default que ainda não existem
        // (por nome), sem mexer nas que o usuário já tinha customizado
        if(!APP_SETTINGS.editorias) APP_SETTINGS.editorias = [];
        DEFAULT_SETTINGS.editorias.forEach(def=>{ if(!APP_SETTINGS.editorias.some(e=>e.name===def.name)) APP_SETTINGS.editorias.push(Object.assign({},def)); });
        // mesma lógica pras redes padrão (ex: Facebook) — acrescenta as que faltam por nome,
        // sem mexer nas redes que o usuário já tinha configurado
        if(!APP_SETTINGS.networks) APP_SETTINGS.networks = [];
        DEFAULT_SETTINGS.networks.forEach(def=>{ if(!APP_SETTINGS.networks.some(n=> (typeof n==='string'?n:n.name)===def.name)) APP_SETTINGS.networks.push(Object.assign({}, def, { formats: def.formats.map(f=>Object.assign({},f)) })); });
        // reordena pela ordem canônica das redes padrão (ex: TikTok logo após Facebook), mantendo
        // redes customizadas pelo usuário na posição relativa em que já estavam, ao final
        { const order = new Map(DEFAULT_SETTINGS.networks.map((n,i)=>[n.name,i]));
          APP_SETTINGS.networks = APP_SETTINGS.networks.map((n,i)=>({ n, i })).sort((a,b)=>{
            const ra = order.has(a.n.name) ? order.get(a.n.name) : Infinity;
            const rb = order.has(b.n.name) ? order.get(b.n.name) : Infinity;
            return ra===rb ? a.i-b.i : ra-rb;
          }).map(x=>x.n); }
        TARGET = APP_SETTINGS.TARGET || TARGET; }catch(e){ APP_SETTINGS = Object.assign({}, DEFAULT_SETTINGS); } }
      // migra o formato antigo de redes (string simples) para {name,color}
      APP_SETTINGS.networks = (APP_SETTINGS.networks||[]).map((n,i)=> typeof n === 'string' ? { name:n, color: BRAND_COLORS[n] || TAG_PALETTE[i % TAG_PALETTE.length] } : n);
      // migra redes sem "formats" (config antiga, quando Formato era uma lista global única):
      // usa os formatos padrão da rede se conhecida, senão reaproveita a antiga lista global "places", senão "Feed"
      const legacyPlaces = Array.isArray(APP_SETTINGS.places) && APP_SETTINGS.places.length ? APP_SETTINGS.places.map(p=>({name:p})) : null;
      APP_SETTINGS.networks.forEach((n,i)=>{
        // nome curto (ex: "IG"), usado em exibições compactas — usa o padrão conhecido, senão as 2 primeiras letras
        if(!n.shortName) n.shortName = BRAND_SHORT_NAMES[n.name] || n.name.slice(0,2).toUpperCase();
        if(!Array.isArray(n.formats) || n.formats.length===0){
          const defaults = NETWORK_DEFAULT_FORMATS[n.name];
          n.formats = (defaults ? defaults.map(f=>Object.assign({},f)) : null) || (legacyPlaces ? legacyPlaces.map(f=>Object.assign({},f)) : [{name:'Feed'}]);
        }
        // garante os campos de um formato (largura/altura/extensões), e descarta o antigo "forceType"
        n.formats.forEach(f=>{
          delete f.forceType;
          if(typeof f.width !== 'number') f.width = null;
          if(typeof f.height !== 'number') f.height = null;
          if(!Array.isArray(f.extensions)) f.extensions = [];
        });
      });
      delete APP_SETTINGS.places;
      // migra o formato antigo de editorias (string simples) para {name, schedule?} e garante
      // que cada uma tenha cor própria — as antigas recebem a mesma cor por índice da paleta
      // que já exibiam antes, então nada muda visualmente para quem já usava
      APP_SETTINGS.editorias = (APP_SETTINGS.editorias||[]).map(e=> typeof e === 'string' ? { name:e } : e);
      APP_SETTINGS.editorias.forEach((e,i)=>{ if(!e.color) e.color = TAG_PALETTE[i % TAG_PALETTE.length]; });
      // migra o formato antigo de agendamento (uma rede/formato/tipo únicos) para o novo,
      // que permite várias redes, cada uma com vários tipos e vários formatos
      APP_SETTINGS.editorias.forEach(e=>{
        if(e.schedule && !Array.isArray(e.schedule.channels)){
          const { weekdays, channel, place, type } = e.schedule;
          e.schedule = { weekdays, channels: channel ? [{ channel, types: type?[type]:['Static'], places: place?[place]:[] }] : [] };
        }
      });
    }

    // ============================================================
    // SINCRONIZAÇÃO COM O SERVIDOR (api.php + banco SQLite) — o localStorage
    // continua sendo gravado normalmente (cache local/offline), mas quando a página
    // é servida por HTTP (não aberta como arquivo local) o servidor passa a ser a
    // fonte da verdade: ao abrir, busca posts/settings do banco; a cada save, envia
    // a versão mais nova pro servidor; e a cada X segundos busca de novo, pra pegar
    // alterações feitas por outras pessoas da equipe. Se o servidor não responder
    // (api.php ausente, sem PHP configurado, offline...), o app degrada de volta pro
    // comportamento antigo, só com localStorage — nada quebra.
    // ============================================================
    const SYNC_ENABLED = location.protocol !== 'file:';
    // updated_at (timestamp do servidor) da última versão de posts/settings que este
    // navegador conhece — enviado a cada save como "expected_updated_at": se alguém
    // salvou por cima nesse meio tempo, o servidor recusa (409) em vez de aceitar
    // e sobrescrever silenciosamente o trabalho da outra pessoa
    const syncVersions = { posts: 0, settings: 0 };
    const syncPushTimers = {};
    function setSyncStatus(text, kind){
      const el = $('syncStatus'); if(!el) return;
      el.textContent = text;
      el.className = 'sync-status' + (kind ? ' '+kind : '');
    }
    // true se algum modal estiver aberto — usado pra não recarregar dados do servidor
    // (e redesenhar a tela) enquanto a pessoa está no meio de uma edição
    function anyModalOpen(){
      return ['modalBackdrop','settingsBackdrop','bulkEditBackdrop','filtersBackdrop'].some(id=>{
        const el = $(id); return el && el.style.display === 'flex';
      });
    }
    async function syncFetch(key){
      const res = await fetch(`api.php?k=${key}`, { cache:'no-store' });
      if(!res.ok) throw new Error('sync fetch '+res.status);
      return res.json();
    }
    async function syncPush(key, value){
      const res = await fetch(`api.php?k=${key}`, {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ v:value, expected_updated_at: syncVersions[key] })
      });
      const data = await res.json().catch(()=>({}));
      if(res.status===409) return { conflict:true, server:data };
      if(!res.ok) throw new Error('sync push '+res.status);
      syncVersions[key] = data.updated_at;
      return { conflict:false };
    }
    // agenda o envio pro servidor com um pequeno atraso, pra juntar várias chamadas
    // de saveState()/saveSettings() em sequência (ex: durante um drag) numa só requisição
    function scheduleSyncPush(key, getValue){
      if(!SYNC_ENABLED) return;
      clearTimeout(syncPushTimers[key]);
      syncPushTimers[key] = setTimeout(async ()=>{
        setSyncStatus('Salvando no servidor…');
        try{
          const result = await syncPush(key, getValue());
          if(result.conflict){
            // outra pessoa salvou primeiro: adota a versão do servidor em vez de sobrescrever
            const storageKey = key==='posts' ? 'calendar_posts_v1' : 'calendar_settings_v1';
            localStorage.setItem(storageKey, JSON.stringify(result.server.v));
            if(key==='posts') loadState(); else loadSettings();
            syncVersions[key] = result.server.updated_at;
            if(!anyModalOpen()){ renderAllDynamicUI(); buildCalendar(); render(); }
            setSyncStatus('Atualizado com mudanças de outra pessoa', 'warn');
            alert('Outra pessoa salvou uma alteração enquanto você editava. Os dados foram atualizados com a versão mais recente do servidor — se sua última ação não aparecer, refaça-a.');
          } else {
            setSyncStatus('Sincronizado com o servidor', 'ok');
          }
        }catch(e){
          setSyncStatus('Falha ao salvar no servidor (ficou salvo só neste navegador)', 'warn');
        }
      }, 700);
    }
    // busca a versão mais recente do servidor e aplica localmente, reaproveitando
    // loadState()/loadSettings() (grava no localStorage e roda as mesmas migrações de sempre)
    async function syncPull(showIdleStatus){
      if(!SYNC_ENABLED) return;
      try{
        const [postsRes, settingsRes] = await Promise.all([syncFetch('posts'), syncFetch('settings')]);
        let changed = false;
        if(settingsRes.v!==null && settingsRes.updated_at!==syncVersions.settings){
          localStorage.setItem('calendar_settings_v1', JSON.stringify(settingsRes.v));
          loadSettings(); changed = true;
        }
        syncVersions.settings = settingsRes.updated_at;
        if(postsRes.v!==null && postsRes.updated_at!==syncVersions.posts){
          localStorage.setItem('calendar_posts_v1', JSON.stringify(postsRes.v));
          loadState(); changed = true;
        }
        syncVersions.posts = postsRes.updated_at;
        if(changed && !anyModalOpen()){ renderAllDynamicUI(); buildCalendar(); render(); }
        if(changed || showIdleStatus) setSyncStatus('Sincronizado com o servidor', 'ok');
      }catch(e){
        setSyncStatus('Sem conexão com o servidor — usando cópia local', 'warn');
      }
    }

    // nomes das editorias como lista de strings — usado onde é preciso comparar/colorir por nome
    function editoriaNames(){ return APP_SETTINGS.editorias.map(e=>e.name); }
    // cor da editoria pelo nome; para nomes fora do cadastro (ex: posts antigos de uma
    // editoria removida) mantém o fallback por índice da paleta
    function editoriaColor(name){
      const e = APP_SETTINGS.editorias.find(x=>x.name===name);
      if(e && e.color) return e.color;
      return tagColor(name, editoriaNames());
    }

    // ============================================================
    // FORMATOS POR REDE — cada rede social tem seu próprio conjunto de formatos
    // (ex: Instagram = Feed Vertical/Stories/Reels, Twitter = Post), cada um com
    // largura, altura (px) e extensões de arquivo aceitas.
    // ============================================================
    // união (sem duplicar nomes) de todos os formatos de todas as redes — usado em Filtros e Edição em Lote
    function allFormatNames(){
      const out = [];
      APP_SETTINGS.networks.forEach(n=> (n.formats||[]).forEach(f=>{ if(!out.includes(f.name)) out.push(f.name); }));
      return out;
    }
    // união dos formatos disponíveis para um conjunto de redes selecionadas — usado no modal de criar/editar postagem
    function formatsForNetworks(networkNames){
      const out = [];
      (networkNames||[]).forEach(nn=>{
        const net = APP_SETTINGS.networks.find(x=>x.name===nn);
        (net && net.formats || []).forEach(f=>{ if(!out.some(x=>x.name===f.name)) out.push(f); });
      });
      return out;
    }

    // ============================================================
    // UI DINÂMICA GERADA A PARTIR DAS CONFIGURAÇÕES — reconstrói
    // abas, listas de opções e o painel de Configurações sempre
    // que uma rede/editoria/formato/status/produto muda
    // ============================================================
    function renderTabs(){
      const tabs = $('tabs'); tabs.innerHTML = '';
      const allBtn = document.createElement('button'); allBtn.className='btn ghost'; allBtn.dataset.tab='All'; allBtn.id='tabAll'; allBtn.textContent='Todas'; tabs.appendChild(allBtn);
      APP_SETTINGS.networks.forEach(n=>{ const b = document.createElement('button'); b.className='btn ghost icon-only'; b.dataset.tab = n.name; b.title = n.name; b.setAttribute('aria-label', n.name); b.innerHTML = networkIcon(n.name); tabs.appendChild(b); });
      // liga o clique de cada aba
      tabs.querySelectorAll('button').forEach(b=>{ b.addEventListener('click', ()=>{ tabs.querySelectorAll('button').forEach(x=>x.classList.add('ghost')); b.classList.remove('ghost'); tabs.classList.toggle('all-active', b.dataset.tab==='All'); activeTab = b.dataset.tab; render(); }); });
      // garante que a aba ativa esteja com a classe correta após reconstruir a lista
      const active = Array.from(tabs.children).find(x=>x.dataset.tab===activeTab) || tabs.children[0]; if(active){ tabs.querySelectorAll('button').forEach(x=>x.classList.add('ghost')); active.classList.remove('ghost'); }
      tabs.classList.toggle('all-active', activeTab==='All');
    }

    // nome da rede cujo sub-dropdown de formatos está aberto em Configurações (persiste entre
    // re-renders, já que qualquer alteração nas configurações reconstrói a lista inteira)
    let openNetworkFormats = null;
    // nome da rede cujos campos (nome/nome curto/ícone) estão em modo de edição — mesma lógica de persistência
    let editingNetworkName = null;
    // nome da editoria atualmente em modo de edição inline na tela de Configurações (ou null)
    let editingEditoriaName = null;
    // nome da editoria cujo painel de "dias fixos e formatos" está aberto para edição (ou null)
    let openEditoriaSchedule = null;
    // handle do buildScheduleEditor() ativo no formulário de "+ Adicionar" editoria
    let newEditoriaScheduleEditor = null;

    function renderNetsUI(){
      // checkboxes de rede dentro do modal de criar/editar postagem — mudar a rede também
      // atualiza as opções de Formato disponíveis (cada rede tem seu próprio conjunto)
      const c = $('netsContainer'); if(c){ c.innerHTML = ''; APP_SETTINGS.networks.forEach(n=>{ const lbl = document.createElement('label'); lbl.className = 'chip-net'; lbl.title = n.name; lbl.innerHTML = `<input type="checkbox" class="mNet" value="${escapeHtml(n.name)}" aria-label="${escapeHtml(n.name)}" />${networkIcon(n.name)}`; c.appendChild(lbl); lbl.querySelector('input').addEventListener('change', ()=>{ renderModalFormatsUI(); refreshModalDynamic(); }); }); }
      renderModalFormatsUI();

      // lista de redes cadastradas na tela de Configurações — cada uma com um sub-dropdown
      // para gerenciar seus próprios formatos (nome, largura, altura e extensões aceitas)
      const list = $('netsList');
      if(list){
        list.innerHTML = '';
        APP_SETTINGS.networks.forEach(n=>{
          const row = document.createElement('div');
          row.className = 'net-row';
          const formatsSummary = (n.formats||[]).map(f=>f.name).join(', ') || 'nenhum';
          row.innerHTML = `
            <div class="net-row-head">
              <span class="net-view">
                <span class="net-view-icon">${networkIcon(n.name)}</span>
                <span class="net-view-name">${escapeHtml(n.name)}</span>
                ${n.shortName?`<span class="net-view-short">(${escapeHtml(n.shortName)})</span>`:''}
              </span>
              <div class="net-edit-fields">
                <div class="net-edit-icon-picker"></div>
                <input type="text" class="net-edit-name" value="${escapeHtml(n.name)}" title="Nome da rede" style="flex:2;min-width:110px" />
                <input type="text" class="net-edit-short" value="${escapeHtml(n.shortName||'')}" maxlength="4" title="Nome curto" placeholder="Curto" style="flex:0 0 64px" />
              </div>
              <button type="button" class="net-row-formats-toggle">Formatos: ${escapeHtml(formatsSummary)} <span class="settings-caret">${UI_ICONS.chevronDown(11)}</span></button>
              <button type="button" class="btn ghost small net-edit-toggle" aria-label="Editar rede" title="Editar nome/nome curto/cor">${UI_ICONS.edit(13)}</button>
              <button type="button" class="btn ghost small net-remove-btn" aria-label="Remover rede">${UI_ICONS.x(13)}</button>
            </div>
            <div class="net-row-formats">
              <div class="net-row-formats-list" style="display:flex;flex-direction:column;gap:6px"></div>
              <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
                <input type="text" class="net-new-format-name" placeholder="Nome do formato (ex: Feed Vertical)" style="flex:2;min-width:140px" />
                <input type="number" class="net-new-format-width" placeholder="Largura (px)" min="1" style="flex:1;min-width:90px" />
                <input type="number" class="net-new-format-height" placeholder="Altura (px)" min="1" style="flex:1;min-width:90px" />
                <input type="text" class="net-new-format-ext" placeholder="Extensões (ex: JPG, PNG, MP4)" style="flex:1;min-width:150px" />
                <button type="button" class="btn ghost small net-add-format-btn">Adicionar</button>
              </div>
            </div>`;
          list.appendChild(row);
          if(openNetworkFormats === n.name) row.classList.add('open');
          if(editingNetworkName === n.name) row.classList.add('editing');

          // linhas com os formatos já cadastrados dessa rede (com botão de remover cada um)
          const fmtList = row.querySelector('.net-row-formats-list');
          (n.formats||[]).forEach(f=>{
            const dims = (f.width && f.height) ? `${f.width}×${f.height}px` : '';
            const exts = (f.extensions||[]).join(', ');
            const meta = [dims, exts].filter(Boolean).join(' · ');
            const item = document.createElement('div');
            item.className = 'format-row';
            item.innerHTML = `<span class="format-row-name">${escapeHtml(f.name)}</span>${meta?`<span class="format-row-meta">${escapeHtml(meta)}</span>`:''}<button type="button" class="btn ghost small net-remove-format-btn" aria-label="Remover formato">${UI_ICONS.x(13)}</button>`;
            item.querySelector('.net-remove-format-btn').addEventListener('click', (ev)=>{
              ev.stopPropagation();
              n.formats = (n.formats||[]).filter(x=>x.name!==f.name);
              saveSettings(); renderAllDynamicUI();
            });
            fmtList.appendChild(item);
          });

          // abre/fecha o sub-dropdown de formatos dessa rede
          row.querySelector('.net-row-formats-toggle').addEventListener('click', ()=>{
            openNetworkFormats = (openNetworkFormats === n.name) ? null : n.name;
            row.classList.toggle('open');
          });
          // remove a rede inteira
          row.querySelector('.net-remove-btn').addEventListener('click', ()=>{ APP_SETTINGS.networks = APP_SETTINGS.networks.filter(x=>x.name!==n.name); saveSettings(); renderAllDynamicUI(); });

          // lápis: alterna entre a exibição normal e os campos editáveis (nome/nome curto/cor)
          row.querySelector('.net-edit-toggle').addEventListener('click', ()=>{
            editingNetworkName = (editingNetworkName === n.name) ? null : n.name;
            row.classList.toggle('editing');
          });

          // edita o nome da rede — como o nome é usado como referência em postagens (post.channel) e
          // agendamentos de editoria, renomear atualiza essas referências também
          const nameInput = row.querySelector('.net-edit-name');
          nameInput.addEventListener('change', ()=>{
            const newName = nameInput.value.trim();
            if(!newName || newName === n.name){ nameInput.value = n.name; return; }
            if(APP_SETTINGS.networks.some(x=>x!==n && x.name===newName)){ alert('Já existe uma rede com esse nome.'); nameInput.value = n.name; return; }
            const oldName = n.name;
            n.name = newName;
            state.posts.forEach(p=>{ if(p.channel===oldName) p.channel = newName; if(Array.isArray(p.channels)) p.channels.forEach(c=>{ if(c.channel===oldName) c.channel = newName; }); });
            APP_SETTINGS.editorias.forEach(e=>{ if(e.schedule) (e.schedule.channels||[]).forEach(c=>{ if(c.channel===oldName) c.channel = newName; }); });
            if(openNetworkFormats===oldName) openNetworkFormats = newName;
            if(editingNetworkName===oldName) editingNetworkName = newName;
            saveState(); saveSettings(); renderAllDynamicUI(); render();
          });
          nameInput.addEventListener('keydown', ev=>{ if(ev.key==='Enter') nameInput.blur(); });

          // edita o nome curto (só afeta exibição, não precisa cascatear em nada)
          const shortInput = row.querySelector('.net-edit-short');
          shortInput.addEventListener('change', ()=>{
            n.shortName = shortInput.value.trim().toUpperCase() || n.name.slice(0,2).toUpperCase();
            shortInput.value = n.shortName;
            saveSettings(); render();
          });
          shortInput.addEventListener('keydown', ev=>{ if(ev.key==='Enter') shortInput.blur(); });

          // ícone da rede: preset colorido ou SVG customizado enviado pelo usuário — quando não há
          // ícone explícito mas o nome bate com um preset (ex: "Instagram"), mostra esse preset já
          // selecionado no seletor, já que é o que de fato aparece na linha (via networkIcon)
          const autoKey = normalizeIconKey(n.name);
          const effectiveIcon = n.icon || (PRESET_ICONS[autoKey] ? { type:'preset', key: autoKey } : null);
          renderIconPicker(row.querySelector('.net-edit-icon-picker'), effectiveIcon, (val)=>{ n.icon = val; saveSettings(); renderAllDynamicUI(); render(); });
          // adiciona um novo formato a essa rede
          row.querySelector('.net-add-format-btn').addEventListener('click', ()=>{
            const nameEl = row.querySelector('.net-new-format-name');
            const widthEl = row.querySelector('.net-new-format-width');
            const heightEl = row.querySelector('.net-new-format-height');
            const extEl = row.querySelector('.net-new-format-ext');
            const fname = nameEl.value.trim(); if(!fname) return;
            n.formats = n.formats || [];
            if(n.formats.some(x=>x.name===fname)){ alert('Esse formato já existe nessa rede.'); return; }
            const extensions = extEl.value.split(',').map(s=>s.trim().toUpperCase()).filter(Boolean);
            n.formats.push({ name: fname, width: parseInt(widthEl.value,10) || null, height: parseInt(heightEl.value,10) || null, extensions });
            saveSettings(); renderAllDynamicUI();
          });
        });
      }
    }

    const WEEKDAY_ABBR = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

    // Constrói, dentro de `container`, o editor de agendamento de uma editoria: dias fixos da
    // semana + redes/tipos/formatos em que ela publica. Permite marcar várias redes, várias
    // tipos por rede e vários formatos por tipo. Reutilizado tanto no formulário de nova
    // editoria quanto na edição inline de uma editoria já cadastrada — cada chamada monta sua
    // própria árvore de elementos, então várias instâncias podem coexistir na mesma tela.
    // Retorna { getValue() } que lê a seleção atual e devolve { weekdays, channels } (ou null
    // se não houver dias ou nenhuma rede totalmente configurada — tipo e formato marcados).
    function buildScheduleEditor(container, schedule){
      const weekdays = (schedule && schedule.weekdays) || [];
      const cfgByChannel = {};
      ((schedule && schedule.channels) || []).forEach(c=>{ cfgByChannel[c.channel] = { channel: c.channel, types: (c.types||[]).slice(), places: (c.places||[]).slice() }; });

      container.innerHTML = `
        <div>
          <label>Datas de publicação</label>
          <div style="font-size:11.5px;color:var(--muted);margin:-2px 0 4px">Opcional — dias fixos da semana em que essa editoria publica (ex: sempre segunda e quarta). Depois, use "Aplicar" para gerar os cards do mês visível no calendário.</div>
          <div class="sched-weekdays" style="display:flex;gap:4px;flex-wrap:wrap"></div>
        </div>
        <div>
          <label>Redes, tipos e formatos</label>
          <div style="font-size:11.5px;color:var(--muted);margin:-2px 0 4px">Marque quantas redes forem necessárias — cada uma pode ter vários tipos, e cada tipo, vários formatos.</div>
          <div class="sched-nets" style="display:flex;gap:6px;flex-wrap:wrap"></div>
          <div class="sched-net-configs" style="display:flex;flex-direction:column;gap:8px;margin-top:6px"></div>
        </div>`;

      const wd = container.querySelector('.sched-weekdays');
      WEEKDAY_ABBR.forEach((label,i)=>{
        const lbl=document.createElement('label'); lbl.className='chip'; lbl.style.padding='4px 8px';
        lbl.innerHTML = `<input type="checkbox" class="sched-weekday" value="${i}" ${weekdays.includes(i)?'checked':''} />${label}`;
        wd.appendChild(lbl);
      });
      const allChecked = weekdays.length===7;
      const allLbl = document.createElement('label'); allLbl.className='chip'; allLbl.style.padding='4px 8px';
      allLbl.innerHTML = `<input type="checkbox" class="sched-all-days" ${allChecked?'checked':''} />Todos os dias`;
      wd.appendChild(allLbl);
      wd.querySelectorAll('.sched-weekday').forEach(cb=>{ cb.disabled = allChecked; });
      allLbl.querySelector('input').addEventListener('change', (ev)=>{
        const on = ev.target.checked;
        wd.querySelectorAll('.sched-weekday').forEach(cb=>{ cb.checked = on; cb.disabled = on; });
      });

      const netsC = container.querySelector('.sched-nets');
      const configsC = container.querySelector('.sched-net-configs');

      // salva o que estiver marcado nos painéis visíveis antes de reconstruí-los, para não
      // perder a seleção de tipo/formato de uma rede ao marcar/desmarcar outra rede
      function syncVisiblePanelsIntoState(){
        configsC.querySelectorAll('.sched-net-config').forEach(panel=>{
          const net = panel.dataset.net;
          cfgByChannel[net] = cfgByChannel[net] || { channel: net, types: [], places: [] };
          cfgByChannel[net].types = Array.from(panel.querySelectorAll('.sched-type:checked')).map(el=>el.value);
          cfgByChannel[net].places = Array.from(panel.querySelectorAll('.sched-place:checked')).map(el=>el.value);
        });
      }

      function renderNetConfigs(){
        syncVisiblePanelsIntoState();
        const checkedNets = Array.from(netsC.querySelectorAll('.sched-net:checked')).map(el=>el.value);
        configsC.innerHTML = '';
        checkedNets.forEach(netName=>{
          const net = APP_SETTINGS.networks.find(x=>x.name===netName);
          const cfg = cfgByChannel[netName] || { channel: netName, types: [], places: [] };
          const panel = document.createElement('div');
          panel.className = 'sched-net-config'; panel.dataset.net = netName;
          panel.style.cssText = 'padding:8px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface-muted)';
          panel.innerHTML = `
            <div style="font-weight:600;font-size:12px;margin-bottom:4px">${escapeHtml(netName)}</div>
            <div style="font-size:11px;color:var(--muted);margin-bottom:2px">Tipo</div>
            <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px">
              <label class="chip"><input type="checkbox" class="sched-type" value="Static" ${cfg.types.includes('Static')?'checked':''}/> Estático</label>
              <label class="chip"><input type="checkbox" class="sched-type" value="Video" ${cfg.types.includes('Video')?'checked':''}/> Vídeo</label>
            </div>
            <div style="font-size:11px;color:var(--muted);margin-bottom:2px">Formato</div>
            <div style="display:flex;gap:4px;flex-wrap:wrap">
              ${(net && net.formats || []).map(f=>`<label class="chip"><input type="checkbox" class="sched-place" value="${escapeHtml(f.name)}" ${cfg.places.includes(f.name)?'checked':''}/> ${escapeHtml(f.name)}</label>`).join('') || '<span style="font-size:11.5px;color:var(--text-faint)">Essa rede ainda não tem formatos cadastrados.</span>'}
            </div>`;
          configsC.appendChild(panel);
        });
      }

      APP_SETTINGS.networks.forEach(n=>{
        const lbl = document.createElement('label'); lbl.className='chip';
        lbl.innerHTML = `<input type="checkbox" class="sched-net" value="${escapeHtml(n.name)}" ${cfgByChannel[n.name]?'checked':''} /> ${escapeHtml(n.name)}`;
        netsC.appendChild(lbl);
        lbl.querySelector('input').addEventListener('change', renderNetConfigs);
      });
      renderNetConfigs();

      return {
        getValue(){
          const weekdaysOut = Array.from(wd.querySelectorAll('.sched-weekday:checked')).map(el=>parseInt(el.value,10));
          syncVisiblePanelsIntoState();
          const checkedNets = Array.from(netsC.querySelectorAll('.sched-net:checked')).map(el=>el.value);
          const channels = checkedNets.map(n=> cfgByChannel[n]).filter(c=> c && c.types.length>0 && c.places.length>0);
          if(weekdaysOut.length===0 || channels.length===0) return null;
          return { weekdays: weekdaysOut, channels };
        }
      };
    }

    function renderEditoriasUI(){
      const c = $('editoriasContainer'); if(c){ c.innerHTML=''; APP_SETTINGS.editorias.forEach(e=>{ const lbl=document.createElement('label'); lbl.className='chip'; lbl.innerHTML = `<input type="checkbox" class="mEditoria" value="${escapeHtml(e.name)}" /> <span class="dot" style="background:${editoriaColor(e.name)}"></span>${escapeHtml(e.name)}`; c.appendChild(lbl); lbl.querySelector('input').addEventListener('change', refreshModalDynamic); }); }
      const fc = $('filterEditoriasContainer'); if(fc){ fc.innerHTML=''; APP_SETTINGS.editorias.forEach(e=>{ const lbl=document.createElement('label'); lbl.className='chip'; lbl.innerHTML = `<input type="checkbox" class="fEditoria" value="${escapeHtml(e.name)}"/> <span class="dot" style="background:${editoriaColor(e.name)}"></span>${escapeHtml(e.name)}`; fc.appendChild(lbl); }); }

      // dias fixos + redes/tipos/formatos do formulário de nova editoria — monta o editor
      // reutilizável e guarda o handle para o botão "Adicionar editoria" ler ao salvar
      const newSchedFields = $('newEditoriaScheduleFields');
      if(newSchedFields) newEditoriaScheduleEditor = buildScheduleEditor(newSchedFields, null);

      // lista de editorias cadastradas — mesmo padrão visual/de edição das redes: modo de
      // visualização (bolinha colorida + nome) e, pelo lápis, modo de edição inline com
      // seletor de cor e renomear (o renome cascateia para as postagens existentes). O
      // agendamento (dias fixos + redes/tipos/formatos) abre num painel expansível à parte,
      // no mesmo padrão dos formatos de cada rede em "secRedes".
      const list = $('editoriasList');
      if(list){
        list.innerHTML='';
        APP_SETTINGS.editorias.forEach(e=>{
          const row = document.createElement('div');
          row.className = 'net-row';
          const hasSchedule = e.schedule && (e.schedule.channels||[]).length>0;
          const scheduleLabel = hasSchedule ? e.schedule.weekdays.slice().sort().map(d=>WEEKDAY_ABBR[d]).join(', ') : '';
          const channelsLabel = hasSchedule ? e.schedule.channels.map(c=>c.channel).join(', ') : '';
          row.innerHTML = `
            <div class="net-row-head">
              <span class="net-view">
                <span class="dot" style="background:${e.color}"></span>
                <span class="net-view-name">${escapeHtml(e.name)}</span>
              </span>
              <div class="net-edit-fields">
                <input type="color" class="ed-edit-color" value="${e.color||'#F6BE00'}" title="Cor da editoria" style="flex-shrink:0" />
                <input type="text" class="ed-edit-name" value="${escapeHtml(e.name)}" title="Nome da editoria" style="flex:2;min-width:110px" />
              </div>` +
            (hasSchedule ? `<span class="chip" style="font-size:11px" title="Repete em dias fixos">${UI_ICONS.calendar(12)} ${escapeHtml(scheduleLabel)} · ${escapeHtml(channelsLabel)}</span><button type="button" class="btn ghost small" data-apply="${escapeHtml(e.name)}">Aplicar ao mês visível</button>` : '') +
            `<button type="button" class="net-row-formats-toggle ed-schedule-toggle">${hasSchedule?'Editar datas/formatos':'+ Datas e formatos'} <span class="settings-caret">${UI_ICONS.chevronDown(11)}</span></button>
              <button type="button" class="btn ghost small ed-edit-toggle" aria-label="Editar editoria" title="Editar nome/cor">${UI_ICONS.edit(13)}</button>
              <button type="button" class="btn ghost small" data-editoria="${escapeHtml(e.name)}" aria-label="Remover editoria">${UI_ICONS.x(13)}</button>
            </div>
            <div class="net-row-formats">
              <div class="ed-schedule-editor" style="display:flex;flex-direction:column;gap:8px"></div>
              <div style="display:flex;justify-content:flex-end">
                <button type="button" class="btn small ed-schedule-save">Salvar</button>
              </div>
            </div>`;
          list.appendChild(row);
          if(editingEditoriaName === e.name) row.classList.add('editing');
          if(openEditoriaSchedule === e.name) row.classList.add('open');

          let schedEditor = null;
          if(openEditoriaSchedule === e.name){
            schedEditor = buildScheduleEditor(row.querySelector('.ed-schedule-editor'), e.schedule);
          }

          // abre/fecha o painel de dias fixos + redes/tipos/formatos dessa editoria
          row.querySelector('.ed-schedule-toggle').addEventListener('click', ()=>{
            openEditoriaSchedule = (openEditoriaSchedule === e.name) ? null : e.name;
            renderAllDynamicUI();
          });

          // salva o agendamento editado e fecha o painel — se nada ficou totalmente configurado
          // (dia + rede + tipo + formato), remove o agendamento da editoria em vez de salvar
          // algo incompleto
          const saveBtn = row.querySelector('.ed-schedule-save');
          if(saveBtn) saveBtn.addEventListener('click', ()=>{
            const value = schedEditor ? schedEditor.getValue() : null;
            e.schedule = value || undefined;
            openEditoriaSchedule = null;
            saveSettings(); renderAllDynamicUI(); render();
          });

          row.querySelector('.ed-edit-toggle').addEventListener('click', ()=>{
            editingEditoriaName = (editingEditoriaName === e.name) ? null : e.name;
            row.classList.toggle('editing');
          });

          // edita a cor da editoria
          row.querySelector('.ed-edit-color').addEventListener('change', (ev)=>{ e.color = ev.target.value; saveSettings(); renderAllDynamicUI(); render(); });

          // edita o nome — como o nome é referenciado nas postagens (post.editoria) e nos
          // filtros ativos, renomear atualiza essas referências também
          const nameInput = row.querySelector('.ed-edit-name');
          nameInput.addEventListener('change', ()=>{
            const newName = nameInput.value.trim();
            if(!newName || newName === e.name){ nameInput.value = e.name; return; }
            if(APP_SETTINGS.editorias.some(x=>x!==e && x.name===newName)){ alert('Já existe uma editoria com esse nome.'); nameInput.value = e.name; return; }
            const oldName = e.name;
            e.name = newName;
            state.posts.forEach(p=>{ if(Array.isArray(p.editoria)){ p.editoria = p.editoria.map(x=> x===oldName ? newName : x); } else if(p.editoria===oldName){ p.editoria = newName; } });
            filters.editorias = filters.editorias.map(x=> x===oldName ? newName : x);
            if(editingEditoriaName===oldName) editingEditoriaName = newName;
            if(openEditoriaSchedule===oldName) openEditoriaSchedule = newName;
            saveState(); saveSettings(); renderAllDynamicUI(); render();
          });
          nameInput.addEventListener('keydown', ev=>{ if(ev.key==='Enter') nameInput.blur(); });
        });
        list.querySelectorAll('button[data-editoria]').forEach(bt=> bt.addEventListener('click', ()=>{ const v=bt.dataset.editoria; APP_SETTINGS.editorias = APP_SETTINGS.editorias.filter(x=>x.name!==v); saveSettings(); renderAllDynamicUI(); }));
        list.querySelectorAll('button[data-apply]').forEach(bt=> bt.addEventListener('click', ()=> applyEditoriaSchedule(bt.dataset.apply)));
      }
    }

    // gera cards de postagem para uma editoria com agendamento fixo, em todos os dias
    // correspondentes do mês atualmente visível no calendário. Não duplica posts já
    // existentes daquela editoria+rede no mesmo dia, então pode ser clicado várias vezes com segurança.
    function applyEditoriaSchedule(editoriaName){
      const editoria = APP_SETTINGS.editorias.find(x=>x.name===editoriaName);
      if(!editoria || !editoria.schedule || !(editoria.schedule.channels||[]).length){ alert('Esta editoria não tem dias fixos configurados.'); return; }
      const { weekdays, channels } = editoria.schedule;
      const YEAR = viewDate.getFullYear(), MONTH = viewDate.getMonth();
      const totalDays = new Date(YEAR, MONTH+1, 0).getDate();
      const defaultStatus = (APP_SETTINGS.statuses[0] && APP_SETTINGS.statuses[0].name) || 'Rascunho';
      const created = [];
      const updatedBefore = []; // snapshots (para desfazer) dos cards já existentes que forem atualizados
      // um único card por editoria por data — a rede/tipo/formato marcados no agendamento
      // ficam guardados em post.channels e aparecem resumidos no próprio card. Se a data já
      // tiver um card dessa editoria (de uma aplicação anterior), ele é atualizado com a
      // distribuição atual em vez de duplicado — assim, editar o agendamento e clicar em
      // "Aplicar" de novo propaga a mudança para os cards já gerados.
      const primary = channels[0];
      const channelsSnapshot = channels.map(c=>({ channel: c.channel, types: c.types.slice(), places: c.places.slice() }));
      for(let d=1; d<=totalDays; d++){
        const date = new Date(YEAR, MONTH, d);
        if(!weekdays.includes(date.getDay())) continue;
        const dateStr = `${YEAR}-${String(MONTH+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const existing = state.posts.find(p=> p.date===dateStr && (Array.isArray(p.editoria)?p.editoria:[p.editoria]).includes(editoriaName));
        if(existing){
          updatedBefore.push({ id: existing.id, channel: existing.channel, place: existing.place, type: existing.type, channels: existing.channels });
          existing.channel = primary.channel; existing.place = primary.places.slice(); existing.type = primary.types[0] || 'Static';
          existing.channels = channelsSnapshot.map(c=>Object.assign({},c));
          continue;
        }
        const p = {
          id: generateId(), title: editoriaName, date: dateStr,
          channel: primary.channel, place: primary.places.slice(), type: primary.types[0] || 'Static',
          channels: channelsSnapshot.map(c=>Object.assign({},c)),
          status: defaultStatus, notes: '', collab: false, color: null, editoria: [editoriaName], products: [], order: nextOrderForDate(dateStr)
        };
        state.posts.push(p);
        created.push(p);
      }
      if(created.length>0 || updatedBefore.length>0){
        saveState(); buildCalendar(); render();
        const actions = [];
        if(created.length>0) actions.push({ type:'create', posts: created.map(p=>p.id) });
        if(updatedBefore.length>0) actions.push({ type:'edit-multi', before: updatedBefore });
        actions.forEach(a=> pushUndo(a));
        redoStack = [];
        const parts = [];
        if(created.length>0) parts.push(`${created.length} criados`);
        if(updatedBefore.length>0) parts.push(`${updatedBefore.length} atualizados`);
        alert(`"${editoriaName}" em ${$('monthLabelText').textContent}: ${parts.join(', ')}.`);
      } else {
        alert(`Nenhuma data configurada para "${editoriaName}" neste mês.`);
      }
    }

    // preenche o filtro de Formato (união de todos os formatos de todas as redes), o filtro de Tipo
    // (fixo) e o seletor de Formato da Edição em Lote (união + opção "Manter")
    function renderPlacesUI(){
      const fc = $('filterPlacesContainer'); if(fc){ fc.innerHTML=''; allFormatNames().forEach(p=>{ const lbl=document.createElement('label'); lbl.className='chip'; lbl.innerHTML=`<input type="checkbox" class="fPlace" value="${escapeHtml(p)}"/> ${escapeHtml(p)}`; fc.appendChild(lbl); }); }
      // tipos (Estático/Vídeo) são fixos — só preenche o container de filtro
      const ft = $('filterTypesContainer'); if(ft){ ft.innerHTML=''; ['Static','Video'].forEach(ti=>{ const lbl = document.createElement('label'); lbl.className='chip'; lbl.innerHTML = `<input type="checkbox" class="fType" value="${ti}"/> ${ti==='Static'?'Estático':'Vídeo'}`; ft.appendChild(lbl); }); }
      const bp = $('bPlaceContainer'); if(bp){ bp.innerHTML = `<label class="chip"><input type="radio" name="bPlace" value="" checked /> Manter</label>` + allFormatNames().map(p=>`<label class="chip"><input type="radio" name="bPlace" value="${escapeHtml(p)}" /> ${escapeHtml(p)}</label>`).join(''); }
    }

    // preenche o Formato do modal de criar/editar postagem, com base na(s) rede(s) marcada(s) —
    // separado num grupo por rede social (cada rede tem seu próprio conjunto — ex: Reels só
    // aparece se Instagram estiver marcado — e a mesma rede pode ter um formato de mesmo nome
    // que outra com dimensões diferentes, então cada grupo mostra os formatos da SUA rede, sem
    // deduplicar entre grupos como formatsForNetworks faz para outros usos). Cada chip de formato
    // exibe as dimensões em pixels como subtexto abaixo do nome.
    function renderModalFormatsUI(){
      const container = $('mPlacesContainer'); if(!container) return;
      const selectedNets = Array.from(document.querySelectorAll('.mNet:checked')).map(n=>n.value);
      const prevChecked = Array.from(container.querySelectorAll('input:checked')).map(el=>el.value);
      container.innerHTML = '';
      const orderedNets = APP_SETTINGS.networks.filter(n=> selectedNets.includes(n.name) && (n.formats||[]).length>0);
      if(orderedNets.length===0){
        container.innerHTML = `<span style="font-size:12px;color:var(--text-faint)">Selecione uma rede para ver os formatos disponíveis</span>`;
      } else {
        orderedNets.forEach(net=>{
          const group = document.createElement('div'); group.className = 'format-net-group';
          group.innerHTML = `<div class="format-net-group-label">${networkIcon(net.name)}<span>${escapeHtml(net.name)}</span></div>`;
          const chips = document.createElement('div'); chips.className = 'format-net-group-chips';
          (net.formats||[]).forEach(f=>{
            const lbl = document.createElement('label'); lbl.className = 'format-chip';
            const dims = (f.width && f.height) ? `${f.width}×${f.height}px` : '';
            const exts = (f.extensions||[]).join(', ');
            if(exts) lbl.title = exts;
            lbl.innerHTML = `<input type="checkbox" name="mPlace" value="${escapeHtml(f.name)}" ${prevChecked.includes(f.name)?'checked':''} />${FORMAT_ICONS[f.name]?`<span class="format-chip-icon">${FORMAT_ICONS[f.name]}</span>`:''}<span class="format-chip-body"><span class="format-chip-name">${escapeHtml(f.name)}</span>${dims?`<span class="format-chip-dims">${dims}</span>`:''}</span>`;
            lbl.querySelector('input').addEventListener('change', refreshModalDynamic);
            chips.appendChild(lbl);
          });
          group.appendChild(chips);
          container.appendChild(group);
        });
      }
      refreshModalDynamic();
    }

    function renderStatusUI(){
      renderQuickStatusFilter();
      const bs = $('bStatusSelect'); if(bs){ bs.innerHTML = '<option value="">Manter</option>' + APP_SETTINGS.statuses.map(s=>`<option value="${escapeHtml(s.name)}">${escapeHtml(s.name)}</option>`).join(''); }
      const list = $('statusesList'); if(list){ list.innerHTML=''; APP_SETTINGS.statuses.forEach(s=>{ const chip=document.createElement('span'); chip.className='chip'; chip.style.display='inline-flex'; chip.innerHTML = `<span class="dot" style="background:${s.color}"></span>${escapeHtml(s.name)} <button class="btn ghost small" data-status="${escapeHtml(s.name)}" style="margin-left:8px" aria-label="Remover status">${UI_ICONS.x(13)}</button>`; list.appendChild(chip); }); list.querySelectorAll('button[data-status]').forEach(bt=> bt.addEventListener('click', ()=>{ const v=bt.dataset.status; APP_SETTINGS.statuses = APP_SETTINGS.statuses.filter(x=>x.name!==v); saveSettings(); renderAllDynamicUI(); })); }
    }

    // Filtro rápido de status (toolbar): um chip por status, com a cor e um ícone que resume o
    // sentido do nome (heurística em statusIconFor) — clique alterna dentro/fora de filters.statuses
    // e já refaz o calendário na hora, sem precisar abrir o modal de Filtros (estilo mLabs)
    function renderQuickStatusFilter(){
      const row = $('quickStatusFilter'); if(!row) return;
      row.innerHTML = '';
      APP_SETTINGS.statuses.forEach(s=>{
        const chip = document.createElement('button');
        const active = filters.statuses.includes(s.name);
        chip.type = 'button';
        chip.className = 'status-filter-chip' + (active ? ' active' : '');
        chip.style.setProperty('--st-color', s.color);
        chip.style.setProperty('--st-weak', hexToRgba(s.color, 0.14));
        chip.innerHTML = `<span class="dot" style="background:${s.color}"></span>${statusIconFor(s.name)(13)}<span>${escapeHtml(s.name)}</span>`;
        chip.addEventListener('click', ()=>{
          const idx = filters.statuses.indexOf(s.name);
          if(idx>=0) filters.statuses.splice(idx,1); else filters.statuses.push(s.name);
          buildCalendar(); render(); renderQuickStatusFilter();
        });
        row.appendChild(chip);
      });
    }

    function renderCatalogUI(){
      const list = $('catalogList'); if(!list) return;
      list.innerHTML = '';
      (APP_SETTINGS.catalog||[]).forEach(item=>{
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 6px;border:1px solid var(--border);border-radius:8px;font-size:12px';
        row.innerHTML = `<img src="${productImageUrl(item.code)}" alt="" referrerpolicy="no-referrer" style="width:24px;height:24px;object-fit:contain;border-radius:4px;background:#fff;border:1px solid var(--border);flex-shrink:0" onerror="this.style.visibility='hidden'" /><span style="color:var(--muted);flex-shrink:0;min-width:110px">${escapeHtml(item.code)}</span><span style="flex:1">${escapeHtml(item.name)}</span><button class="btn ghost small" data-catalog="${escapeHtml(item.code)}" aria-label="Remover produto">${UI_ICONS.x(13)}</button>`;
        list.appendChild(row);
      });
      list.querySelectorAll('button[data-catalog]').forEach(bt=> bt.addEventListener('click', ()=>{ const v=bt.dataset.catalog; APP_SETTINGS.catalog = (APP_SETTINGS.catalog||[]).filter(x=>x.code!==v); saveSettings(); renderCatalogUI(); }));
    }

    // reconstrói toda a UI dependente das configurações, de uma vez
    function renderAllDynamicUI(){ renderTabs(); renderNetsUI(); renderEditoriasUI(); renderPlacesUI(); renderStatusUI(); renderCatalogUI(); }

    // ============================================================
    // MODAL DE CONFIGURAÇÕES — abrir, fechar e salvar a meta
    // ============================================================
    // fecha qualquer popover de seletor de ícone de rede que tenha ficado aberto/preso no <body>
    // (ex: usuário clica em "Subir arquivo personalizado", cancela o diálogo do sistema sem
    // clicar em mais nada, e sai da tela — nada mais dispara o fechamento) — sem isso, o popover
    // fica ali flutuando e reaparece "já aberto" na mesma posição da próxima vez que Configurações abrir
    function closeAllIconPickers(){
      document.querySelectorAll('.icon-picker-popover').forEach(el=>{ if(el.parentNode) el.parentNode.removeChild(el); });
      document.querySelectorAll('.icon-picker-trigger.open').forEach(el=> el.classList.remove('open'));
    }

    function openSettings(){
      closeAllIconPickers();
      $('sTarget').value = TARGET;
      $('settingsBackdrop').style.display = 'flex';
    }

    function closeSettings(){ closeAllIconPickers(); $('settingsBackdrop').style.display = 'none'; }

    function saveSettingsHandler(){
      TARGET = parseInt($('sTarget').value,10) || TARGET;
      saveSettings(); buildCalendar(); render(); closeSettings();
    }

    // ============================================================
    // EDIÇÃO DE POSTAGEM EXISTENTE — abre o modal já preenchido
    // com os dados do post clicado no calendário/lista
    // ============================================================
    function openEditModal(id){
      const post = state.posts.find(p=>p.id===id); if(!post) return;
      isEditing = true; editingId = id;
      // preenche os campos do modal com os dados da postagem
      $('mTitle').value = post.title || '';
      $('mDate').value = post.date || '';
      $('mNotes').value = post.notes || '';
      $('mBriefingLink').value = post.briefingLink || '';
      $('mReferencesLink').value = post.referencesLink || '';
      $('mArtsLink').value = post.artsLink || '';
      $('mImageLink').value = post.imageLink || '';
      $('mImageNotes').value = post.imageNotes || '';
      const entries = postChannelEntries(post);
      const heterogeneous = isHeterogeneousChannels(entries);
      const entryChannels = entries.map(c=>c.channel);
      // marca todas as redes da postagem — sempre editáveis, mesmo quando a distribuição é
      // heterogênea (tipo/formato diferentes por rede, o que só vem do agendamento de uma
      // editoria); nesse caso o aviso abaixo só explica que salvar aqui unifica a distribuição
      document.querySelectorAll('.mNet').forEach(n=>{ n.checked = entryChannels.includes(n.value); });
      renderModalFormatsUI();
      document.querySelectorAll('input[name="mPlace"]').forEach(el=>{ el.checked = false; });
      const unionPlaces = [...new Set(entries.flatMap(c=>c.places||[]))];
      unionPlaces.forEach(pp=>{ const el = document.querySelector(`input[name="mPlace"][value="${pp}"]`); if(el) el.checked = true; });
      const unionTypes = [...new Set(entries.flatMap(c=>c.types||[]))];
      const typeVal = unionTypes[0] || post.type || 'Static';
      const typeRadio = document.querySelector(`input[name="mType"][value="${typeVal}"]`); if(typeRadio) typeRadio.checked = true;
      setModalMultiChannelState(heterogeneous, post);
      // marca as editorias da postagem
      document.querySelectorAll('.mEditoria').forEach(e=>{ e.checked = false; });
      if(post.editoria){ const arr = Array.isArray(post.editoria)?post.editoria:[post.editoria]; arr.forEach(ed=>{ const el = Array.from(document.querySelectorAll('.mEditoria')).find(x=>x.value===ed); if(el) el.checked = true; }); }
      $('mProductName').value = '';
      selectedProducts = getPostProducts(post).slice();
      renderSelectedProducts();
      hideProductSuggestions();
      // troca o título do modal para indicar o modo edição
      document.querySelector('#modalBackdrop .modal h2').textContent = 'Editar postagem';
      // habilita o "⋮" (duplicar/excluir) — só faz sentido para uma postagem que já existe
      if($('modalMenuBtn')) $('modalMenuBtn').style.display = 'flex';
      // os formatos/tipo foram marcados direto pela propriedade .checked acima (não dispara
      // "change"), então a pré-visualização e as sugestões de título só ficam em dia com um
      // refresh explícito aqui no final
      refreshModalDynamic();
      $('modalBackdrop').style.display = 'flex';
    }

    function closeEditState(){
      isEditing = false; editingId = null; document.querySelector('#modalBackdrop .modal h2').textContent = 'Criar postagem';
      if($('modalMenuBtn')) $('modalMenuBtn').style.display = 'none';
      document.querySelectorAll('.mNet').forEach(n=>{ n.disabled = false; n.checked = false; });
      renderModalFormatsUI();
    }

    // ============================================================
    // DESFAZER / REFAZER — pilhas de ações e suas inversas.
    // Cada ação guarda o suficiente para ser revertida: 'move' guarda
    // origem/destino, 'create'/'delete' guardam os posts envolvidos,
    // 'edit'/'edit-multi' guardam o estado anterior do(s) post(s).
    // ============================================================
    let undoStack = [];
    let redoStack = [];

    function pushUndo(action){ undoStack.push(action); if(undoStack.length>200) undoStack.shift(); }

    function undo(){
      if(undoStack.length===0) { alert('Nada para desfazer'); return; }
      const action = undoStack.pop();
      let inverse = null;
      if(action.type==='move'){
        // volta a postagem para a data de origem
        const post = state.posts.find(p=>p.id===action.id);
        if(post){ const prev = post.date; post.date = action.from; inverse = { type:'move', id:action.id, from: action.from, to: prev }; saveState(); buildCalendar(); render(); }
      } else if(action.type==='reorder'){
        // restaura data/ordem de todas as postagens afetadas pela reordenação
        const afterChanges = applyOrderStates(action.changes);
        inverse = { type:'reorder', changes: afterChanges };
        saveState(); buildCalendar(); render();
      } else if(action.type==='create'){
        // desfazer uma criação = apagar as postagens criadas
        const ids = action.posts; // array de ids
        const removed = [];
        ids.forEach(id=>{ const idx = state.posts.findIndex(p=>p.id===id); if(idx>-1) removed.push(state.posts.splice(idx,1)[0]); });
        inverse = { type:'create', posts: removed };
        saveState(); buildCalendar(); render();
      } else if(action.type==='delete'){
        // desfazer uma exclusão = recriar as postagens removidas
        const restored = [];
        (action.posts||[]).forEach(p=>{ state.posts.push(p); restored.push(p); });
        inverse = { type:'delete', ids: (action.posts||[]).map(p=>p.id) };
        saveState(); buildCalendar(); render();
      } else if(action.type==='edit'){
        // restaura o estado anterior da postagem
        const post = state.posts.find(p=>p.id===action.id);
        if(post){ const after = Object.assign({}, post); // estado atual, antes de reverter
          // sobrescreve os campos com o estado anterior salvo
          Object.assign(post, action.before);
          inverse = { type:'edit', id: action.id, before: after };
          saveState(); buildCalendar(); render(); }
      }
      else if(action.type==='edit-multi'){
        // restaura o estado anterior de várias postagens (edição em lote)
        const afterStates = [];
        (action.before||[]).forEach(prev=>{
          const post = state.posts.find(p=>p.id===prev.id);
          if(post){ afterStates.push(Object.assign({}, post)); Object.assign(post, prev); }
        });
        inverse = { type:'edit-multi', before: afterStates };
        saveState(); buildCalendar(); render();
      }
      if(inverse) redoStack.push(inverse);
    }

    function redo(){
      if(redoStack.length===0) { alert('Nada para refazer'); return; }
      const action = redoStack.pop();
      // 'action' é a inversa da última ação desfeita; reaplicamos e empilhamos a inversa dela de volta no undo
      if(action.type==='move'){
        const post = state.posts.find(p=>p.id===action.id);
        if(post){ const prev = post.date; post.date = action.to; pushUndo({ type:'move', id:action.id, from:action.to, to:prev }); saveState(); buildCalendar(); render(); }
      } else if(action.type==='reorder'){
        const afterChanges = applyOrderStates(action.changes);
        pushUndo({ type:'reorder', changes: afterChanges });
        saveState(); buildCalendar(); render();
      } else if(action.type==='create'){
        // recria as postagens (action.posts contém os objetos completos)
        action.posts.forEach(p=> state.posts.push(p));
        pushUndo({ type:'delete', ids: action.posts.map(p=>p.id), posts: action.posts });
        saveState(); buildCalendar(); render();
      } else if(action.type==='delete'){
        const removed=[];
        action.ids.forEach(id=>{ const idx = state.posts.findIndex(p=>p.id===id); if(idx>-1) removed.push(state.posts.splice(idx,1)[0]); });
        pushUndo({ type:'create', posts: removed });
        saveState(); buildCalendar(); render();
      } else if(action.type==='edit'){
        // refazer uma edição: reaplica o estado guardado em action.before
        const post = state.posts.find(p=>p.id===action.id);
        if(post){ const prev = Object.assign({}, post); Object.assign(post, action.before); pushUndo({ type:'edit', id:action.id, before: prev }); saveState(); buildCalendar(); render(); }
      }
      else if(action.type==='edit-multi'){
        // reaplica uma edição em lote: action.before contém os estados a aplicar
        const prevStates = [];
        (action.before||[]).forEach(st=>{
          const post = state.posts.find(p=>p.id===st.id);
          if(post){ prevStates.push(Object.assign({}, post)); Object.assign(post, st); }
        });
        pushUndo({ type:'edit-multi', before: prevStates });
        saveState(); buildCalendar(); render();
      }
    }

    // atalhos de teclado: Ctrl+Z desfaz, Ctrl+Y (ou Ctrl+Shift+Z) refaz
    window.addEventListener('keydown', (e)=>{
      if((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase()==='z'){ e.preventDefault(); undo(); }
      if((e.ctrlKey || e.metaKey) && (e.key.toLowerCase()==='y' || (e.shiftKey && e.key.toLowerCase()==='z'))){ e.preventDefault(); redo(); }
    });

    // ============================================================
    // EXPORTAÇÃO CSV E UTILITÁRIOS GERAIS
    // ============================================================
    // baixa um arquivo de texto no navegador (usado pela exportação CSV)
    function download(name, text){
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text],{type:'text/plain'}));
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }

    function csvEscape(v){ if(v==null) return ''; const s = String(v); if(s.includes(',')||s.includes('"')||s.includes('\n')) return '"'+s.replace(/"/g,'""')+'"'; return s; }

    function exportCSV(){
      if(!state.posts || state.posts.length===0){ alert('Nenhuma postagem para exportar'); return; }
      const rows = [];
      const header = ['Date','Title','Channel','Place','Type','Status','Collab','Notes','Editorias','ProductCode','ProductName','id'];
      rows.push(header.join(','));
      // ordena por data e, dentro do dia, pela ordem manual definida no calendário
      // (a mesma ordem que será usada para montar o briefing a partir do calendário)
      const copy = state.posts.slice().sort((a,b)=> a.date.localeCompare(b.date) || ((a.order||0) - (b.order||0)));
      copy.forEach(p=>{
        const entries = postChannelEntries(p);
        const channelVal = entries.map(c=>c.channel).join('|');
        const placeVal = [...new Set(entries.flatMap(c=>c.places||[]))].join('|');
        const typeVal = [...new Set(entries.flatMap(c=>c.types||[]))].join('|');
        const editoriasVal = Array.isArray(p.editoria)? p.editoria.join('|') : (p.editoria||'');
        const prods = getPostProducts(p);
        const productCodesVal = prods.map(x=>x.code).join('|');
        const productNamesVal = prods.map(x=>x.name).join('|');
        rows.push([csvEscape(p.date), csvEscape(p.title), csvEscape(channelVal), csvEscape(placeVal), csvEscape(typeVal), csvEscape(p.status||''), csvEscape(p.collab? 'true':'false'), csvEscape(p.notes), csvEscape(editoriasVal), csvEscape(productCodesVal), csvEscape(productNamesVal), csvEscape(p.id)].join(','));
      });
      download('calendar_posts.csv', rows.join('\n'));
    }

    // escapa caracteres especiais de HTML para evitar quebra de layout/XSS ao injetar texto do usuário
    function escapeHtml(s){ return String(s||'').replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

    // ============================================================
    // LIGAÇÃO DOS BOTÕES E CAMPOS PRINCIPAIS DA TOOLBAR/MODAIS
    // ============================================================
    document.querySelectorAll('input[name="sTheme"]').forEach(el=> el.addEventListener('change', ()=>{ setTheme(el.value); }));
    $('openAdd').addEventListener('click', ()=>{ closeEditState(); openModal(); });
    $('openSettings').addEventListener('click', openSettings);
    $('cancelSettings').addEventListener('click', closeSettings);
    $('saveSettings').addEventListener('click', saveSettingsHandler);
    $('cancelModal').addEventListener('click', closeModal);
    $('saveModal').addEventListener('click', saveModal);
    // as setas ‹ › navegam mês (padrão) ou ano (quando o popover de mês está aberto)
    document.getElementById('prevMonth').addEventListener('click', ()=>{
      if($('monthYearPicker').classList.contains('open')){ stepPickerYear(-1); return; }
      if(currentView==='week'){ viewDate.setDate(viewDate.getDate()-7); updateMonthLabelText(); render(); return; }
      viewDate.setMonth(viewDate.getMonth()-1); buildCalendar(); render();
    });
    document.getElementById('nextMonth').addEventListener('click', ()=>{
      if($('monthYearPicker').classList.contains('open')){ stepPickerYear(1); return; }
      if(currentView==='week'){ viewDate.setDate(viewDate.getDate()+7); updateMonthLabelText(); render(); return; }
      viewDate.setMonth(viewDate.getMonth()+1); buildCalendar(); render();
    });
    // busca de postagens: a lupa vira uma barra grande no lugar de Configurações/Nova postagem
    $('openSearch').addEventListener('click', (ev)=>{ ev.stopPropagation(); toggleSearchPanel(); });
    $('closeSearch').addEventListener('click', (ev)=>{ ev.stopPropagation(); closeSearchPanel(); });
    $('searchWrap').addEventListener('click', ev=> ev.stopPropagation());
    $('searchInput').addEventListener('input', ()=> renderSearchResults($('searchInput').value));
    document.addEventListener('click', ()=> closeSearchPanel());
    document.addEventListener('keydown', ev=>{ if(ev.key==='Escape') closeSearchPanel(); });
    // popover de seleção rápida de mês dentro do ano
    $('monthLabel').addEventListener('click', (ev)=>{ ev.stopPropagation(); toggleMonthYearPicker(); });
    $('monthYearPicker').addEventListener('click', ev=> ev.stopPropagation());
    document.addEventListener('click', ()=> closeMonthYearPicker());
    document.addEventListener('keydown', ev=>{ if(ev.key==='Escape') closeMonthYearPicker(); });
    document.querySelectorAll('#viewToggle button').forEach(b=> b.addEventListener('click', ()=> setView(b.dataset.view)));
    // dropdown do resumo do mês, ancorado no botão de contagem da toolbar
    if($('aiSummary')) $('aiSummary').addEventListener('click', (ev)=>{ ev.stopPropagation(); toggleMonthSummary(); });
    if($('monthSummaryDropdown')) $('monthSummaryDropdown').addEventListener('click', ev=> ev.stopPropagation());
    document.addEventListener('click', ()=> closeMonthSummary());
    document.addEventListener('keydown', ev=>{ if(ev.key==='Escape') closeMonthSummary(); });
    document.querySelectorAll('#monthSummaryToggle button').forEach(b=> b.addEventListener('click', ()=>{
      monthSummaryGroupBy = b.dataset.group;
      document.querySelectorAll('#monthSummaryToggle button').forEach(x=> x.classList.toggle('active', x===b));
      renderMonthSummary();
    }));
    if($('addStatusBtn')) $('addStatusBtn').addEventListener('click', ()=>{ const v=$('newStatusInput').value.trim(); if(!v) return; const c = $('newStatusColor') ? $('newStatusColor').value : '#F6BE00'; APP_SETTINGS.statuses.push({name:v, color:c}); $('newStatusInput').value=''; saveSettings(); renderAllDynamicUI(); });
    if($('addCatalogBtn')) $('addCatalogBtn').addEventListener('click', ()=>{
      const code = $('newCatalogCode').value.trim();
      const name = $('newCatalogName').value.trim();
      if(!code || !name) return;
      APP_SETTINGS.catalog = APP_SETTINGS.catalog || [];
      APP_SETTINGS.catalog = APP_SETTINGS.catalog.filter(x=>x.code!==code);
      APP_SETTINGS.catalog.push({code, name});
      $('newCatalogCode').value=''; $('newCatalogName').value='';
      saveSettings(); renderCatalogUI();
    });
    if($('mTitle')) $('mTitle').addEventListener('input', refreshModalDynamic);
    if($('mDate')) $('mDate').addEventListener('input', refreshModalDynamic);
    if($('mArtsLink')) $('mArtsLink').addEventListener('input', refreshModalDynamic);
    if($('mReferencesLink')) $('mReferencesLink').addEventListener('input', refreshModalDynamic);
    if($('mImageLink')) $('mImageLink').addEventListener('input', refreshModalDynamic);
    if($('mImageNotes')) $('mImageNotes').addEventListener('input', refreshModalDynamic);
    if($('mNotes')) $('mNotes').addEventListener('input', refreshModalDynamic);
    // botão de copiar o texto da pré-visualização do briefing — feedback visual rápido (✓) no
    // próprio ícone, sem precisar de alert/toast
    if($('mCopyBriefingBtn')) $('mCopyBriefingBtn').addEventListener('click', ()=>{
      const btn = $('mCopyBriefingBtn');
      if(!currentBriefingText){ return; }
      copyTextToClipboard(currentBriefingText).then(()=>{
        const original = btn.innerHTML;
        btn.innerHTML = UI_ICONS.check(14);
        setTimeout(()=>{ btn.innerHTML = original; }, 1200);
      });
    });
    document.querySelectorAll('input[name="mType"]').forEach(el=> el.addEventListener('change', refreshModalDynamic));
    if($('mProductName')){
      $('mProductName').addEventListener('input', (ev)=> showProductSuggestions(ev.target.value));
      $('mProductName').addEventListener('focus', (ev)=>{ if(ev.target.value.trim().length>=2) showProductSuggestions(ev.target.value); });
      $('mProductName').addEventListener('blur', ()=> setTimeout(hideProductSuggestions, 150));
      $('mProductName').addEventListener('keydown', (ev)=>{
        if(ev.key!=='Enter') return;
        ev.preventDefault();
        const q = ev.target.value.trim();
        if(!q) return;
        const qn = normalizeStr(q);
        const qCode = normalizeCode(q);
        const available = (APP_SETTINGS.catalog||[]).filter(item=> !selectedProducts.some(p=>p.code===item.code));
        const match = available.find(item=> normalizeStr(item.name)===qn || normalizeStr(item.code)===qn || normalizeCode(item.code)===qCode)
          || available.find(item=> normalizeStr(item.name).includes(qn) || normalizeStr(item.code).includes(qn) || normalizeCode(item.code).includes(qCode));
        addSelectedProduct(match || { code:'', name: q });
      });
    }


    // ============================================================
    // EXPORTAÇÃO DE BRIEFING — junta o briefing de todas as postagens
    // num único arquivo de texto, agrupado por data (ordem cronológica)
    // e, dentro de cada data, na mesma ordem manual do calendário
    // ============================================================
    // linha bem mais grossa que o BRIEFING_SEPARATOR (usado dentro do briefing de uma única
    // postagem), pra marcar claramente a troca de data quando várias postagens são concatenadas
    const BRIEFING_DATE_SEPARATOR = '═'.repeat(40);
    function exportBriefing(){
      if(!state.posts || state.posts.length===0){ alert('Nenhuma postagem para exportar'); return; }
      const byDate = {};
      state.posts.forEach(p=>{ if(p.date) (byDate[p.date] = byDate[p.date] || []).push(p); });
      const dateKeys = Object.keys(byDate).sort();
      const sections = dateKeys.map(dateStr=>{
        const [y,m,d] = dateStr.split('-').map(Number);
        const dateLabel = new Date(y, m-1, d).toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
        const postsTexts = sortByOrder(byDate[dateStr]).map(p=> buildPostBriefingText(p));
        return [BRIEFING_DATE_SEPARATOR, dateLabel.toUpperCase(), BRIEFING_DATE_SEPARATOR, ...postsTexts].join('\n\n');
      });
      download(`briefing-${todayStr()}.txt`, sections.join('\n\n\n'));
    }
    // ============================================================
    // LIGAÇÃO DOS DEMAIS BOTÕES DA TOOLBAR (exportar, seleção,
    // lote, filtros) E FECHAMENTO DOS MODAIS
    // ============================================================
    const _exportCsvBtn = $('exportCsvBtn'); if(_exportCsvBtn) _exportCsvBtn.addEventListener('click', exportCSV);
    if($('exportBriefingBtn')) $('exportBriefingBtn').addEventListener('click', exportBriefing);
    const _resetMonthBtn = $('resetMonthBtn'); if(_resetMonthBtn) _resetMonthBtn.addEventListener('click', resetMonth);
    const _toggleSelectBtn = $('toggleSelect'); if(_toggleSelectBtn) _toggleSelectBtn.addEventListener('click', toggleSelectMode);
    const _bulkEditBtn = $('bulkEditBtn'); if(_bulkEditBtn) _bulkEditBtn.addEventListener('click', openBulkEdit);
    const _cancelBulk = $('cancelBulk'); if(_cancelBulk) _cancelBulk.addEventListener('click', closeBulkEdit);
    const _applyBulk = $('applyBulk'); if(_applyBulk) _applyBulk.addEventListener('click', applyBulkEdit);
    // botão que abre o modal de filtros
    const _filtersBtn = $('filtersBtn'); if(_filtersBtn) _filtersBtn.addEventListener('click', ()=>{ $('filtersBackdrop').style.display='flex'; });
    if($('applyFilters')) $('applyFilters').addEventListener('click', ()=>{
      // lê as opções marcadas no modal
      filters.editorias = Array.from(document.querySelectorAll('.fEditoria:checked')).map(x=>x.value);
      filters.places = Array.from(document.querySelectorAll('.fPlace:checked')).map(x=>x.value);
      filters.types = Array.from(document.querySelectorAll('.fType:checked')).map(x=>x.value);
      const coll = document.querySelector('input[name="fCollab"]:checked'); filters.collab = coll?coll.value:'any';
      $('filtersBackdrop').style.display='none'; buildCalendar(); render();
    });
    if($('clearFilters')) $('clearFilters').addEventListener('click', ()=>{
      document.querySelectorAll('.fEditoria').forEach(x=>x.checked=false);
      document.querySelectorAll('.fPlace').forEach(x=>x.checked=false);
      document.querySelectorAll('.fType').forEach(x=>x.checked=false);
      const any = document.querySelector('input[name="fCollab"][value="any"]'); if(any) any.checked = true;
      filters.editorias = []; filters.places = []; filters.types = []; filters.statuses = []; filters.collab='any'; $('filtersBackdrop').style.display='none'; buildCalendar(); render(); renderQuickStatusFilter();
    });
    function closeFilters(){ $('filtersBackdrop').style.display = 'none'; }

    // fechamento padrão de qualquer modal: pelo botão "X" ou clicando fora da caixa (no backdrop).
    // `closeBtnSelector` é opcional — só é preciso quando o modal tem mais de um botão com a
    // classe ".modal-close" (caso do modal de postagem, que também tem o "⋮" de mais ações);
    // sem ele, cai no primeiro ".modal-close" encontrado, como nos demais modais
    function wireModalDismiss(backdropId, closeFn, closeBtnSelector){
      const backdrop = $(backdropId);
      if(!backdrop) return;
      backdrop.addEventListener('click', ev=>{ if(ev.target === backdrop) closeFn(); });
      const closeBtn = backdrop.querySelector(closeBtnSelector || '.modal-close');
      if(closeBtn) closeBtn.addEventListener('click', closeFn);
    }
    wireModalDismiss('modalBackdrop', closeModal, '#modalCloseBtn');
    // botão "⋮" do modal de edição — fixo, ligado uma única vez; lê editingId no momento do
    // clique (por isso o getter), já que o mesmo botão é reaproveitado a cada postagem editada
    if($('modalMenuBtn')) wireCardMenuButton($('modalMenuBtn'), () => editingId);
    wireModalDismiss('settingsBackdrop', closeSettings);
    wireModalDismiss('bulkEditBackdrop', closeBulkEdit);
    wireModalDismiss('filtersBackdrop', closeFilters);
    wireModalDismiss('dayPostsBackdrop', closeDayPosts);
    // menu lateral do modal de Configurações — clicar numa categoria mostra o painel correspondente à direita
    document.querySelectorAll('.settings-nav-btn').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        document.querySelectorAll('.settings-nav-btn').forEach(b=> b.classList.remove('active'));
        document.querySelectorAll('.settings-panel').forEach(p=> p.classList.remove('active'));
        btn.classList.add('active');
        const panel = $(btn.dataset.panel); if(panel) panel.classList.add('active');
      });
    });

    // ============================================================
    // INICIALIZAÇÃO DA APLICAÇÃO
    // ============================================================
    // carrega configurações e postagens persistidas
    loadSettings();
    renderAllDynamicUI();
    // ícone escolhido (ainda) para a próxima rede a ser adicionada no formulário "Adicionar rede"
    let newNetIconValue = null;
    function refreshNewNetIconPicker(){
      renderIconPicker($('newNetIconPicker'), newNetIconValue, (val)=>{ newNetIconValue = val; refreshNewNetIconPicker(); });
    }
    refreshNewNetIconPicker();
    // liga os botões de "Adicionar" das listas de configurações
    if($('addNetBtn')) $('addNetBtn').addEventListener('click', ()=>{
      const v=$('newNetInput').value.trim(); if(!v) return;
      const shortV = $('newNetShort') ? $('newNetShort').value.trim() : '';
      APP_SETTINGS.networks.push({ name:v, shortName: shortV || v.slice(0,2).toUpperCase(), formats:[], icon: newNetIconValue });
      $('newNetInput').value=''; if($('newNetShort')) $('newNetShort').value='';
      newNetIconValue = null; refreshNewNetIconPicker();
      saveSettings(); renderAllDynamicUI();
    });
    // formulário de nova editoria: fica oculto até o botão "+ Adicionar" (ao lado do título) ser clicado
    function openNewEditoriaForm(){
      $('newEditoriaInput').value = '';
      if($('newEditoriaScheduleFields')) newEditoriaScheduleEditor = buildScheduleEditor($('newEditoriaScheduleFields'), null);
      $('newEditoriaForm').style.display = 'flex';
      $('newEditoriaInput').focus();
    }
    function closeNewEditoriaForm(){ $('newEditoriaForm').style.display = 'none'; }
    if($('toggleNewEditoriaBtn')) $('toggleNewEditoriaBtn').addEventListener('click', ()=>{
      const isOpen = $('newEditoriaForm').style.display !== 'none';
      if(isOpen) closeNewEditoriaForm(); else openNewEditoriaForm();
    });
    if($('cancelNewEditoriaBtn')) $('cancelNewEditoriaBtn').addEventListener('click', closeNewEditoriaForm);
    if($('addEditoriaBtn')) $('addEditoriaBtn').addEventListener('click', ()=>{
      const v=$('newEditoriaInput').value.trim(); if(!v){ alert('Digite o nome da editoria.'); return; }
      if(APP_SETTINGS.editorias.some(x=>x.name===v)){ alert('Já existe uma editoria com esse nome.'); return; }
      const entry = { name: v, color: $('newEditoriaColor') ? $('newEditoriaColor').value : '#F6BE00' };
      const scheduleValue = newEditoriaScheduleEditor ? newEditoriaScheduleEditor.getValue() : null;
      if(scheduleValue) entry.schedule = scheduleValue;
      APP_SETTINGS.editorias.push(entry);
      saveSettings(); renderAllDynamicUI();
      closeNewEditoriaForm();
    });
    loadState();
    // monta o calendário e, se ainda não houver nenhuma postagem, cria exemplos de demonstração
    // (só no modo local/offline — num calendário sincronizado com o servidor não faz sentido
    // criar posts de exemplo pra toda a equipe; espera o syncPull() trazer os dados reais)
    buildCalendar();
    if(!SYNC_ENABLED && state.posts.length===0){
      state.posts.push({ id: generateId(), title: 'Campanha: Lançamento Comunidade', date: '2026-08-18', channel: 'Instagram', color:'#E4405F', status:'Aprovado', editoria:['Lançamentos'], place:'Feed', type:'Static' });
      state.posts.push({ id: generateId(), title: 'Blog: Anúncio oficial', date: '2026-08-20', channel: 'Blog', color:'#06b6d4', status:'Em produção', editoria:['Informativo'], place:'Feed', type:'Static' });
      state.posts.push({ id: generateId(), title: 'Postagem de teste — Social', date: '2026-08-19', channel: 'Twitter', color:'#f97316', status:'Rascunho', editoria:['Destaques'], place:'Feed', type:'Video' });
      saveState();
    }
    const tbAll = document.querySelector('#tabs button[data-tab="All"]'); if(tbAll) tbAll.classList.remove('ghost');
    // liga os botões de desfazer/refazer
    $('undoBtn').addEventListener('click', undo);
    $('redoBtn').addEventListener('click', redo);
    // primeira renderização da tela
    render();

    // busca a versão do servidor (se disponível) e passa a checar por mudanças de outras
    // pessoas a cada 20s — ver bloco "SINCRONIZAÇÃO COM O SERVIDOR" mais acima
    if(SYNC_ENABLED){
      syncPull();
      setInterval(()=> syncPull(), 20000);
    } else {
      setSyncStatus('Salvando só neste navegador (abra pelo endereço do servidor pra sincronizar)', 'warn');
    }
