    // ============================================================
    // ISOLAMENTO POR MARCA — portal-shell.js (carregado antes deste arquivo) já resolveu qual
    // marca está ativa e expôs o sufixo em window.PortalBrand.suffix ('' para a marca padrão,
    // '__{brandId}' para qualquer outra). Todas as chaves de localStorage e de api.php usadas
    // neste arquivo levam esse sufixo, pra cada marca ter seu próprio calendário isolado.
    // ============================================================
    const BRAND_SUFFIX = (window.PortalBrand && window.PortalBrand.suffix) || '';
    const LS_POSTS_KEY = 'calendar_posts_v1' + BRAND_SUFFIX;
    const LS_SETTINGS_KEY = 'calendar_settings_v1' + BRAND_SUFFIX;
    const API_POSTS_KEY = 'posts' + BRAND_SUFFIX;
    const API_SETTINGS_KEY = 'settings' + BRAND_SUFFIX;

    // ============================================================
    // ESTADO GLOBAL DA APLICAÇÃO
    // ============================================================
    // Estado principal: lista de postagens do calendário
    const state = { posts: [] };

    const $ = id => document.getElementById(id);
    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    // Mês inicial exibido (contexto atual do projeto). Navegação livre a partir daqui.
    let viewDate = new Date(2026,7,18);
    let activeTabs = []; // redes selecionadas no filtro rápido da toolbar; vazio = "Todas"
    let currentView = 'month'; // 'month' | 'biweek' | 'week' | 'list'
    // alturas das células do dia capturadas por buildCalendar() logo antes de reconstruir o grid;
    // render() consome isso no final pra animar a troca de altura das linhas (ver ambas as funções)
    let pendingRowHeights = null;
    // meta configurável (persistida nas Configurações)
    let TARGET = 3;
    let isEditing = false;
    let editingId = null;
    // estado dos filtros aplicados ao calendário/lista
    const filters = { editorias: [], places: [], types: [], statuses: [], collab: 'any' };
    // produtos selecionados no modal de criar/editar postagem: [{code,name}, ...]
    let selectedProducts = [];
    // texto exato ("Pauta: ...") da última pauta sugerida inserida no campo de conteúdo — se
    // ainda estiver lá quando o usuário escolhe outra pauta, ela é substituída em vez de duplicada
    // (ver renderContentSuggestions()); zerado ao remover produto ou limpar o conteúdo
    let lastInsertedPautaBlock = null;
    // índice em selectedProducts pendente de remoção enquanto o modal de confirmação
    // (#removeProductConfirmBackdrop) está aberto — ver openRemoveProductConfirm()
    let pendingProductRemovalIdx = null;
    // catálogo mestre de produtos (data/catalog-vonder.json, via CatalogProvider) — carregado
    // à parte do catálogo manual em APP_SETTINGS.catalog; os dois alimentam productCandidates()
    let masterCatalog = [];
    // imagens de referência anexadas no modal de criar/editar postagem (campo "Referências
    // salvas em:"): [{id,name,width,height,dataUrl}, ...] — refletem na pré-visualização do
    // briefing e são embutidas no .docx exportado
    let editingReferenceImages = [];
    let guidedPostStep = 1;

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

    // postagem com todos os campos essenciais preenchidos? Usado pelo ícone de completo/pendência
    // ao lado do contador de cada dia. Título, Produto(s) — ou marcada como "sem produto", pra
    // institucionais/anúncios — Onde salvar a arte e Conteúdo da publicação contam; Imagem de
    // referência e Referências ficam de fora por serem materiais de apoio opcionais, não algo
    // que toda postagem precisa ter.
    function isPostComplete(post){
      const title = (post.title||'').trim();
      if(!title || title==='Untitled') return false;
      if(!getPostProducts(post).length && !post.noProduct) return false;
      if(!(post.artsLink||'').trim()) return false;
      if(!(post.notes||'').trim()) return false;
      return true;
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
      wrap.querySelectorAll('.pc-remove').forEach(bt=> bt.addEventListener('click', ()=>{
        const i = parseInt(bt.dataset.idx,10);
        // se já tem conteúdo escrito, remover o produto também apaga esse conteúdo (as pautas e a
        // legenda geradas eram sobre ele) — por ser destrutivo, passa por confirmação antes
        if(($('mNotes').value||'').trim()){ openRemoveProductConfirm(i); return; }
        removeSelectedProduct(i);
      }));
      refreshModalDynamic();
    }

    // remove o produto pelo índice e reseta pautas/legenda em uso — chamada direto quando não há
    // conteúdo a perder, ou depois de confirmar em openRemoveProductConfirm()
    function removeSelectedProduct(idx, clearContent){
      selectedProducts.splice(idx,1);
      if(clearContent) $('mNotes').value = '';
      lastInsertedPautaBlock = null;
      renderSelectedProducts();
    }

    function openRemoveProductConfirm(idx){
      pendingProductRemovalIdx = idx;
      $('removeProductConfirmBackdrop').style.display = 'flex';
    }
    function closeRemoveProductConfirm(){
      $('removeProductConfirmBackdrop').style.display = 'none';
      pendingProductRemovalIdx = null;
    }
    function wireRemoveProductConfirm(){
      const backdrop = $('removeProductConfirmBackdrop'); if(!backdrop) return;
      $('removeProductConfirmOk').addEventListener('click', ()=>{
        const idx = pendingProductRemovalIdx;
        closeRemoveProductConfirm();
        if(idx!==null) removeSelectedProduct(idx, true);
      });
      $('removeProductConfirmCancel').addEventListener('click', closeRemoveProductConfirm);
      $('removeProductConfirmCloseBtn').addEventListener('click', closeRemoveProductConfirm);
      backdrop.addEventListener('click', ev=>{ if(ev.target===backdrop) closeRemoveProductConfirm(); });
    }

    // ============================================================
    // LIMPAR CONTEÚDO — botão que zera o campo Texto (legenda/pautas usadas) de propósito, sem
    // depender de remover produto pra isso
    // ============================================================
    function wireClearContentBtn(){
      const btn = $('clearContentBtn'); if(!btn) return;
      btn.addEventListener('click', ()=>{
        const notes = $('mNotes');
        if(!notes.value.trim()) return;
        if(!confirm('Limpar todo o conteúdo escrito neste campo?')) return;
        notes.value = '';
        lastInsertedPautaBlock = null;
        refreshModalDynamic();
      });
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
      // candidato com destaque real do catálogo (quando o produto selecionado tem esse dado) —
      // entra primeiro na lista pra concorrer com prioridade contra os templates genéricos
      const details = primarySelectedProductDetails();
      if(details && details.destaques){
        const highlight = firstSentence(details.destaques, 70);
        if(highlight) candidates.push(`${productPhrase}: ${highlight}`);
      }
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

    // cada editoria tem exatamente 3 pautas fixas — manchetes/ideias já prontas pra virar o
    // ponto de partida do post (não uma instrução de como montá-lo), pensadas pro objetivo
    // específico daquela editoria
    // specsPreview: junta 1-3 pares "Rótulo: valor" da ficha técnica pra caber numa pauta curta
    function specsPreview(qualificacaoTecnica, limit){
      return parseTechSpecs(qualificacaoTecnica).slice(0, limit||3).map(s=>`${s.label}: ${s.value}`).join(' · ');
    }
    function pickRandom(list){ return list[Math.floor(Math.random()*list.length)]; }

    // ============================================================
    // GANCHOS DE COPY — cada dado real do produto (destaque/aplicação/embalagem/specs) pode virar
    // conteúdo de vários jeitos (pergunta, curiosidade, contraste, prova técnica) em vez de sempre
    // virar "Rótulo: valor" cru. hookFor() sorteia uma dessas formas a cada chamada, então clicar
    // em "gerar outras opções" também varia a abordagem, não só o texto de fundo.
    // ============================================================
    const HOOK_FORMULAS = {
      destaque: [
        (p,text) => `Você sabia? ${text} — e é por isso que o ${p} se destaca.`,
        (p,text) => `O detalhe que faz diferença no ${p}: ${text}`,
        (p,text) => `Por dentro do ${p}: ${text}`,
        (p,text) => `${p} tem um diferencial que passa despercebido — ${text}`
      ],
      aplicacao: [
        (p,text) => `Pra que serve o ${p}, na prática? ${text}`,
        (p,text) => `${text} É exatamente pra isso que o ${p} existe.`,
        (p,text) => `A dúvida que mais recebemos sobre o ${p}: ${text}`,
        (p,text) => `Onde o ${p} entra na sua rotina: ${text}`
      ],
      embalagem: [
        (p,text) => `Tudo o que acompanha o ${p}, numa caixa só: ${text}`,
        (p,text) => `Antes de comprar o ${p}, veja o que vem junto: ${text}`,
        (p,text) => `${p} completo, sem pegadinha — vem com: ${text}`,
        (p,text) => `Desembalando o ${p}: ${text}`
      ],
      specs: [
        (p,text) => `Os números por trás do ${p}: ${text}`,
        (p,text) => `${p} em ficha técnica — o que pesa na hora de escolher: ${text}`,
        (p,text) => `Compare antes de decidir: o ${p} traz ${text}`,
        (p,text) => `Especificações que fazem diferença no ${p}: ${text}`
      ]
    };
    // sorteia um gancho de copy pro texto real informado; retorna null se não houver dado (o
    // chamador cai pro texto genérico original nesse caso)
    function hookFor(kind, p, text){
      if(!text) return null;
      return pickRandom(HOOK_FORMULAS[kind])(p, text);
    }

    // cada template abaixo recebe (p, d) — p é a frase do produto (sempre disponível) e d são os
    // dados ricos do catálogo mestre (destaques/aplicações/ficha técnica), ou null quando o
    // produto não veio do catálogo mestre (cadastro manual) ou não tem esse campo preenchido.
    // Nesse caso a função cai pro texto genérico original.
    // toda função abaixo referencia ${p} (nunca um texto fixo igual pra qualquer produto) — com
    // dado real do catálogo mestre disponível, prioriza um campo diferente por posição (embalagem,
    // ficha técnica, aplicações...) pra que produtos diferentes gerem pautas de fato diferentes, e
    // usa hookFor() pra variar a abordagem em vez de só despejar "Rótulo: valor"
    const CONTENT_SUGGESTIONS_BY_EDITORIA = {
      'Informativo': [
        (p,d) => hookFor('embalagem', p, d && d.conteudoEmbalagem) || `Como escolher o ${p} certo para cada necessidade`,
        (p,d) => hookFor('specs', p, d && specsPreview(d.qualificacaoTecnica)) || `5 curiosidades técnicas sobre o ${p} que poucas pessoas conhecem`,
        (p,d) => hookFor('aplicacao', p, d && d.aplicacoes) || `Perguntas frequentes: como usar e conservar o ${p} corretamente`
      ],
      'Destaques': [
        (p,d) => hookFor('specs', p, d && specsPreview(d.qualificacaoTecnica)) || `Os mais vendidos da semana — e por que os profissionais confiam no ${p}`,
        p => `${p}: qual versão combina com a sua necessidade`,
        (p,d) => hookFor('destaque', p, d && firstSentence(d.destaques,110)) || `Bastidores da qualidade: como o ${p} é testado antes de chegar até você`
      ],
      'Lançamentos': [
        (p,d) => (d && d.destaques) ? `Chegou o ${p}: ${firstSentence(d.destaques,90)}` : `Chegou o ${p}: a novidade que resolve um problema comum`,
        p => `Antes e depois: o que muda no seu trabalho com o ${p}`,
        (p,d) => hookFor('aplicacao', p, d && d.aplicacoes) || `5 motivos para conhecer o ${p} hoje`
      ],
      'Dica VONDER': [
        (p,d) => hookFor('aplicacao', p, d && d.aplicacoes) || `Como usar o ${p} com segurança e eficiência`,
        (p,d) => hookFor('specs', p, d && specsPreview(d.qualificacaoTecnica,2)) || `O erro comum que reduz a vida útil do ${p} (e como evitar)`,
        (p,d) => hookFor('embalagem', p, d && d.conteudoEmbalagem) || `Truque rápido: economize tempo usando o ${p} desta forma`
      ],
      'Trend': [
        p => `Como a tendência do momento também cabe na rotina de quem usa ${p}`,
        p => `O desafio/meme do momento, adaptado pro dia a dia com o ${p}`,
        p => `Nossa opinião sobre a tendência do momento, e como ela se conecta com o ${p}`
      ],
      'Personalizado': [
        p => `[Defina aqui] o tema específico desta campanha personalizada com o ${p}`,
        p => `Conteúdo alinhado a uma data ou ação comercial específica para o ${p} — descreva o motivo aqui`,
        p => `Colaboração ou parceria com conteúdo sob medida envolvendo o ${p} — descreva o parceiro/contexto aqui`
      ],
      // pautas ligadas à data comemorativa em uso (ver pendingCommemorativeOccasion, setado ao
      // confirmar a criação de postagem a partir do clique no texto da data no card do dia) —
      // sem uma ocasião específica em mãos, cai num texto genérico
      'Datas comemorativas': [
        p => `${pendingCommemorativeOccasion || 'A data comemorativa'}: uma ideia de conteúdo pra aproveitar a data com o ${p}`,
        p => `Como ${pendingCommemorativeOccasion || 'a data'} conecta com o dia a dia de quem usa ${p}`,
        p => `Mensagem da marca para ${pendingCommemorativeOccasion || 'a data comemorativa'}`
      ]
    };

    // monta até 3 sugestões combinando as editorias marcadas em rodízio (1ª de cada editoria,
    // depois a 2ª de cada...) — assim o bloco mostra sempre 3 opções, tanto com uma única
    // editoria marcada (as 3 dela) quanto com várias (uma de cada, até completar 3)
    function pickContentSuggestions(){
      const editorias = Array.from(document.querySelectorAll('.mEditoria:checked')).map(e=>e.value);
      if(editorias.length===0) return [];
      const p = contentProductPhrase();
      const details = primarySelectedProductDetails();
      const lists = editorias.map(ed=>{
        const gens = CONTENT_SUGGESTIONS_BY_EDITORIA[ed] || CONTENT_SUGGESTIONS_BY_EDITORIA['Personalizado'];
        return gens.map(fn=> ({ editoria: ed, pauta: fn(p, details) }));
      });
      const result = [];
      for(let i=0; result.length<3; i++){
        let addedAny = false;
        for(const list of lists){ if(i < list.length){ result.push(list[i]); addedAny = true; if(result.length>=3) break; } }
        if(!addedAny) break;
      }
      return result;
    }

    // cache das 3 pautas atualmente exibidas + a "assinatura" do contexto (produto+editorias)
    // que as gerou. Sem isso, todo re-render (ex.: o que já acontece a cada tecla digitada em
    // Texto, via refreshModalDynamic) chamaria pickContentSuggestions() de novo — e como os
    // ganchos de copy são sorteados (hookFor), as 3 pautas trocariam de texto sozinhas sem o
    // usuário pedir, e o selo "Em uso" nunca bateria com o que społo foi inserido. Só regenera
    // quando o produto/editoria muda de verdade (produto removido conta: reseta as pautas, como
    // pedido) ou quando "gerar outras opções" é clicado.
    let currentContentSuggestions = null;
    let currentContentSuggestionsKey = null;
    function contentSuggestionsContextKey(){
      const editorias = Array.from(document.querySelectorAll('.mEditoria:checked')).map(e=>e.value).sort().join(',');
      const productKey = selectedProducts.map(p=>p.code||p.name).join(',');
      return editorias + '|' + productKey;
    }

    function renderContentSuggestions(forceRegenerate){
      const box = $('contentSuggestions'); if(!box) return;
      const key = contentSuggestionsContextKey();
      if(forceRegenerate || key !== currentContentSuggestionsKey){
        currentContentSuggestions = pickContentSuggestions();
        currentContentSuggestionsKey = key;
        // contexto mudou (produto/editoria) ou pediu pautas novas — as 3 pautas em uso antes já
        // não correspondem a nenhuma das novas, então a próxima "Usar no conteúdo" deve inserir,
        // não tentar substituir um texto que não existe mais nessas sugestões
        lastInsertedPautaBlock = null;
      }
      const multiEditoria = document.querySelectorAll('.mEditoria:checked').length > 1;
      const suggestions = currentContentSuggestions;
      if(suggestions.length===0){ box.innerHTML = `<div class="cs-empty">Selecione uma editoria em Categorização para ver sugestões de pauta.</div>`; return; }
      // botão "gerar outras opções" pra sortear novos ganchos de copy sobre os mesmos dados
      // reais do produto (ver hookFor/HOOK_FORMULAS) — mesma ideia do shuffle de título
      box.innerHTML = `<div class="ts-header" style="margin-bottom:8px"><span class="ts-icon">${UI_ICONS.idea(13)}</span><span>Pautas sugeridas</span><button type="button" class="ts-shuffle" id="csShuffle" title="Gerar outras opções">${UI_ICONS.shuffle(13)}</button></div>` +
        `<div class="cs-list">${suggestions.map((s,idx)=>{
          const inUse = lastInsertedPautaBlock === `Pauta: ${s.pauta}`;
          return `<div class="cs-card${inUse?' cs-card--active':''}">${multiEditoria?`<span class="cs-editoria">${escapeHtml(s.editoria)}</span>`:''}<div class="cs-subject">${escapeHtml(s.pauta)}</div><div class="cs-actions"><button type="button" class="cs-use" data-idx="${idx}"${inUse?' disabled':''}>${inUse?'Em uso':'Usar no conteúdo'}</button></div></div>`;
        }).join('')}</div>`;
      box.querySelectorAll('.cs-use').forEach(bt=> bt.addEventListener('click', ()=>{
        const s = suggestions[parseInt(bt.dataset.idx,10)]; if(!s) return;
        const block = `Pauta: ${s.pauta}`;
        const notes = $('mNotes');
        // se a pauta usada anteriormente ainda está no texto, substitui em vez de duplicar
        if(lastInsertedPautaBlock && notes.value.includes(lastInsertedPautaBlock)){
          notes.value = notes.value.replace(lastInsertedPautaBlock, block);
        } else {
          notes.value = notes.value.trim() ? `${notes.value.trim()}\n\n${block}` : block;
        }
        lastInsertedPautaBlock = block;
        refreshModalDynamic();
      }));
      box.querySelector('#csShuffle').addEventListener('click', ()=> renderContentSuggestions(true));
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

    // mesma linha rotulada de um link/local salvo, mas com o valor virando hyperlink de verdade
    // (abre em nova aba) — usado em Salvar em, Referências salvas em e Imagem
    function bpLinkRow(label, value){
      const href = resolveLinkHref(value);
      const valueHtml = href
        ? `<a class="bp-row-value bp-row-value--clip bp-row-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(value)}">${escapeHtml(value)}</a>`
        : `<span class="bp-row-value bp-row-value--clip" title="${escapeHtml(value)}">${escapeHtml(value)}</span>`;
      return `<div class="bp-row"><span class="bp-row-label">${escapeHtml(label)}</span>${valueHtml}</div>`;
    }

    // mesma linha rotulada, mas com o valor em lista (um item por linha) em vez de texto corrido
    // — usado em Produto(s), pra ficar fácil de ler quando há mais de um produto na postagem
    function bpListRow(label, items){
      const li = items.map(item=> `<li>${escapeHtml(item)}</li>`).join('');
      return `<div class="bp-row"><span class="bp-row-label">${escapeHtml(label)}</span><ul class="bp-row-list">${li}</ul></div>`;
    }

    // mesma linha rotulada, mas com o valor em miniaturas de imagem — usado nas imagens de
    // referência anexadas em "Referências salvas em:" (refletem no briefing e são exportadas
    // junto no .docx)
    function bpImagesRow(label, images){
      const thumbs = images.map(img=> `<img class="bp-ref-thumb" src="${img.dataUrl}" alt="${escapeHtml(img.name||'')}" />`).join('');
      return `<div class="bp-row"><span class="bp-row-label">${escapeHtml(label)}</span><div class="bp-row-images">${thumbs}</div></div>`;
    }

    // linha divisória entre o cabeçalho (título + campos) e o Conteúdo — feita de caracteres de
    // texto reais (não só uma borda CSS), pra ir junto tanto ao copiar pelo botão quanto ao
    // selecionar o texto na mão e colar em outro editor
    const BRIEFING_SEPARATOR = '─'.repeat(32);

    // monta as linhas de texto puro do briefing de uma postagem, na ordem: Título, Publicação
    // prevista para, Formatos, Salvar em, Referências salvas em, Produto(s), Imagem, Observações
    // e Conteúdo — compartilhada entre a pré-visualização ao vivo do modal (a partir dos campos
    // do formulário) e a exportação de briefing (a partir de um post já salvo)
    function buildBriefingPlainLines({ title, dateLabel, formatsText, hasFormats, artsLink, referencesLink, productItems, imageLink, imageNotes, referenceImages, content }){
      referenceImages = referenceImages || [];
      const plainLines = [];
      if(title) plainLines.push(title);
      if(title && (dateLabel || hasFormats || artsLink || referencesLink || productItems.length || imageLink || imageNotes || referenceImages.length)) plainLines.push(BRIEFING_SEPARATOR);
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
      if(referenceImages.length) plainLines.push(`Imagens de referência anexadas: ${referenceImages.length}`);
      if(content){
        if(plainLines.length) plainLines.push(BRIEFING_SEPARATOR);
        plainLines.push(`Conteúdo:\n${content}`);
      }
      return plainLines;
    }

    // campos do briefing (título, formatos, links, produto(s), imagem, observações e conteúdo)
    // de uma postagem já salva em state.posts — usado na exportação em lote (hoje em .docx);
    // no mesmo formato de objeto que buildBriefingPlainLines já espera da pré-visualização ao vivo
    function computePostBriefingFields(post){
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
      return {
        title, dateLabel, formatsText, hasFormats: checkedPlaces.length>0,
        artsLink: (post.artsLink||'').trim(), referencesLink: (post.referencesLink||'').trim(),
        productItems, imageLink: (post.imageLink||'').trim(), imageNotes: (post.imageNotes||'').trim(),
        referenceImages: Array.isArray(post.referenceImages) ? post.referenceImages : [],
        content: (post.notes||'').trim()
      };
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
      const plainLines = buildBriefingPlainLines({ title, dateLabel, formatsText, hasFormats: checkedPlaces.length>0, artsLink, referencesLink, productItems, imageLink, imageNotes, referenceImages: editingReferenceImages, content });
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
      if(artsLink) metaRows.push(bpLinkRow('Salvar em', artsLink));
      if(referencesLink) metaRows.push(bpLinkRow('Referências salvas em', referencesLink));
      if(productItems.length) metaRows.push(bpListRow('Produto(s)', productItems));
      if(imageLink) metaRows.push(bpLinkRow('Imagem', imageLink));
      if(imageNotes) metaRows.push(bpRow('Observações', imageNotes));
      if(editingReferenceImages.length) metaRows.push(bpImagesRow('Imagens de referência', editingReferenceImages));

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
      renderIntelSuggestBox();
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

    // catálogo de produtos cadastrado em Configurações + catálogo mestre (data/catalog-vonder.json).
    // Itens manuais de Configurações têm prioridade quando o código se repete nos dois.
    function productCandidates(){
      const manual = (APP_SETTINGS.catalog||[]).map(item=> ({ code:item.code||'', name:item.name }));
      const seen = new Set(manual.map(item=> item.code).filter(Boolean));
      const fromMaster = masterCatalog
        .filter(item=> !item.code || !seen.has(item.code))
        .map(item=> ({ code:item.code||'', name:item.name }));
      return manual.concat(fromMaster);
    }

    // resultados que começam pelo termo buscado (no nome ou no código) vêm antes dos que só
    // contêm o termo em outro ponto — ex.: buscar "aspirador" mostra "Aspirador de pó..." antes
    // de "Escova para aspirador"
    function productMatchRank(item, q, qCode){
      const name = normalizeStr(item.name||'');
      if(q && name.startsWith(q)) return 0;
      if(qCode && item.code && normalizeCode(item.code).startsWith(qCode)) return 0;
      return 1;
    }

    // ============================================================
    // DADOS RICOS DO PRODUTO (destaques/aplicações/ficha técnica) — vindos do catálogo mestre,
    // pra alimentar sugestões de título/pauta e o gerador de legenda com informação real em vez
    // de texto genérico. Produtos cadastrados manualmente em Configurações não têm esses campos
    // (só code/name), então as funções abaixo sempre toleram retorno vazio/nulo.
    // ============================================================
    function productDetailsByCode(code){
      if(!code) return null;
      const nc = normalizeCode(code);
      if(!nc) return null;
      return masterCatalog.find(item=> item.code && normalizeCode(item.code)===nc) || null;
    }
    // primeiro produto selecionado que tem dados ricos no catálogo mestre (produtos manuais,
    // sem correspondência, são pulados)
    function primarySelectedProductDetails(){
      for(const p of selectedProducts){ const d = productDetailsByCode(p.code); if(d) return d; }
      return null;
    }
    // recorta a 1ª frase de um texto até maxLen chars, cortando em espaço (nunca no meio de
    // uma palavra) — usado pra caber destaques longos em título/pauta sem virar um parágrafo
    function firstSentence(text, maxLen){
      let cut = String(text||'').trim().split(/[.!?]\s/)[0] || '';
      cut = cut.trim();
      if(cut.length > maxLen){
        const slice = cut.slice(0, maxLen);
        const lastSpace = slice.lastIndexOf(' ');
        cut = (lastSpace > 40 ? slice.slice(0, lastSpace) : slice).trim() + '…';
      }
      return cut;
    }
    // "Tipo: X | Cor: Y | ..." -> [{label:'Tipo',value:'X'}, ...]. Descarta "Aplicação Comercial"
    // e "Destaques Comercial" — na planilha de origem esses dois "specs" só repetem o mesmo texto
    // já usado nas pautas de aplicações/destaques, então tirá-los daqui evita pautas redundantes
    // e deixa a ficha técnica com specs de fato técnicas (voltagem, peso, dimensões...)
    const TECH_SPEC_LABELS_TO_SKIP = new Set(['aplicacao comercial','destaques comercial']);
    function parseTechSpecs(text){
      return String(text||'').split('|').map(part=>{
        const idx = part.indexOf(':');
        if(idx < 0) return null;
        const label = part.slice(0, idx).trim(), value = part.slice(idx+1).trim();
        if(!label || !value) return null;
        if(TECH_SPEC_LABELS_TO_SKIP.has(normalizeStr(label))) return null;
        return { label, value };
      }).filter(Boolean);
    }

    function showProductSuggestions(query){
      const box = $('productSuggestions'); if(!box) return;
      const q = normalizeStr(query.trim());
      if(q.length < 2){ hideProductSuggestions(); return; }
      const qCode = normalizeCode(query.trim());
      const matches = productCandidates().filter(item=>
        !selectedProducts.some(p=> item.code ? p.code===item.code : p.name===item.name) &&
        (normalizeStr(item.name).includes(q) || (item.code && (normalizeStr(item.code).includes(q) || normalizeCode(item.code).includes(qCode))))
      ).sort((a,b)=> productMatchRank(a,q,qCode) - productMatchRank(b,q,qCode));
      if(matches.length===0){
        box.innerHTML = `<div class="autocomplete-item ac-manual"><span class="ac-name">+ Adicionar "${escapeHtml(query.trim())}" (sem catálogo)</span></div>`;
        box.querySelector('.ac-manual').addEventListener('mousedown', (ev)=>{ ev.preventDefault(); addSelectedProduct({ code:'', name: query.trim() }); });
        box.style.display = 'block';
        return;
      }
      box.innerHTML = matches.map((item,i)=>
        `<div class="autocomplete-item" data-idx="${i}"><img src="${productImageUrl(item.code)}" alt="" referrerpolicy="no-referrer" onerror="this.style.visibility='hidden'" /><span class="ac-name">${escapeHtml(item.name)}</span><span class="ac-code">${escapeHtml(item.code)}</span></div>`
      ).join('');
      box.querySelectorAll('.autocomplete-item[data-idx]').forEach(el=>{
        el.addEventListener('mousedown', (ev)=>{ ev.preventDefault(); addSelectedProduct(matches[Number(el.dataset.idx)]); });
      });
      box.style.display = 'block';
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
      Reels: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" stroke-width="1.6"/><path d="M10 9l5 3-5 3V9z" fill="currentColor"/></svg>`,
      'Vídeo': `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="16" rx="3" stroke="currentColor" stroke-width="1.6"/><path d="M10.5 9.5l5 2.5-5 2.5v-5z" fill="currentColor"/></svg>`,
      Post: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" stroke-width="1.6"/><path d="M7 8h10M7 12h10M7 16h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
      Artigo: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6 3h9l4 4v14H6z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M15 3v5h4M9 12h7M9 16h7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
      Email: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="14" rx="3" stroke="currentColor" stroke-width="1.6"/><path d="m4.5 7 7.5 6 7.5-6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    };
    const TYPE_ICONS = {
      Static: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="16" rx="3" stroke="currentColor" stroke-width="1.6"/><circle cx="8.5" cy="10" r="1.5" fill="currentColor"/><path d="M21 16l-5.5-5.5L11 15l-2.5-2.5L3 18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      Video: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="16" rx="3" stroke="currentColor" stroke-width="1.6"/><path d="M10.5 9.5l5 2.5-5 2.5v-5z" fill="currentColor"/></svg>`
    };
    const GENERIC_FORMAT_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" stroke-width="1.6"/><path d="M8 9h8M8 13h8M8 17h5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
    function formatIcon(name){ return FORMAT_ICONS[name] || GENERIC_FORMAT_ICON; }

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
    // DATAS COMEMORATIVAS — feriados nacionais + datas comerciais de referência para
    // planejamento de conteúdo, exibidas ao lado do número do dia na grade do mês. Datas fixas
    // (mesmo dia todo ano) ficam num dicionário "MM-DD"; datas móveis (baseadas na Páscoa, ou no
    // "enésimo dia da semana do mês", como Dia das Mães/Pais e Black Friday) são calculadas em
    // tempo real para o ano exibido e guardadas em cache por ano, já que o cálculo da Páscoa
    // não é trivial de refazer a cada célula do calendário.
    // ============================================================
    const FIXED_COMMEMORATIVE_DATES = {
      '01-01': 'Ano Novo',
      '03-08': 'Dia Internacional da Mulher',
      '03-15': 'Dia do Consumidor',
      '04-21': 'Tiradentes',
      '05-01': 'Dia do Trabalhador',
      '06-12': 'Dia dos Namorados',
      '09-07': 'Independência do Brasil',
      '09-15': 'Dia do Cliente',
      '10-12': 'Dia das Crianças / N. Sra. Aparecida',
      '11-02': 'Finados',
      '11-15': 'Proclamação da República',
      '11-20': 'Dia da Consciência Negra',
      '12-25': 'Natal'
    };
    // data da Páscoa (algoritmo de Gauss/computus gregoriano) — base de todos os feriados móveis
    function easterDate(year){
      const a = year % 19, b = Math.floor(year/100), c = year % 100;
      const d = Math.floor(b/4), e = b % 4, f = Math.floor((b+8)/25);
      const g = Math.floor((b-f+1)/3), h = (19*a+b-d-g+15) % 30;
      const i = Math.floor(c/4), k = c % 4, l = (32+2*e+2*i-h-k) % 7;
      const m = Math.floor((a+11*h+22*l)/451);
      const month = Math.floor((h+l-7*m+114)/31);
      const day = ((h+l-7*m+114) % 31) + 1;
      return new Date(year, month-1, day);
    }
    function addDays(date, days){ const d = new Date(date); d.setDate(d.getDate()+days); return d; }
    // enésima ocorrência de um dia da semana (0=Dom...6=Sáb) num mês — usado pra Dia das Mães
    // (2º domingo de maio) e Dia dos Pais (2º domingo de agosto)
    function nthWeekdayOfMonth(year, month, weekday, n){
      const first = new Date(year, month, 1);
      const offset = (weekday - first.getDay() + 7) % 7;
      return new Date(year, month, 1 + offset + (n-1)*7);
    }
    // última ocorrência de um dia da semana num mês — usado pra Black Friday (última 6ª de novembro)
    function lastWeekdayOfMonth(year, month, weekday){
      const last = new Date(year, month+1, 0);
      const offset = (last.getDay() - weekday + 7) % 7;
      return new Date(year, month, last.getDate() - offset);
    }
    function ymd(date){ return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
    const movableCommemorativeDatesCache = {};
    function movableCommemorativeDates(year){
      if(movableCommemorativeDatesCache[year]) return movableCommemorativeDatesCache[year];
      const easter = easterDate(year);
      const map = {};
      map[ymd(addDays(easter,-47))] = 'Carnaval';
      map[ymd(addDays(easter,-2))] = 'Sexta-feira Santa';
      map[ymd(easter)] = 'Páscoa';
      map[ymd(addDays(easter,60))] = 'Corpus Christi';
      map[ymd(nthWeekdayOfMonth(year,4,0,2))] = 'Dia das Mães'; // maio, domingo
      map[ymd(nthWeekdayOfMonth(year,7,0,2))] = 'Dia dos Pais'; // agosto, domingo
      const blackFriday = lastWeekdayOfMonth(year,10,5); // novembro, sexta
      map[ymd(blackFriday)] = 'Black Friday';
      map[ymd(addDays(blackFriday,3))] = 'Cyber Monday';
      movableCommemorativeDatesCache[year] = map;
      return map;
    }
    // nome(s) da(s) data(s) comemorativa(s) em "YYYY-MM-DD" (fixas/móveis + personalizadas
    // cadastradas em Configurações), unidos por " · " quando mais de uma cair no mesmo dia —
    // ou null se o dia não corresponder a nenhuma
    function commemorativeDateName(dateStr){
      const names = [];
      const fixed = FIXED_COMMEMORATIVE_DATES[dateStr.slice(5)];
      if(fixed) names.push(fixed);
      const year = Number(dateStr.slice(0,4));
      const movable = movableCommemorativeDates(year)[dateStr];
      if(movable) names.push(movable);
      (APP_SETTINGS.customDates||[]).forEach(c=>{
        const matches = c.recurring ? c.date.slice(5)===dateStr.slice(5) : c.date===dateStr;
        if(matches) names.push(c.name);
      });
      return names.length ? names.join(' · ') : null;
    }

    // ============================================================
    // CLIQUE NO TEXTO DE DATA COMEMORATIVA — pergunta (num modal com a identidade da
    // plataforma, não um confirm() nativo) se o usuário quer criar uma postagem específica pra
    // aquela data; ao confirmar, abre "Criar postagem" já com título, data e (se a marca tiver
    // uma editoria de datas comemorativas) a categorização pré-preenchidos
    // ============================================================
    let pendingCommemorativeDate = null; // { dateStr, holidayName } enquanto o modal de confirmação está aberto
    // nome da data comemorativa em uso — lido pelas sugestões de conteúdo (CONTENT_SUGGESTIONS_BY_EDITORIA
    // ['Datas comemorativas']) enquanto o modal de postagem estiver aberto vindo deste fluxo
    let pendingCommemorativeOccasion = null;
    // acha a editoria de datas comemorativas da marca ativa, se existir — por nome normalizado
    // (sem acento/maiúsculas) pra cobrir tanto "Datas comemorativas" quanto pequenas variações
    function commemorativeEditoria(){
      const norm = s => String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
      return (APP_SETTINGS.editorias||[]).find(e=> norm(e.name).includes('comemorat'));
    }
    function openCommemorativeDateConfirm(dateStr, holidayName){
      pendingCommemorativeDate = { dateStr, holidayName };
      const [y,m,d] = dateStr.split('-').map(Number);
      const dateLabel = new Date(y, m-1, d).toLocaleDateString('pt-BR', { day:'2-digit', month:'long' });
      $('commemorativeConfirmMessage').textContent = `Deseja criar uma publicação específica para "${holidayName}" (${dateLabel})?`;
      $('commemorativeConfirmBackdrop').style.display = 'flex';
    }
    function closeCommemorativeDateConfirm(){
      $('commemorativeConfirmBackdrop').style.display = 'none';
      pendingCommemorativeDate = null;
    }
    function confirmCommemorativeDatePost(){
      if(!pendingCommemorativeDate) return;
      const { dateStr, holidayName } = pendingCommemorativeDate;
      closeCommemorativeDateConfirm();
      closeEditState();
      openModal(dateStr);
      $('mTitle').value = holidayName;
      pendingCommemorativeOccasion = holidayName;
      const ed = commemorativeEditoria();
      if(ed){
        const cb = Array.from(document.querySelectorAll('.mEditoria')).find(x=>x.value===ed.name);
        if(cb) cb.checked = true;
      }
      refreshModalDynamic();
    }

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
      // clicar no nome da data comemorativa oferece criar uma postagem específica pra ela —
      // pára a propagação pro mesmo motivo que .date/.day-count acima (senão também abriria
      // "Postagens do dia")
      const holidayEl = cell.querySelector('.holiday-name');
      if(holidayEl) holidayEl.addEventListener('click', (ev)=>{ ev.stopPropagation(); openCommemorativeDateConfirm(dateStr, commemorativeDateName(dateStr)); });
      // clicar em qualquer área do card do dia (fora de um post específico, que já abre a edição
      // dele) também abre "Postagens do dia" — mesmo destino do clique na data/contador acima.
      // Cards de postagem, o badge "+N" e o "+ Adicionar postagem" já param a propagação nos
      // próprios cliques, então não disparam este handler também.
      cell.style.cursor = 'pointer';
      cell.addEventListener('click', ()=> openDayPosts(dateStr));
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
      const total = new Date(YEAR, MONTH + 1, 0).getDate();
      const tStr = todayStr();
      // visão Quinzena reaproveita esta mesma grade (#grid), mas só desenha as semanas que
      // realmente têm algum dia da metade do mês selecionada (1–15 ou 16–fim) — as semanas
      // inteiramente da outra quinzena somem da grade, em vez de aparecer como linha de células
      // vazias (só sobra a folga necessária pra alinhar a primeira/última semana ao dia da semana,
      // igual à visão mensal já faz nas bordas do mês)
      const rangeStart = currentView==='biweek' ? fortnightBounds(viewDate).startDay : 1;
      const rangeEnd = currentView==='biweek' ? fortnightBounds(viewDate).endDay : total;
      const rangeStartDow = new Date(YEAR, MONTH, rangeStart).getDay(); // 0 (Sun) - 6 (Sat)
      // número de semanas realmente necessário pra cobrir o intervalo (mês inteiro ou só a
      // quinzena), em vez de sempre fixar 6
      const cells = Math.ceil((rangeStartDow + (rangeEnd - rangeStart + 1)) / 7) * 7;
      for(let i=0;i<cells;i++){
        const cell = document.createElement('div');
        cell.className = 'day';
        const dayIndex = i - rangeStartDow + rangeStart;
        if(dayIndex>=rangeStart && dayIndex<=rangeEnd){
          const dateStr = `${YEAR}-${String(MONTH+1).padStart(2,'0')}-${String(dayIndex).padStart(2,'0')}`;
          cell.dataset.date = dateStr;
          if(dateStr===tStr) cell.classList.add('today');
          // nome da data comemorativa (feriado ou data comercial), quando o dia corresponder a uma
          const holidayName = commemorativeDateName(dateStr);
          const holidayHtml = holidayName ? `<span class="holiday-name" title="Clique para criar uma postagem para &quot;${escapeHtml(holidayName)}&quot;">${escapeHtml(holidayName)}</span>` : '';
          cell.innerHTML = `<div class="day-head"><span class="date">${dayIndex}</span>${holidayHtml}<span class="day-count-wrap"><span class="day-status-icon" style="display:none"></span><span class="day-count"></span></span></div><div class="posts"></div>`;
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

    // quinzena (metade do mês) que contém `date`: dia 1–15 ou dia 16–fim do mês — convenção
    // fixa alinhada ao calendário (igual "1ª/2ª quinzena" do uso comum), não uma janela rolante
    // de 14 dias a partir de qualquer data. Usada tanto pela visão Quinzena quanto pelo preset
    // "Quinzenal" do modal de exportação de briefing.
    function fortnightBounds(date){
      const y = date.getFullYear(), m = date.getMonth();
      const totalDays = new Date(y, m+1, 0).getDate();
      const half = date.getDate() <= 15 ? 0 : 1;
      const startDay = half===0 ? 1 : 16;
      const endDay = half===0 ? 15 : totalDays;
      return { half, startDay, endDay, startDate: new Date(y,m,startDay), endDate: new Date(y,m,endDay) };
    }
    // avança (dir>0) ou retorna (dir<0) uma quinzena a partir de viewDate, respeitando a virada
    // de mês/ano nos dois sentidos
    function stepFortnight(dir){
      const { half } = fortnightBounds(viewDate);
      const y = viewDate.getFullYear(), m = viewDate.getMonth();
      if(dir>0) viewDate = half===0 ? new Date(y,m,16) : new Date(y,m+1,1);
      else viewDate = half===1 ? new Date(y,m,1) : new Date(y,m-1,16);
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
        const holidayName = commemorativeDateName(dateStr);
        const holidayHtml = holidayName ? `<span class="holiday-name" title="Clique para criar uma postagem para &quot;${escapeHtml(holidayName)}&quot;">${escapeHtml(holidayName)}</span>` : '';
        cell.innerHTML = `<div class="week-day-head"><div class="week-day-top-row"><span class="week-day-label">${WEEKDAY_ABBR[i]}</span><span class="day-count-wrap"><span class="day-status-icon" style="display:none"></span><span class="day-count"></span></span></div><span class="date">${d.getDate()}</span>${holidayHtml}</div><div class="posts"></div><button type="button" class="week-day-add">+ Adicionar postagem</button>`;
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
      if(currentView==='biweek'){
        // quinzena nunca cruza mês, então o rótulo é só "1 – 15 de agosto de 2026" ou "16 – 31 de..."
        const { startDay, endDay } = fortnightBounds(viewDate);
        const monthYear = viewDate.toLocaleString('pt-BR',{month:'long',year:'numeric'});
        $('monthLabelText').textContent = `${startDay} – ${endDay} de ${monthYear}`;
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
      const items = state.posts.filter(p => activeTabs.length===0 || postChannelEntries(p).some(c=>activeTabs.includes(c.channel)));
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
      if(Array.isArray(post.referenceImages)) copy.referenceImages = post.referenceImages.map(x=>Object.assign({},x));
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
      div.addEventListener('click', (ev)=>{ ev.stopPropagation(); openEditModal(p.id); });
      { const { btn } = buildCardMenu(p, 'event-menu-btn'); div.appendChild(btn); }
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
    // alterna a visão ativa entre "month" (grade), "biweek" (grade, só a quinzena), "week"
    // (colunas da semana) e "list" (lista). "month" e "biweek" reaproveitam a mesma #grid — só
    // muda o intervalo de dias desenhado em buildCalendar() — por isso ela é reconstruída aqui
    // sempre que uma dessas duas vira a visão ativa (a grade pode estar com o conteúdo da outra)
    function setView(v){
      currentView = v;
      $('grid').style.display = (v==='month'||v==='biweek') ? 'grid' : 'none';
      $('weekdayHeader').style.display = (v==='month'||v==='biweek') ? 'grid' : 'none';
      $('weekView').style.display = v==='week' ? 'block' : 'none';
      $('listView').style.display = v==='list' ? 'flex' : 'none';
      document.querySelectorAll('#viewToggle button').forEach(b=> b.classList.toggle('active', b.dataset.view===v));
      if(v==='month' || v==='biweek') buildCalendar();
      updateMonthLabelText();
      render();
    }

    // triângulo de alerta (cantos arredondados, amarelo, "!" preto) desenhado à mão: o polígono
    // é preenchido E contornado na mesma cor com stroke-linejoin="round", o que arredonda os
    // cantos sem precisar de path/clip-path complicado
    const DAY_STATUS_PENDING_SVG = '<svg viewBox="0 0 24 24"><polygon points="12,3 22,20 2,20" fill="#FBBF24" stroke="#FBBF24" stroke-width="3" stroke-linejoin="round"/><line x1="12" y1="10" x2="12" y2="15" stroke="#1a1a1a" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="18" r="1.15" fill="#1a1a1a"/></svg>';
    // ícone de atenção/completo ao lado do contador de cada dia: triângulo amarelo se algum card
    // do dia (os mesmos que aparecem na célula, já filtrados) tiver campos essenciais faltando,
    // círculo verde com check se todos estiverem completos; some inteiramente quando não há cards
    function updateDayStatusIcon(cell, list){
      const icon = cell.querySelector('.day-status-icon'); if(!icon) return;
      if(!list.length){ icon.style.display = 'none'; return; }
      const allComplete = list.every(isPostComplete);
      icon.style.display = 'flex';
      icon.classList.toggle('is-complete', allComplete);
      icon.classList.toggle('is-pending', !allComplete);
      icon.title = allComplete ? 'Todos os campos preenchidos' : 'Campos pendentes de preenchimento';
      icon.innerHTML = allComplete
        ? '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'
        : DAY_STATUS_PENDING_SVG;
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
        updateDayStatusIcon(cell, list);
      });

      // colunas da visão semanal: sem limite de cards (há bastante espaço vertical), então
      // mostra tudo em vez de cortar com "+N" como no mês
      if(currentView==='week'){
        document.querySelectorAll('#weekGrid .day[data-date]').forEach(cell=>{
          const date = cell.dataset.date;
          const postsEl = cell.querySelector('.posts');
          const list = sortByOrder(postsMap[date] || []);
          list.forEach(p=>{ postsEl.appendChild(createEventElement(p)); });
          updateDayStatusIcon(cell, list);
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
      modalOpenedFromApplyEditoria = false;
      // só fica setada quando este open vem do fluxo de confirmação de data comemorativa (ver
      // confirmCommemorativeDatePost, que reatribui logo em seguida a esta chamada)
      pendingCommemorativeOccasion = null;
      if($('modalBackBtn')) $('modalBackBtn').style.display = 'none';
      setGuidedPostStep(1);
      // pré-preenche a data: a recebida por parâmetro (ex: "+ Adicionar postagem" de uma coluna
      // da semana) ou, na ausência dela, o mês/dia atualmente visível no calendário
      const defaultDate = dateStr || viewDate.toISOString().slice(0,10);
      $('mDate').value = defaultDate;
      // limpa os campos do formulário
      $('mTitle').value=''; $('mNotes').value=''; $('mProductName').value='';
      $('mBriefingLink').value=''; $('mReferencesLink').value=''; $('mArtsLink').value='';
      $('mImageLink').value=''; $('mImageNotes').value='';
      if($('mNoProduct')) $('mNoProduct').checked = false;
      document.querySelectorAll('.mNet').forEach(n=>n.checked=false); document.querySelectorAll('.mEditoria').forEach(e=>e.checked=false);
      // formato depende da(s) rede(s) escolhida(s) — sem rede marcada, não há formato para pré-selecionar
      renderModalFormatsUI();
      document.querySelector('input[name="mType"][value="Static"]').checked = true;
      selectedProducts = [];
      renderSelectedProducts();
      editingReferenceImages = [];
      renderReferenceImages();
      hideProductSuggestions();
      setModalMultiChannelState(false, null);
      // postagem nova ainda não existe — não há o que duplicar/excluir
      if($('modalMenuBtn')) $('modalMenuBtn').style.display = 'none';
      renderIntelValidation(null);
      $('mTitle').focus();
    }

    function closeModal(){
      $('modalBackdrop').style.display = 'none';
      pendingCommemorativeOccasion = null;
      // veio do modal "Aplicar editoria ao mês": ele continua aberto por baixo (nunca foi
      // fechado), então só precisa reaparecer — ressincroniza a linha com o que foi editado
      // no card antes de redesenhar a lista
      if(modalOpenedFromApplyEditoria){
        modalOpenedFromApplyEditoria = false;
        if($('modalBackBtn')) $('modalBackBtn').style.display = 'none';
        if(applyEditoriaState){
          const row = applyEditoriaState.rows.find(r=> r.postId === editingId);
          if(row){ const post = state.posts.find(p=>p.id===row.postId); if(post) row.products = getPostProducts(post).slice(); }
          renderApplyEditoriaModal();
        }
      }
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
      const noProduct = $('mNoProduct') ? $('mNoProduct').checked : false;
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
        post.imageLink = imageLink; post.imageNotes = imageNotes; post.noProduct = noProduct;
        post.referenceImages = editingReferenceImages.slice();
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
        status: defaultStatus, notes, briefingLink, referencesLink, artsLink, imageLink, imageNotes,
        referenceImages: editingReferenceImages.slice(),
        noProduct, collab: false, color: null, editoria: editorias, products: products.slice(), order: nextOrderForDate(date)
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
      if($('mNoProduct')) $('mNoProduct').checked = false;
      document.querySelectorAll('.mNet').forEach(n=>n.checked=false);
      document.querySelectorAll('.mEditoria').forEach(e=>e.checked=false); $('mProductName').value=''; selectedProducts=[]; renderSelectedProducts();
      editingReferenceImages = []; renderReferenceImages();
      renderModalFormatsUI();
    }

    // ============================================================
    // PERSISTÊNCIA DAS POSTAGENS (localStorage)
    // ============================================================
    function saveState(){
      localStorage.setItem(LS_POSTS_KEY, JSON.stringify(state.posts));
      scheduleSyncPush(API_POSTS_KEY, ()=> state.posts);
    }

    function migrateLegacyInstagramFeedPlaces(places){
      if(Array.isArray(places)) return [...new Set(places.map(place=> place==='Feed Vertical' ? 'Feed' : place))];
      return places==='Feed Vertical' ? 'Feed' : places;
    }

    function loadState(){
      const raw = localStorage.getItem(LS_POSTS_KEY);
      if(raw){ try{ state.posts = JSON.parse(raw) || []; }catch(e){ state.posts=[]; } }
      // garante que toda postagem tenha id e status válidos
      const defaultStatus = (APP_SETTINGS.statuses[0] && APP_SETTINGS.statuses[0].name) || 'Rascunho';
      state.posts.forEach(p=>{
        if(!p.id) p.id = generateId();
        if(!p.status) p.status = defaultStatus;
        if(Array.isArray(p.channels)) p.channels.forEach(c=>{ if(c.channel==='Instagram') c.places = migrateLegacyInstagramFeedPlaces(c.places); });
        if(p.channel==='Instagram') p.place = migrateLegacyInstagramFeedPlaces(p.place);
      });
      // atribui `order` às postagens salvas antes desse campo existir
      migratePostOrders();
    }

    // ============================================================
    // CONFIGURAÇÕES DA APLICAÇÃO — redes, editorias, formatos,
    // status, catálogo de produtos e metas (persistidas no localStorage)
    // ============================================================
    const BRAND_COLORS = { Instagram:'#E4405F', Facebook:'#1877F2', LinkedIn:'#0A66C2', TikTok:'#010101', Blog:'#ef4444', Email:'#374151' };
    const BRAND_SHORT_NAMES = { Instagram:'IG', LinkedIn:'LI', TikTok:'TT', Blog:'BL', Email:'EM' };
    // formatos padrão por rede — cada rede tem seu próprio conjunto (ex: Reels só existe no Instagram),
    // cada formato com as dimensões (px) e extensões de arquivo aceitas
    const NETWORK_DEFAULT_FORMATS = {
      Instagram: [
        { name:'Feed', width:1080, height:1350, extensions:['JPG','PNG','MP4'] },
        { name:'Stories', width:1080, height:1920, extensions:['JPG','PNG','MP4'] },
        { name:'Reels', width:1080, height:1920, extensions:['MP4'] }
      ],
      Facebook: [
        { name:'Feed', width:1080, height:1350, extensions:['JPG','PNG','MP4'] },
        { name:'Stories', width:1080, height:1920, extensions:['JPG','PNG','MP4'] },
        { name:'Reels', width:1080, height:1920, extensions:['MP4'] }
      ],
      LinkedIn: [
        { name:'Post', width:1200, height:627, extensions:['JPG','PNG','MP4'] },
        { name:'Artigo', width:1200, height:644, extensions:['JPG','PNG'] }
      ],
      TikTok: [{ name:'Vídeo', width:1080, height:1920, extensions:['MP4'] }],
      Blog: [{ name:'Post', width:1200, height:630, extensions:['JPG','PNG'] }],
      Email: [{ name:'Email', width:600, height:800, extensions:['JPG','PNG'] }]
    };
    // Trend e Personalizado são universais — toda marca tem as duas, mas cada marca recebe
    // sua própria cópia independente (objetos distintos, nunca a mesma referência): editar,
    // renomear ou remover a de uma marca não tem nenhuma correlação com as outras.
    const UNIVERSAL_DEFAULT_EDITORIAS = [
      { name:'Trend', color:'#db2777' },
      { name:'Personalizado', color:'#64748b' }
    ];
    // demais editorias exclusivas de cada marca — diferente das redes/formatos (infraestrutura
    // compartilhada), a categorização de conteúdo é definida por marca: a lista abaixo de
    // cada uma só existe pra ela mesma. Uma marca sem entrada aqui começa só com as universais
    // acima, até a equipe cadastrar as próprias em Configurações → Editorias.
    const VONDER_DEFAULT_EDITORIAS = [
      { name:'Informativo', color:'#7c3aed' },
      { name:'Destaques', color:'#0284c7' },
      { name:'Lançamentos', color:'#16a34a' },
      { name:'Dica VONDER', color:'#b45309' }
    ];
    const FG_DEFAULT_EDITORIAS = [
      { name:'Post E-commerce', color:'#0284c7' },
      { name:'Lançamentos', color:'#16a34a' },
      { name:'Destaques', color:'#7c3aed' },
      { name:'Blog - Conecta FG', color:'#4f46e5' },
      { name:'Datas comemorativas', color:'#db2777' }
    ];
    const OSTEN_FERRAGENS_DEFAULT_EDITORIAS = [
      { name:'Datas comemorativas', color:'#db2777' }
    ];
    // "Datas comemorativas" da Dismatal é uma entrada própria, sem nenhum vínculo com as
    // editorias de mesmo nome da FG/Osten Ferragens acima — cada marca tem seu objeto
    // independente, então renomear/editar a de uma marca nunca afeta as outras
    const DISMATAL_DEFAULT_EDITORIAS = [
      { name:'Datas comemorativas', color:'#db2777' }
    ];
    const EDITORIAS_BY_BRAND = {
      '': VONDER_DEFAULT_EDITORIAS,
      '__ferramentas-gerais': FG_DEFAULT_EDITORIAS,
      '__osten-ferragens': OSTEN_FERRAGENS_DEFAULT_EDITORIAS,
      '__dismatal': DISMATAL_DEFAULT_EDITORIAS
    };
    const DEFAULT_SETTINGS = {
      TARGET: 3,
      // meta semanal de vídeos (0 = sem meta definida) — informativa, editada em Configurações > Metas
      videoWeeklyTarget: 2,
      networks: [
        { name:'Instagram', shortName:'IG', color:'#E4405F', formats: NETWORK_DEFAULT_FORMATS.Instagram.map(f=>Object.assign({},f)) },
        { name:'Facebook', shortName:'FB', color:'#1877F2', formats: NETWORK_DEFAULT_FORMATS.Facebook.map(f=>Object.assign({},f)) },
        { name:'TikTok', shortName:'TT', color:'#010101', formats: NETWORK_DEFAULT_FORMATS.TikTok.map(f=>Object.assign({},f)) },
        { name:'LinkedIn', shortName:'LI', color:'#0A66C2', formats: NETWORK_DEFAULT_FORMATS.LinkedIn.map(f=>Object.assign({},f)) },
        { name:'Blog', shortName:'BL', color:'#ef4444', formats: NETWORK_DEFAULT_FORMATS.Blog.map(f=>Object.assign({},f)) },
        { name:'Email', shortName:'EM', color:'#374151', formats: NETWORK_DEFAULT_FORMATS.Email.map(f=>Object.assign({},f)) }
      ],
      editorias: (EDITORIAS_BY_BRAND[BRAND_SUFFIX] || []).concat(UNIVERSAL_DEFAULT_EDITORIAS).map(e=>Object.assign({},e)),
      statuses: [
        { name:'Rascunho', color:'#94a3b8' },
        { name:'Em produção', color:'#f59e0b' },
        { name:'Aprovado', color:'#10b981' },
        { name:'Agendado', color:'#6366f1' }
      ],
      catalog: [],
      // datas comemorativas personalizadas (ex: aniversário da empresa, um evento específico)
      // — somam-se às datas comemorativas fixas/móveis calculadas em commemorativeDateName()
      customDates: []
    };
    let APP_SETTINGS = Object.assign({}, DEFAULT_SETTINGS);

    function saveSettings(){
      // grava as configurações e a meta principal
      APP_SETTINGS.TARGET = TARGET;
      localStorage.setItem(LS_SETTINGS_KEY, JSON.stringify(APP_SETTINGS));
      scheduleSyncPush(API_SETTINGS_KEY, ()=> APP_SETTINGS);
    }

    function loadSettings(){
      const raw = localStorage.getItem(LS_SETTINGS_KEY);
      // rastreia se alguma migração abaixo realmente mudou algo em relação ao que já estava
      // salvo — se sim, no fim da função persiste e sincroniza o resultado (ver saveSettings()
      // no fim). Sem isso, essas migrações só valiam para a sessão atual: nunca eram gravadas de
      // volta no localStorage nem enviadas pro servidor, então uma editoria/rede padrão nova só
      // aparecia enquanto o app.js rodava — outra página que lê a config direto do localStorage,
      // como o Editor de Posts, ou outro computador puxando do servidor, continuava vendo a
      // versão antiga e incompleta para sempre.
      let migrated = !raw;
      if(raw){ try{ const s = JSON.parse(raw); APP_SETTINGS = Object.assign({}, DEFAULT_SETTINGS, s||{}); if(!APP_SETTINGS.statuses || !APP_SETTINGS.statuses.length) APP_SETTINGS.statuses = DEFAULT_SETTINGS.statuses.slice();
        // acrescenta às editorias já salvas as categorizações default que ainda não existem
        // (por nome), sem mexer nas que o usuário já tinha customizado
        if(!APP_SETTINGS.editorias) APP_SETTINGS.editorias = [];
        // corrige a grafia de "Post e-commerce" pra "Post E-commerce" (ver FG_DEFAULT_EDITORIAS)
        // em quem já tinha salvo a versão antiga, antes do merge abaixo criar uma duplicata
        { const old = APP_SETTINGS.editorias.find(e=>e.name==='Post e-commerce'); if(old){ old.name = 'Post E-commerce'; migrated = true; } }
        { const before = APP_SETTINGS.editorias.length;
          DEFAULT_SETTINGS.editorias.forEach(def=>{ if(!APP_SETTINGS.editorias.some(e=>e.name===def.name)) APP_SETTINGS.editorias.push(Object.assign({},def)); });
          if(APP_SETTINGS.editorias.length!==before) migrated = true; }
        // limpa editorias da VONDER que vazaram pra outras marcas (de quando o padrão acima
        // ainda era compartilhado por todas) — preserva, porém, qualquer nome que também faça
        // parte da lista padrão da própria marca (ex: FG também tem "Destaques"/"Lançamentos",
        // que não são leftover nesse caso, são editorias legítimas da FG)
        if(BRAND_SUFFIX!==''){
          const ownDefaultNames = new Set((EDITORIAS_BY_BRAND[BRAND_SUFFIX]||[]).map(def=>def.name));
          const before = APP_SETTINGS.editorias.length;
          APP_SETTINGS.editorias = APP_SETTINGS.editorias.filter(e=> ownDefaultNames.has(e.name) || !VONDER_DEFAULT_EDITORIAS.some(def=>def.name===e.name));
          if(APP_SETTINGS.editorias.length!==before) migrated = true;
        }
        // mesma lógica pras redes padrão (ex: Facebook) — acrescenta as que faltam por nome,
        // sem mexer nas redes que o usuário já tinha configurado
        if(!APP_SETTINGS.networks) APP_SETTINGS.networks = [];
        { const before = APP_SETTINGS.networks.length;
          DEFAULT_SETTINGS.networks.forEach(def=>{ if(!APP_SETTINGS.networks.some(n=> (typeof n==='string'?n:n.name)===def.name)) APP_SETTINGS.networks.push(Object.assign({}, def, { formats: def.formats.map(f=>Object.assign({},f)) })); });
          if(APP_SETTINGS.networks.length!==before) migrated = true; }
        // reordena pela ordem canônica das redes padrão (ex: TikTok logo após Facebook), mantendo
        // redes customizadas pelo usuário na posição relativa em que já estavam, ao final
        { const order = new Map(DEFAULT_SETTINGS.networks.map((n,i)=>[n.name,i]));
          APP_SETTINGS.networks = APP_SETTINGS.networks.map((n,i)=>({ n, i })).sort((a,b)=>{
            const ra = order.has(a.n.name) ? order.get(a.n.name) : Infinity;
            const rb = order.has(b.n.name) ? order.get(b.n.name) : Infinity;
            return ra===rb ? a.i-b.i : ra-rb;
          }).map(x=>x.n); }
        TARGET = APP_SETTINGS.TARGET || TARGET; }catch(e){ APP_SETTINGS = Object.assign({}, DEFAULT_SETTINGS); migrated = true; } }
      // migra o formato antigo de redes (string simples) para {name,color}
      APP_SETTINGS.networks = (APP_SETTINGS.networks||[]).map((n,i)=> typeof n === 'string' ? { name:n, color: BRAND_COLORS[n] || TAG_PALETTE[i % TAG_PALETTE.length] } : n);
      // remove o Twitter de configurações salvas antes da rede ser descontinuada do app
      APP_SETTINGS.networks = APP_SETTINGS.networks.filter(n=>n.name!=='Twitter');
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
        // migra os formatos padrão antigos sem alterar redes ou formatos personalizados
        if(n.name==='Instagram'){
          const legacyFeed = n.formats.find(f=>f.name==='Feed Vertical');
          if(legacyFeed && !n.formats.some(f=>f!==legacyFeed && f.name==='Feed')) legacyFeed.name = 'Feed';
        }
        if(n.name==='Facebook'){
          const feed = n.formats.find(f=>f.name==='Feed');
          if(feed){ feed.width = 1080; feed.height = 1350; }
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
        if(e.schedule && Array.isArray(e.schedule.channels)){
          e.schedule.channels.forEach(c=>{ if(c.channel==='Instagram') c.places = migrateLegacyInstagramFeedPlaces(c.places); });
        }
      });
      // migra o agendamento único antigo (uma config valendo pra qualquer mês) para o novo
      // modelo por mês — cada mês passa a ter sua própria configuração (ver monthKeyFromDate/
      // scheduleByMonth), sem um "padrão" perene. O agendamento que já existia vira a config do
      // mês atual; dali em diante o usuário ajusta cada mês individualmente pelo navegador de
      // mês do editor de agendamento.
      APP_SETTINGS.editorias.forEach(e=>{
        if(e.schedule && !e.scheduleByMonth){ e.scheduleByMonth = { [monthKeyFromDate(new Date())]: e.schedule }; }
        delete e.schedule;
      });
      // alguma migração acima acrescentou/corrigiu algo que ainda não estava salvo (ou este
      // navegador nunca tinha salvo nada) — grava e sincroniza agora, pra essa versão completa
      // valer para qualquer página/computador que ler essa configuração a partir de agora
      if(migrated) saveSettings();
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
    const syncVersions = { [API_POSTS_KEY]: 0, [API_SETTINGS_KEY]: 0 };
    const syncPushTimers = {};
    function setSyncStatus(text, kind){
      const el = $('syncStatus'); if(!el) return;
      el.textContent = text;
      el.className = 'sync-status' + (kind ? ' '+kind : '');
    }
    // true se algum modal estiver aberto — usado pra não recarregar dados do servidor
    // (e redesenhar a tela) enquanto a pessoa está no meio de uma edição
    function anyModalOpen(){
      return ['modalBackdrop','settingsBackdrop','filtersBackdrop','applyEditoriaBackdrop'].some(id=>{
        const el = $(id); return el && el.style.display === 'flex';
      });
    }
    async function syncFetch(key){
      return SyncBackend.get(key);
    }
    async function syncPush(key, value){
      const result = await SyncBackend.put(key, value, syncVersions[key]);
      if(result.conflict) return { conflict:true, server:result.server };
      syncVersions[key] = result.updated_at;
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
            // outra pessoa salvou primeiro: adota a versão do servidor em vez de sobrescrever.
            // server.v===null significa "nada salvo no servidor ainda" (chave vazia/nunca
            // gravada) — nesse caso NÃO apaga os dados locais (senão uma corrida com o servidor
            // vazio zeraria o calendário à toa); só adota a versão e reagenda o envio, pra essa
            // cópia local acabar subindo pro servidor no próximo ciclo
            if(result.server.v === null){
              syncVersions[key] = result.server.updated_at;
              scheduleSyncPush(key, getValue);
            } else {
              const storageKey = key===API_POSTS_KEY ? LS_POSTS_KEY : LS_SETTINGS_KEY;
              localStorage.setItem(storageKey, JSON.stringify(result.server.v));
              if(key===API_POSTS_KEY) loadState(); else loadSettings();
              syncVersions[key] = result.server.updated_at;
              if(!anyModalOpen()){ renderAllDynamicUI(); buildCalendar(); render(); }
              setSyncStatus('Atualizado com mudanças de outra pessoa', 'warn');
              alert('Outra pessoa salvou uma alteração enquanto você editava. Os dados foram atualizados com a versão mais recente do servidor — se sua última ação não aparecer, refaça-a.');
            }
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
        const [postsRes, settingsRes] = await Promise.all([syncFetch(API_POSTS_KEY), syncFetch(API_SETTINGS_KEY)]);
        let changed = false;
        if(settingsRes.v!==null && settingsRes.updated_at!==syncVersions[API_SETTINGS_KEY]){
          localStorage.setItem(LS_SETTINGS_KEY, JSON.stringify(settingsRes.v));
          loadSettings(); changed = true;
        }
        syncVersions[API_SETTINGS_KEY] = settingsRes.updated_at;
        if(postsRes.v!==null && postsRes.updated_at!==syncVersions[API_POSTS_KEY]){
          localStorage.setItem(LS_POSTS_KEY, JSON.stringify(postsRes.v));
          loadState(); changed = true;
        }
        syncVersions[API_POSTS_KEY] = postsRes.updated_at;
        if(changed && !anyModalOpen()){ renderAllDynamicUI(); buildCalendar(); render(); }
        if(changed || showIdleStatus) setSyncStatus('Sincronizado com o servidor', 'ok');
      }catch(e){
        setSyncStatus('Sem conexão com o servidor — usando cópia local', 'warn');
      }
    }

    // ============================================================
    // CENTRAL DE INTELIGÊNCIA (consulta) — o calendário só LÊ o aprendizado (DNA) já gerado
    // por editoria; quem treina a IA é a tela intelligence-center.html. intelligence-data.js
    // (carregado antes deste arquivo) resolve sozinho o isolamento por marca e concentra toda
    // a lógica de análise (IntelStore.generateDNA/validatePost) — aqui só usamos o resultado
    // pra sugerir conteúdo (renderIntelSuggestBox) e validar o rascunho atual (wireIntelValidation).
    // ============================================================
    let INTEL = (typeof IntelStore !== 'undefined') ? IntelStore.readLocal() : { editorias:{} };
    async function refreshIntel(){
      if(!SYNC_ENABLED || typeof IntelStore === 'undefined') return;
      try{
        const res = await IntelStore.fetchServer();
        if(res.v!==null){
          INTEL = IntelStore.normalize(res.v);
          IntelStore.writeLocal(INTEL);
          if($('modalBackdrop').style.display === 'flex') renderIntelSuggestBox();
        }
      }catch(e){ /* offline — segue com a última cópia local conhecida */ }
    }

    // editoria(s) marcada(s) no modal que já têm DNA gerado pela Central de Inteligência —
    // usa a primeira (na ordem em que aparecem nos checkboxes) como referência para sugestões
    // e validação, já que combinar o DNA de várias editorias ao mesmo tempo não faria sentido
    function selectedEditoriasWithDna(){
      const editorias = Array.from(document.querySelectorAll('.mEditoria:checked')).map(e=>e.value);
      return editorias.filter(name=> INTEL.editorias[name] && INTEL.editorias[name].dna);
    }

    function renderIntelSuggestBox(){
      const box = $('intelSuggestBox'); if(!box) return;
      const names = selectedEditoriasWithDna();
      if(names.length===0){ box.style.display = 'none'; box.innerHTML = ''; return; }
      const editoriaName = names[0];
      const dna = INTEL.editorias[editoriaName].dna;
      const structureVal = dna.contentStrategy.textStructure.value;
      const structureText = structureVal ? structureVal.join(' → ') : null;
      const objective = dna.howItWorks.objective.value;
      const topModel = dna.contentModels && dna.contentModels[0];
      const briefingLines = [
        `Editoria: ${editoriaName}`,
        objective ? `Objetivo identificado: ${objective}` : null,
        structureText ? `Estrutura recomendada: ${structureText}` : null,
        dna.hooks[0] ? `Gancho de abertura sugerido: ${dna.hooks[0]}` : null,
        dna.ctas[0] ? `CTA sugerido: ${dna.ctas[0]}` : null,
        topModel ? `Modelo recomendado: ${topModel.pattern}` : null,
        dna.recurringWords.length ? `Palavras recorrentes desta editoria: ${dna.recurringWords.slice(0,5).map(w=>w.word).join(', ')}` : null
      ].filter(Boolean).join('\n');
      box.style.display = 'flex';
      box.innerHTML = `
        <div class="intel-modal-box-title">${UI_ICONS.idea(13)} Direcionamento da IA — Central de Inteligência${names.length>1?` <span style="font-weight:400;text-transform:none">(baseado em "${escapeHtml(editoriaName)}")</span>`:''}</div>
        <ul class="intel-rule-list">
          ${objective ? `<li><b>Objetivo:</b> ${escapeHtml(objective)}</li>` : ''}
          ${structureText ? `<li><b>Estrutura:</b> ${escapeHtml(structureText)}</li>` : ''}
          ${dna.hooks[0] ? `<li><b>Gancho:</b> ${escapeHtml(dna.hooks[0])}</li>` : ''}
          ${dna.ctas[0] ? `<li><b>CTA:</b> ${escapeHtml(dna.ctas[0])}</li>` : ''}
          ${topModel ? `<li><b>Modelo recomendado:</b> ${escapeHtml(topModel.pattern)}</li>` : ''}
          ${dna.visualStrategy.composition.value ? `<li><b>Composição visual predominante:</b> ${escapeHtml(dna.visualStrategy.composition.value)}</li>` : ''}
        </ul>
        <div class="intel-modal-actions">
          <button type="button" id="intelUseBriefingBtn" class="btn small">Usar como briefing para o designer</button>
        </div>
      `;
      $('intelUseBriefingBtn').addEventListener('click', ()=>{
        const notes = $('mNotes');
        notes.value = notes.value.trim() ? `${notes.value.trim()}\n\n${briefingLines}` : briefingLines;
        refreshModalDynamic();
      });
    }

    function scoreColor(score){
      if(score===null) return 'var(--text-faint)';
      if(score>=70) return 'var(--success)';
      if(score>=45) return 'var(--accent-ink)';
      return 'var(--danger)';
    }
    function renderIntelValidation(result){
      const el = $('intelValidateResult'); if(!el) return;
      if(!result){ el.innerHTML = ''; return; }
      if(result.score===null){
        el.innerHTML = `<div class="bg-inline-warning" style="margin-top:10px">${escapeHtml(result.improvements[0])}</div>`;
        return;
      }
      const color = scoreColor(result.score);
      el.innerHTML = `
        <div class="intel-adherence" style="margin-top:12px">
          <div class="intel-adherence-header"><span>Nível de aderência ao DNA da editoria</span><span style="color:${color};font-weight:900">${result.score}%</span></div>
          <div class="intel-score-bar"><div class="intel-score-bar-fill" style="width:${result.score}%;background:${color}"></div></div>
          ${result.mainConcept ? `<div class="intel-main-concept"><b>Conceito principal:</b> ${escapeHtml(result.mainConcept)}</div>` : ''}
        </div>
        ${result.strengths.length ? `<ul class="intel-rule-list intel-rule-list--positive" style="margin-top:10px">${result.strengths.map(s=>`<li>${escapeHtml(s)}</li>`).join('')}</ul>` : ''}
        ${result.improvements.length ? `<ul class="intel-rule-list intel-rule-list--warn" style="margin-top:8px">${result.improvements.map(s=>`<li>${escapeHtml(s)}</li>`).join('')}</ul>` : ''}
      `;
    }
    function wireIntelValidation(){
      const btn = $('intelValidateBtn'); if(!btn) return;
      btn.addEventListener('click', ()=>{
        const names = selectedEditoriasWithDna();
        const editorias = Array.from(document.querySelectorAll('.mEditoria:checked')).map(e=>e.value);
        if(editorias.length===0){ alert('Selecione uma editoria antes de analisar a publicação.'); return; }
        const dna = names.length ? INTEL.editorias[names[0]].dna : null;
        const result = IntelStore.validatePost({ title: $('mTitle').value, caption: $('mNotes').value }, dna);
        renderIntelValidation(result);
      });
    }

    // ============================================================
    // GERADOR DE LEGENDA — monta um rascunho de texto do post combinando os dados reais do
    // produto (destaques/aplicações/ficha técnica, do catálogo mestre) com o gancho e o CTA do
    // DNA de estilo da editoria selecionada (Central de Inteligência), quando disponível.
    // ============================================================
    function generateCaptionDraft(){
      const details = primarySelectedProductDetails();
      if(!details) return null;
      const productName = shortenProductName(details.name) || contentProductPhrase();
      const dnaNames = selectedEditoriasWithDna();
      const dna = dnaNames.length ? INTEL.editorias[dnaNames[0]].dna : null;

      const lines = [];
      // abertura: gancho do DNA da editoria quando houver; senão, um gancho de curiosidade sobre
      // o destaque real do produto (ver HOOK_FORMULAS) — nunca cai num "Apresentamos o X." seco
      if(dna && dna.hooks[0]){
        lines.push(dna.hooks[0]);
        if(details.destaques) lines.push(firstSentence(details.destaques, 200));
      } else {
        lines.push(hookFor('destaque', productName, details.destaques && firstSentence(details.destaques,200)) || `Conheça o ${productName}.`);
      }
      if(details.aplicacoes) lines.push(hookFor('aplicacao', productName, details.aplicacoes));
      const specs = specsPreview(details.qualificacaoTecnica, 4);
      if(specs) lines.push(hookFor('specs', productName, specs));
      lines.push((dna && dna.ctas[0]) ? dna.ctas[0] : 'Saiba mais e confira as condições especiais.');
      return lines.filter(Boolean).join('\n\n');
    }

    function wireCaptionGenerator(){
      const btn = $('generateCaptionBtn'); if(!btn) return;
      btn.addEventListener('click', ()=>{
        if(selectedProducts.length===0){ alert('Selecione um produto do catálogo antes de gerar a legenda.'); return; }
        const draft = generateCaptionDraft();
        if(!draft){ alert('O produto selecionado não tem dados de destaques/aplicações no catálogo — gere a legenda manualmente ou escolha outro produto.'); return; }
        const notes = $('mNotes');
        if(notes.value.trim() && !confirm('Isso substitui o texto atual do campo. Continuar?')) return;
        notes.value = draft;
        refreshModalDynamic();
      });
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
    // (ex: Instagram = Feed/Stories/Reels, LinkedIn = Post), cada um com
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
      APP_SETTINGS.networks.forEach(n=>{ const b = document.createElement('button'); b.className='btn ghost icon-only'; b.dataset.tab = n.name; b.title = n.name; b.setAttribute('aria-label', n.name); b.innerHTML = networkIcon(n.name) + '<span class="tab-remove" aria-hidden="true">&times;</span>'; tabs.appendChild(b); });
      // liga o clique de cada aba — "Todas" limpa a seleção; cada rede alterna dentro/fora de
      // activeTabs, permitindo selecionar várias redes ao mesmo tempo (seleção múltipla)
      tabs.querySelectorAll('button').forEach(b=>{
        b.addEventListener('click', ()=>{
          if(b.dataset.tab==='All'){ activeTabs = []; }
          else{ const i = activeTabs.indexOf(b.dataset.tab); if(i>=0) activeTabs.splice(i,1); else activeTabs.push(b.dataset.tab); }
          updateTabsActiveUI();
          render();
        });
      });
      updateTabsActiveUI();
    }

    // aplica as classes visuais (.ghost por botão + .all-active no container) de acordo com o
    // activeTabs atual — chamada após clique e após reconstruir a lista de abas
    function updateTabsActiveUI(){
      const tabs = $('tabs'); if(!tabs) return;
      const allSelected = activeTabs.length===0;
      tabs.querySelectorAll('button').forEach(b=>{
        const isActive = b.dataset.tab==='All' ? allSelected : activeTabs.includes(b.dataset.tab);
        b.classList.toggle('ghost', !isActive);
      });
      tabs.classList.toggle('all-active', allSelected);
    }

    // nome da rede cujo sub-dropdown de formatos está aberto em Configurações (persiste entre
    // re-renders, já que qualquer alteração nas configurações reconstrói a lista inteira)
    let openNetworkFormats = null;
    // nome da rede cujos campos (nome/nome curto/ícone) estão em modo de edição — mesma lógica de persistência
    let editingNetworkName = null;
    // nome da editoria atualmente em modo de edição inline na tela de Configurações (ou null) —
    // sempre igual a openEditoriaSchedule: nome/cor e dias fixos/formatos abrem e fecham juntos,
    // pelo mesmo ícone de lápis (ou clicando no chip de dias fixos/redes, quando há um)
    let editingEditoriaName = null;
    // nome da editoria cujo painel de "dias fixos e formatos" está aberto para edição (ou null)
    let openEditoriaSchedule = null;
    // mês ("YYYY-MM") que o navegador acima da lista de editorias está exibindo — um só, vale
    // pra todas as editorias ao mesmo tempo (chip da linha e painel de edição, quando aberto),
    // ver renderEditoriasUI/editoriasMonthKey. Só null antes da 1ª renderização.
    let editoriasMonthKey = null;

    // ============================================================
    // POPOVER DE MESES do navegador acima da lista de editorias — mesmo componente visual do
    // seletor de mês/ano do calendário principal (classes .month-year-picker/.myp-months/
    // .myp-month, ver openMonthYearPicker() lá em cima), mas construído em JS e fixo em
    // document.body (em vez de position:absolute dentro do painel): #secEditorias fica dentro
    // de .settings-content, que tem overflow-y:auto — um popover position:absolute ali seria
    // cortado assim que passasse da altura visível, o mesmo problema que o menu "⋮" de cada
    // editoria (getEditoriaMenuEl) e o popover de marca do portal-shell.js já resolvem do
    // mesmo jeito.
    // ============================================================
    let editoriasMonthPickerEl = null;
    let editoriasPickerYear = null; // ano exibido no popover (pode diferir do ano de editoriasMonthKey enquanto navega antes de escolher um mês)
    function getEditoriasMonthPickerEl(){
      if(editoriasMonthPickerEl) return editoriasMonthPickerEl;
      editoriasMonthPickerEl = document.createElement('div');
      editoriasMonthPickerEl.className = 'month-year-picker';
      // .month-year-picker nasceu pra uso fora de modal (z-index:40) — dentro do modal de
      // Configurações (.modal-backdrop, z-index:60) precisa de um z-index mais alto pra não
      // ficar atrás dele, daí o mesmo valor do .event-menu (menu "⋮" de cada editoria). A
      // classe original também traz left:50%+transform:translateX(-50%) (centralização via
      // .month-label-wrap com position:relative) — aqui o left em px já é calculado manualmente
      // a cada abertura (ver openEditoriasMonthPicker), então o transform precisa ser zerado,
      // senão os dois mecanismos de centralização somam e o popover sai 50% da própria largura
      // deslocado pra esquerda do que deveria.
      editoriasMonthPickerEl.style.position = 'fixed';
      editoriasMonthPickerEl.style.transform = 'none';
      editoriasMonthPickerEl.style.zIndex = '1000';
      editoriasMonthPickerEl.innerHTML = '<div class="myp-months"></div>';
      editoriasMonthPickerEl.addEventListener('click', ev=> ev.stopPropagation());
      document.body.appendChild(editoriasMonthPickerEl);
      return editoriasMonthPickerEl;
    }
    function renderEditoriasMonthPicker(){
      const grid = getEditoriasMonthPickerEl().querySelector('.myp-months');
      const today = new Date();
      const [selYear, selMonth1] = editoriasMonthKey.split('-').map(Number); // selMonth1 é 1-based
      grid.innerHTML = '';
      for(let m=0; m<12; m++){
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'myp-month';
        btn.textContent = MONTH_ABBR[m];
        const isPast = editoriasPickerYear < today.getFullYear() || (editoriasPickerYear===today.getFullYear() && m < today.getMonth());
        const isCurrent = editoriasPickerYear===today.getFullYear() && m===today.getMonth();
        const isSelected = editoriasPickerYear===selYear && (m+1)===selMonth1;
        if(isPast) btn.classList.add('past');
        if(isCurrent) btn.classList.add('current');
        if(isSelected) btn.classList.add('selected');
        btn.addEventListener('click', ()=>{
          editoriasMonthKey = monthKeyFromDate(new Date(editoriasPickerYear, m, 1));
          closeEditoriasMonthPicker();
          renderEditoriasUI();
        });
        grid.appendChild(btn);
      }
    }
    function openEditoriasMonthPicker(){
      editoriasPickerYear = parseInt(editoriasMonthKey.split('-')[0], 10);
      renderEditoriasMonthPicker();
      const popover = getEditoriasMonthPickerEl();
      const trigger = $('editoriasMonthLabel');
      const rect = trigger.getBoundingClientRect();
      popover.style.top = `${rect.bottom + 6}px`;
      popover.style.left = `${Math.max(4, rect.left + rect.width/2 - 120)}px`; // 240px de largura (mesma da .month-year-picker) — centraliza sob o botão
      popover.classList.add('open');
      trigger.setAttribute('aria-expanded', 'true');
      $('editoriasMonthLabelText').textContent = editoriasPickerYear;
    }
    function closeEditoriasMonthPicker(){
      if(editoriasMonthPickerEl) editoriasMonthPickerEl.classList.remove('open');
      const trigger = $('editoriasMonthLabel');
      if(trigger) trigger.setAttribute('aria-expanded', 'false');
      const labelText = $('editoriasMonthLabelText');
      if(labelText && editoriasMonthKey) labelText.textContent = monthLabelFromKey(editoriasMonthKey);
    }
    function toggleEditoriasMonthPicker(){
      if(editoriasMonthPickerEl && editoriasMonthPickerEl.classList.contains('open')) closeEditoriasMonthPicker();
      else openEditoriasMonthPicker();
    }
    // navega o ano exibido no popover — chamado pelas setas ‹ › do navegador enquanto ele estiver aberto
    function stepEditoriasPickerYear(delta){
      editoriasPickerYear += delta;
      $('editoriasMonthLabelText').textContent = editoriasPickerYear;
      renderEditoriasMonthPicker();
    }

    // abre (ou fecha, se já aberto) o modo de edição completo de uma editoria — nome/cor e dias
    // fixos/redes juntos, sempre pelo mesmo gatilho: o ícone de lápis ou o chip de agendamento
    function toggleEditoriaEdit(name){
      const isOpen = editingEditoriaName === name && openEditoriaSchedule === name;
      editingEditoriaName = isOpen ? null : name;
      openEditoriaSchedule = isOpen ? null : name;
      renderAllDynamicUI();
    }
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
                <input type="text" class="net-new-format-name" placeholder="Nome do formato (ex: Carrossel)" style="flex:2;min-width:140px" />
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
            APP_SETTINGS.editorias.forEach(e=>{ Object.values(e.scheduleByMonth||{}).forEach(s=> (s.channels||[]).forEach(c=>{ if(c.channel===oldName) c.channel = newName; })); });
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

    const WEEKDAYS_PT = [
      { short:'Dom', full:'Domingo' }, { short:'Seg', full:'Segunda-feira' },
      { short:'Ter', full:'Terça-feira' }, { short:'Qua', full:'Quarta-feira' },
      { short:'Qui', full:'Quinta-feira' }, { short:'Sex', full:'Sexta-feira' },
      { short:'Sáb', full:'Sábado' }
    ];
    const WEEKDAY_ABBR = WEEKDAYS_PT.map(day=>day.short);

    // chave "YYYY-MM" usada em editoria.scheduleByMonth — cada mês guarda seu próprio
    // agendamento fixo (dias da semana + redes), sem um "padrão" valendo pra sempre: uma
    // editoria pode publicar aos sábados em agosto e às terças em setembro, por exemplo
    function monthKeyFromDate(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }
    function monthLabelFromKey(key){
      const [y,m] = key.split('-').map(Number);
      const label = new Date(y, m-1, 1).toLocaleString('pt-BR', { month:'long', year:'numeric' });
      return label.charAt(0).toUpperCase()+label.slice(1);
    }

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
          <div style="font-size:11.5px;color:var(--muted);margin:-2px 0 4px">Opcional — dias fixos da semana em que essa editoria publica neste mês (ex: sempre sábado). Cada mês tem sua própria configuração; use "Aplicar" para gerar os cards dele.</div>
          <div class="sched-weekdays"></div>
        </div>
        <div>
          <label>Redes, tipos e formatos</label>
          <div style="font-size:11.5px;color:var(--muted);margin:-2px 0 4px">Marque quantas redes forem necessárias — cada uma pode ter vários tipos, e cada tipo, vários formatos.</div>
          <div class="sched-nets"></div>
          <div class="sched-net-configs" style="display:flex;flex-direction:column;gap:8px;margin-top:6px"></div>
        </div>`;

      const wd = container.querySelector('.sched-weekdays');
      WEEKDAYS_PT.forEach((day,i)=>{
        const lbl=document.createElement('label'); lbl.className='sched-day-chip'; lbl.title=day.full;
        lbl.innerHTML = `<input type="checkbox" class="sched-weekday" value="${i}" aria-label="${day.full}" ${weekdays.includes(i)?'checked':''} /><span>${day.short}</span>`;
        wd.appendChild(lbl);
      });
      const allChecked = weekdays.length===7;
      const allLbl = document.createElement('label'); allLbl.className='sched-day-chip sched-all-days-chip';
      allLbl.innerHTML = `<input type="checkbox" class="sched-all-days" aria-label="Selecionar todos os dias" ${allChecked?'checked':''} /><span>Todos os dias</span>`;
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
            <div class="sched-net-config-title"><span class="sched-net-config-icon">${networkIcon(netName)}</span><span>${escapeHtml(netName)}</span></div>
            <div style="font-size:11px;color:var(--muted);margin-bottom:2px">Tipo</div>
            <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px">
              <label class="chip"><input type="checkbox" class="sched-type" value="Static" ${cfg.types.includes('Static')?'checked':''}/>${TYPE_ICONS.Static} Estático</label>
              <label class="chip"><input type="checkbox" class="sched-type" value="Video" ${cfg.types.includes('Video')?'checked':''}/>${TYPE_ICONS.Video} Vídeo</label>
            </div>
            <div style="font-size:11px;color:var(--muted);margin-bottom:2px">Formato</div>
            <div style="display:flex;gap:4px;flex-wrap:wrap">
              ${(net && net.formats || []).map(f=>`<label class="chip"><input type="checkbox" class="sched-place" value="${escapeHtml(f.name)}" ${cfg.places.includes(f.name)?'checked':''}/>${formatIcon(f.name)} ${escapeHtml(f.name)}</label>`).join('') || '<span style="font-size:11.5px;color:var(--text-faint)">Essa rede ainda não tem formatos cadastrados.</span>'}
            </div>`;
          configsC.appendChild(panel);
        });
      }

      APP_SETTINGS.networks.forEach(n=>{
        const lbl = document.createElement('label'); lbl.className='chip-net sched-net-choice';
        lbl.title = n.name;
        lbl.innerHTML = `<input type="checkbox" class="sched-net" value="${escapeHtml(n.name)}" aria-label="${escapeHtml(n.name)}" ${cfgByChannel[n.name]?'checked':''} />${networkIcon(n.name)}`;
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
        },
        // true quando há alguma seleção (dia da semana e/ou rede marcada) que ainda não forma
        // um agendamento válido — diferencia "esqueceu de completar" de "desmarcou tudo de
        // propósito pra remover o agendamento deste mês", que também faz getValue() retornar null
        isIncomplete(){
          const hasWeekday = wd.querySelectorAll('.sched-weekday:checked').length>0;
          syncVisiblePanelsIntoState();
          const checkedNets = Array.from(netsC.querySelectorAll('.sched-net:checked')).map(el=>el.value);
          if(!hasWeekday && checkedNets.length===0) return false;
          const channels = checkedNets.map(n=> cfgByChannel[n]).filter(c=> c && c.types.length>0 && c.places.length>0);
          return !hasWeekday || channels.length===0;
        }
      };
    }

    // menu flutuante "⋮" de cada editoria (por enquanto só "Remover editoria") — mesmo padrão
    // do menu de postagem (getCardMenuEl/closeAllCardMenus): um único elemento reaproveitado,
    // fixo em document.body e reposicionado a cada abertura, pra não ser cortado pelo
    // overflow:hidden do .net-row. Tira "Remover" de um X sempre exposto na linha (fácil de
    // clicar sem querer) e vira um item de texto claro, em vermelho, que só aparece sob demanda.
    let editoriaMenuEl = null;
    function getEditoriaMenuEl(){
      if(editoriaMenuEl) return editoriaMenuEl;
      editoriaMenuEl = document.createElement('div');
      editoriaMenuEl.className = 'event-menu';
      editoriaMenuEl.addEventListener('click', ev=> ev.stopPropagation());
      document.body.appendChild(editoriaMenuEl);
      return editoriaMenuEl;
    }
    function closeEditoriaMenu(){ if(editoriaMenuEl) editoriaMenuEl.classList.remove('open'); }
    document.addEventListener('click', closeEditoriaMenu);
    window.addEventListener('scroll', closeEditoriaMenu, true);

    function renderEditoriasUI(){
      const c = $('editoriasContainer'); if(c){ c.innerHTML=''; APP_SETTINGS.editorias.forEach(e=>{ const lbl=document.createElement('label'); lbl.className='chip'; lbl.innerHTML = `<input type="checkbox" class="mEditoria" value="${escapeHtml(e.name)}" /> <span class="dot" style="background:${editoriaColor(e.name)}"></span>${escapeHtml(e.name)}`; c.appendChild(lbl); lbl.querySelector('input').addEventListener('change', refreshModalDynamic); }); }
      const fc = $('filterEditoriasContainer'); if(fc){ fc.innerHTML=''; APP_SETTINGS.editorias.forEach(e=>{ const lbl=document.createElement('label'); lbl.className='chip'; lbl.innerHTML = `<input type="checkbox" class="fEditoria" value="${escapeHtml(e.name)}"/> <span class="dot" style="background:${editoriaColor(e.name)}"></span>${escapeHtml(e.name)}`; fc.appendChild(lbl); }); }

      // dias fixos + redes/tipos/formatos do formulário de nova editoria — monta o editor
      // reutilizável e guarda o handle para o botão "Adicionar editoria" ler ao salvar
      const newSchedFields = $('newEditoriaScheduleFields');
      if(newSchedFields) newEditoriaScheduleEditor = buildScheduleEditor(newSchedFields, null);

      // navegador de mês compartilhado, acima da lista — um só mês vale pra todas as editorias
      // ao mesmo tempo (ver editoriasMonthKey). Começa no mês que o calendário está exibindo;
      // dali em diante só muda pelas próprias setas ou pelo popover de meses (ligados uma única
      // vez, fora daqui, junto dos outros botões estáticos da tela — não recriados a cada render)
      if(!editoriasMonthKey) editoriasMonthKey = monthKeyFromDate(viewDate);
      const monthLabelEl = $('editoriasMonthLabelText');
      if(monthLabelEl) monthLabelEl.textContent = monthLabelFromKey(editoriasMonthKey);

      // lista de editorias cadastradas — mesmo padrão visual/de edição das redes: modo de
      // visualização (bolinha colorida + nome) e, pelo lápis, modo de edição inline com
      // seletor de cor e renomear (o renome cascateia para as postagens existentes). O
      // agendamento (dias fixos + redes/tipos/formatos) abre num painel expansível à parte,
      // no mesmo padrão dos formatos de cada rede em "secRedes" — sempre referente ao mês
      // selecionado no navegador acima da lista.
      const list = $('editoriasList');
      if(list){
        list.innerHTML='';
        APP_SETTINGS.editorias.forEach(e=>{
          const row = document.createElement('div');
          row.className = 'net-row';
          // o chip da linha colapsada mostra o agendamento do mês selecionado no navegador
          // acima da lista — cada mês tem sua própria config (ver scheduleByMonth)
          const currentSchedule = (e.scheduleByMonth||{})[editoriasMonthKey];
          const hasCurrentSchedule = currentSchedule && (currentSchedule.channels||[]).length>0;
          const scheduleLabel = hasCurrentSchedule ? currentSchedule.weekdays.slice().sort().map(d=>WEEKDAY_ABBR[d]).join(', ') : '';
          const channelsLabel = hasCurrentSchedule ? currentSchedule.channels.map(c=>c.channel).join(', ') : '';
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
            (hasCurrentSchedule ? `<button type="button" class="chip ed-schedule-chip" style="font-size:11px" title="Repete em dias fixos neste mês — clique para ver/editar mês a mês">${UI_ICONS.calendar(12)} ${escapeHtml(scheduleLabel)} · ${escapeHtml(channelsLabel)}</button>` : '') +
            `<button type="button" class="btn ghost small ed-edit-toggle" aria-label="Editar editoria" title="Editar nome, cor e agendamento mês a mês">${UI_ICONS.edit(13)}</button>
              <button type="button" class="btn ghost small ed-more-btn" aria-label="Mais ações" title="Mais ações">${UI_ICONS.moreVertical(13)}</button>
            </div>
            <div class="net-row-formats">
              <div class="ed-schedule-editor" style="display:flex;flex-direction:column;gap:8px"></div>
              <div style="display:flex;justify-content:flex-end;gap:8px">
                <button type="button" class="btn ghost small ed-schedule-apply">Aplicar a este mês</button>
                <button type="button" class="btn small ed-schedule-save">Salvar</button>
              </div>
            </div>`;
          list.appendChild(row);
          if(editingEditoriaName === e.name) row.classList.add('editing');
          if(openEditoriaSchedule === e.name) row.classList.add('open');

          // o painel sempre mostra/edita o mês selecionado no navegador acima da lista
          // (editoriasMonthKey) — não tem navegação própria
          let schedEditor = null;
          if(openEditoriaSchedule === e.name){
            schedEditor = buildScheduleEditor(row.querySelector('.ed-schedule-editor'), (e.scheduleByMonth||{})[editoriasMonthKey] || null);
          }

          // salva o agendamento editado (do mês selecionado no navegador acima) e fecha a
          // edição (nome/cor + dias fixos/formatos, que abrem e fecham juntos) — se nada ficou
          // totalmente configurado (dia + rede + tipo + formato), remove o agendamento desse
          // mês específico em vez de salvar algo incompleto (os outros meses não são afetados)
          const saveBtn = row.querySelector('.ed-schedule-save');
          if(saveBtn) saveBtn.addEventListener('click', ()=>{
            const value = schedEditor ? schedEditor.getValue() : null;
            if(!value && schedEditor && schedEditor.isIncomplete()){ openScheduleWarning('Selecione ao menos um dia da semana e uma rede com tipo e formato definidos antes de salvar — ou desmarque tudo para remover o agendamento deste mês.'); return; }
            e.scheduleByMonth = e.scheduleByMonth || {};
            if(value) e.scheduleByMonth[editoriasMonthKey] = value; else delete e.scheduleByMonth[editoriasMonthKey];
            openEditoriaSchedule = null;
            editingEditoriaName = null;
            saveSettings(); renderAllDynamicUI(); render();
          });

          // "Aplicar a este mês": salva a config do mês selecionado no navegador acima da lista
          // e abre o modal com a lista de datas geradas por ela, pra revisar produto a produto
          // antes de efetivar (ver openApplyEditoriaModal) — não fecha o painel, útil pra
          // configurar vários meses em sequência (navegar, aplicar, navegar, aplicar)
          const applyBtn = row.querySelector('.ed-schedule-apply');
          if(applyBtn) applyBtn.addEventListener('click', ()=>{
            const value = schedEditor ? schedEditor.getValue() : null;
            if(!value){ alert('Marque ao menos um dia da semana e uma rede com tipo e formato antes de aplicar.'); return; }
            const [y,m] = editoriasMonthKey.split('-').map(Number);
            e.scheduleByMonth = e.scheduleByMonth || {};
            e.scheduleByMonth[editoriasMonthKey] = value;
            saveSettings();
            openApplyEditoriaModal(e.name, y, m-1);
          });

          // ícone de lápis: abre/fecha a edição completa da editoria (nome, cor e agendamento
          // mês a mês) — mesmo gatilho do chip de agendamento, quando ele existe
          row.querySelector('.ed-edit-toggle').addEventListener('click', ()=> toggleEditoriaEdit(e.name));
          const schedChip = row.querySelector('.ed-schedule-chip');
          if(schedChip) schedChip.addEventListener('click', ()=> toggleEditoriaEdit(e.name));

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

          // botão "⋮": só a ação de remover a editoria inteira — "Aplicar" agora mora dentro do
          // próprio painel de agendamento, junto do navegador de mês (ver ed-schedule-apply
          // acima), já que passou a ser uma ação por mês em vez de "o mês vigente"
          const moreBtn = row.querySelector('.ed-more-btn');
          moreBtn.addEventListener('click', (ev)=>{
            ev.stopPropagation();
            const menu = getEditoriaMenuEl();
            const wasOpenForThis = menu.classList.contains('open') && menu.dataset.forName===e.name;
            closeEditoriaMenu();
            if(wasOpenForThis) return;
            menu.dataset.forName = e.name;
            menu.innerHTML = `<button type="button" class="menu-remove danger">Remover editoria</button>`;
            menu.querySelector('.menu-remove').onclick = (ev2)=>{
              ev2.stopPropagation(); closeEditoriaMenu();
              if(!confirm(`Remover a editoria "${e.name}"? As postagens já criadas com ela não são apagadas, só deixam de ter essa categoria disponível pra reatribuir. Essa ação não pode ser desfeita com Ctrl+Z.`)) return;
              APP_SETTINGS.editorias = APP_SETTINGS.editorias.filter(x=>x.name!==e.name); saveSettings(); renderAllDynamicUI();
            };
            // linhas de editoria são baixas (~44px) — o menu abrindo pra baixo, colado no botão,
            // muitas vezes invade visualmente a linha seguinte (cobre o "⋮"/lápis dela, parecendo
            // "deslocado" da linha que na verdade o abriu). Se não sobrar espaço até a próxima
            // linha (ou até o fim da janela, na última linha), abre pra cima em vez de para baixo
            const rect = moreBtn.getBoundingClientRect();
            menu.classList.add('open');
            const menuHeight = menu.offsetHeight;
            const nextRow = row.nextElementSibling;
            const spaceBelow = (nextRow ? nextRow.getBoundingClientRect().top : window.innerHeight) - rect.bottom - 4;
            const top = spaceBelow < menuHeight ? (rect.top - menuHeight - 4) : (rect.bottom + 4);
            menu.style.top = `${Math.max(4, top)}px`;
            menu.style.left = `${Math.max(4, rect.right - 180)}px`;
          });
        });
      }
    }

    // ============================================================
    // MODAL "APLICAR EDITORIA AO MÊS" — revisão data a data (ativar/desativar + produto(s))
    // do agendamento fixo de uma editoria antes de gerar os cards. Aberto a partir do botão
    // "Aplicar a este mês" em Configurações → Editorias (ver renderEditoriasUI acima).
    // ============================================================
    let applyEditoriaState = null; // { editoriaName, year, month, rows:[{dateStr, active, products, postId}] }
    // true enquanto o modal de postagem estiver aberto a partir de uma linha deste modal — mostra
    // o botão "‹ Voltar" no cabeçalho e, ao fechar, ressincroniza a linha com o card editado
    let modalOpenedFromApplyEditoria = false;

    // datas do mês (year/month, month 0-based) em que o agendamento fixo da editoria publica,
    // ou null se a editoria não tiver agendamento configurado para esse mês
    function computeEditoriaScheduleDates(editoriaName, year, month){
      const editoria = APP_SETTINGS.editorias.find(x=>x.name===editoriaName);
      const monthKey = monthKeyFromDate(new Date(year, month, 1));
      const schedule = editoria && editoria.scheduleByMonth && editoria.scheduleByMonth[monthKey];
      if(!schedule || !(schedule.channels||[]).length) return null;
      const totalDays = new Date(year, month+1, 0).getDate();
      const dates = [];
      for(let d=1; d<=totalDays; d++){
        const date = new Date(year, month, d);
        if(!schedule.weekdays.includes(date.getDay())) continue;
        dates.push(`${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
      }
      return dates;
    }

    function openApplyEditoriaModal(editoriaName, year, month){
      const monthLabel = monthLabelFromKey(monthKeyFromDate(new Date(year, month, 1)));
      const dates = computeEditoriaScheduleDates(editoriaName, year, month);
      if(!dates){ alert(`Esta editoria não tem dias fixos configurados para ${monthLabel}.`); return; }
      if(dates.length===0){ alert(`Nenhuma data configurada para "${editoriaName}" em ${monthLabel}.`); return; }
      // uma data já com card dessa editoria (de uma aplicação anterior) chega pré-marcada com
      // os produtos que o card já tem, pra revisão em vez de perder o que já foi preenchido
      const rows = dates.map(dateStr=>{
        const existing = state.posts.find(p=> p.date===dateStr && (Array.isArray(p.editoria)?p.editoria:[p.editoria]).includes(editoriaName));
        return { dateStr, active: true, products: existing ? getPostProducts(existing).slice() : [], postId: existing ? existing.id : null };
      });
      applyEditoriaState = { editoriaName, year, month, rows };
      renderApplyEditoriaModal();
      $('applyEditoriaBackdrop').style.display = 'flex';
    }

    function closeApplyEditoriaModal(){
      $('applyEditoriaBackdrop').style.display = 'none';
      applyEditoriaState = null;
    }

    // aviso de agendamento incompleto (ver saveBtn em renderEditoriasUI) — modal simples da
    // própria aplicação em vez de alert() nativo do navegador, pra manter a identidade visual
    function openScheduleWarning(message){
      $('scheduleWarningMessage').textContent = message;
      $('scheduleWarningBackdrop').style.display = 'flex';
    }
    function closeScheduleWarning(){ $('scheduleWarningBackdrop').style.display = 'none'; }

    // garante que a linha tenha um card real (cria com os produtos já preenchidos na linha, se
    // ainda não existir um) — chamado pelo botão "Editar card", pra sempre abrir uma postagem
    // de verdade em vez de um formulário "solto"
    function ensurePostForRow(row){
      if(row.postId && state.posts.some(p=>p.id===row.postId)) return;
      const { editoriaName, year, month } = applyEditoriaState;
      const editoria = APP_SETTINGS.editorias.find(x=>x.name===editoriaName);
      const monthKey = monthKeyFromDate(new Date(year, month, 1));
      const schedule = editoria.scheduleByMonth[monthKey];
      const primary = schedule.channels[0];
      const channelsSnapshot = schedule.channels.map(c=>({ channel: c.channel, types: c.types.slice(), places: c.places.slice() }));
      const existing = state.posts.find(p=> p.date===row.dateStr && (Array.isArray(p.editoria)?p.editoria:[p.editoria]).includes(editoriaName));
      if(existing){ row.postId = existing.id; return; }
      const defaultStatus = (APP_SETTINGS.statuses[0] && APP_SETTINGS.statuses[0].name) || 'Rascunho';
      const p = {
        id: generateId(), title: editoriaName, date: row.dateStr,
        channel: primary.channel, place: primary.places.slice(), type: primary.types[0] || 'Static',
        channels: channelsSnapshot,
        status: defaultStatus, notes: '', collab: false, color: null, editoria: [editoriaName], products: row.products.slice(), order: nextOrderForDate(row.dateStr)
      };
      state.posts.push(p);
      saveState(); buildCalendar(); render();
      pushUndo({ type:'create', posts:[p.id] }); redoStack = [];
      row.postId = p.id;
    }

    // monta a lista de datas do modal — reconstruída inteira a cada chamada (mesmo padrão das
    // outras listas do app), preservando o que já estiver em applyEditoriaState.rows
    function renderApplyEditoriaModal(){
      if(!applyEditoriaState) return;
      const { editoriaName, year, month, rows } = applyEditoriaState;
      const monthLabel = monthLabelFromKey(monthKeyFromDate(new Date(year, month, 1)));
      $('applyEditoriaTitle').textContent = `Aplicar "${editoriaName}" — ${monthLabel}`;
      const list = $('applyEditoriaList'); if(!list) return;
      list.innerHTML = '';
      rows.forEach(row=>{
        const [y,m,d] = row.dateStr.split('-').map(Number);
        const dateLabel = new Date(y, m-1, d).toLocaleDateString('pt-BR', { weekday:'short', day:'2-digit', month:'2-digit' });
        const item = document.createElement('div');
        item.className = 'ae-row' + (row.active ? '' : ' ae-row-inactive');
        item.innerHTML = `
          <div class="ae-row-head">
            <label class="ae-row-check"><input type="checkbox" class="ae-active" ${row.active?'checked':''} /> <span class="ae-date-label">${escapeHtml(dateLabel)}</span></label>
            <button type="button" class="btn ghost small ae-edit-card">${row.postId ? 'Editar card' : 'Criar e editar card'} ${UI_ICONS.chevronRight(12)}</button>
          </div>
          <div class="ae-row-body">
            <label>Produto(s) desta data</label>
            <div class="autocomplete-wrap">
              <input type="text" class="ae-product-input" placeholder="Digite para buscar no catálogo Vonder..." autocomplete="off" />
              <div class="autocomplete-list ae-product-suggestions"></div>
            </div>
            <div class="selected-products ae-product-list"></div>
          </div>`;
        list.appendChild(item);

        item.querySelector('.ae-active').addEventListener('change', ev=>{ row.active = ev.target.checked; item.classList.toggle('ae-row-inactive', !row.active); });

        const chipsWrap = item.querySelector('.ae-product-list');
        function renderRowProducts(){
          chipsWrap.innerHTML = '';
          row.products.forEach((p, idx)=>{
            const chip = document.createElement('span'); chip.className = 'product-chip';
            const img = p.code ? `<img src="${productImageUrl(p.code)}" alt="" referrerpolicy="no-referrer" onerror="this.style.display='none'" />` : '';
            chip.innerHTML = `${img}<div class="pc-body"><span class="pc-name">${escapeHtml(p.name)}</span>${p.code?`<span class="pc-code">${escapeHtml(p.code)}</span>`:''}</div><button type="button" class="pc-remove" aria-label="Remover produto">${UI_ICONS.x(12)}</button>`;
            chip.querySelector('.pc-remove').addEventListener('click', ()=>{ row.products.splice(idx,1); renderRowProducts(); });
            chipsWrap.appendChild(chip);
          });
        }
        renderRowProducts();

        const input = item.querySelector('.ae-product-input');
        const sugg = item.querySelector('.ae-product-suggestions');
        function hideSugg(){ sugg.style.display='none'; sugg.innerHTML=''; }
        function showSugg(query){
          const q = normalizeStr(query.trim());
          if(q.length<2){ hideSugg(); return; }
          const qCode = normalizeCode(query.trim());
          const matches = productCandidates().filter(cand=>
            !row.products.some(p=> cand.code ? p.code===cand.code : p.name===cand.name) &&
            (normalizeStr(cand.name).includes(q) || (cand.code && (normalizeStr(cand.code).includes(q) || normalizeCode(cand.code).includes(qCode))))
          ).sort((a,b)=> productMatchRank(a,q,qCode) - productMatchRank(b,q,qCode));
          if(matches.length===0){
            sugg.innerHTML = `<div class="autocomplete-item ac-manual"><span class="ac-name">+ Adicionar "${escapeHtml(query.trim())}" (sem catálogo)</span></div>`;
            sugg.querySelector('.ac-manual').addEventListener('mousedown', ev=>{ ev.preventDefault(); row.products.push({ code:'', name: query.trim() }); input.value=''; hideSugg(); renderRowProducts(); input.focus(); });
            sugg.style.display = 'block';
            return;
          }
          sugg.innerHTML = matches.map((mch,i)=>`<div class="autocomplete-item" data-idx="${i}"><img src="${productImageUrl(mch.code)}" alt="" referrerpolicy="no-referrer" onerror="this.style.visibility='hidden'" /><span class="ac-name">${escapeHtml(mch.name)}</span><span class="ac-code">${escapeHtml(mch.code)}</span></div>`).join('');
          sugg.querySelectorAll('.autocomplete-item[data-idx]').forEach(el=> el.addEventListener('mousedown', ev=>{
            ev.preventDefault();
            const mch = matches[Number(el.dataset.idx)];
            row.products.push({ code: mch.code||'', name: mch.name });
            input.value=''; hideSugg(); renderRowProducts(); input.focus();
          }));
          sugg.style.display = 'block';
        }
        input.addEventListener('input', ev=> showSugg(ev.target.value));
        input.addEventListener('focus', ev=>{ if(ev.target.value.trim().length>=2) showSugg(ev.target.value); });
        input.addEventListener('blur', ()=> setTimeout(hideSugg, 150));

        // "Editar card": garante que a data já tenha um card real e abre o modal de postagem
        // por cima deste (sem fechá-lo) — ao fechar o modal de postagem, esta lista reaparece
        // automaticamente por baixo, já ressincronizada com o que foi editado lá
        item.querySelector('.ae-edit-card').addEventListener('click', ()=>{
          ensurePostForRow(row);
          openEditModal(row.postId);
          modalOpenedFromApplyEditoria = true;
          if($('modalBackBtn')) $('modalBackBtn').style.display = 'flex';
        });
      });
    }

    // efetiva a aplicação: cria (ou atualiza, se já existir) um card por data marcada como
    // ativa, com o(s) produto(s) preenchidos naquela linha — mesma lógica de distribuição por
    // rede/tipo/formato do agendamento usada em ensurePostForRow
    function confirmApplyEditoriaModal(){
      if(!applyEditoriaState) return;
      const { editoriaName, year, month, rows } = applyEditoriaState;
      const activeRows = rows.filter(r=>r.active);
      if(activeRows.length===0){ alert('Marque ao menos uma data para aplicar.'); return; }
      const editoria = APP_SETTINGS.editorias.find(x=>x.name===editoriaName);
      const monthKey = monthKeyFromDate(new Date(year, month, 1));
      const monthLabel = monthLabelFromKey(monthKey);
      const schedule = editoria && editoria.scheduleByMonth && editoria.scheduleByMonth[monthKey];
      if(!schedule || !(schedule.channels||[]).length){ alert(`Esta editoria não tem dias fixos configurados para ${monthLabel}.`); return; }
      const primary = schedule.channels[0];
      const channelsSnapshot = schedule.channels.map(c=>({ channel: c.channel, types: c.types.slice(), places: c.places.slice() }));
      const defaultStatus = (APP_SETTINGS.statuses[0] && APP_SETTINGS.statuses[0].name) || 'Rascunho';
      const created = [];
      const updatedBefore = [];
      activeRows.forEach(row=>{
        const existing = (row.postId && state.posts.find(p=>p.id===row.postId))
          || state.posts.find(p=> p.date===row.dateStr && (Array.isArray(p.editoria)?p.editoria:[p.editoria]).includes(editoriaName));
        if(existing){
          updatedBefore.push({ id: existing.id, channel: existing.channel, place: existing.place, type: existing.type, channels: existing.channels, products: existing.products });
          existing.channel = primary.channel; existing.place = primary.places.slice(); existing.type = primary.types[0] || 'Static';
          existing.channels = channelsSnapshot.map(c=>Object.assign({},c));
          existing.products = row.products.slice();
          if(!Array.isArray(existing.editoria)) existing.editoria = [editoriaName];
          else if(!existing.editoria.includes(editoriaName)) existing.editoria.push(editoriaName);
          return;
        }
        const p = {
          id: generateId(), title: editoriaName, date: row.dateStr,
          channel: primary.channel, place: primary.places.slice(), type: primary.types[0] || 'Static',
          channels: channelsSnapshot.map(c=>Object.assign({},c)),
          status: defaultStatus, notes: '', collab: false, color: null, editoria: [editoriaName], products: row.products.slice(), order: nextOrderForDate(row.dateStr)
        };
        state.posts.push(p);
        created.push(p);
      });
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
        alert(`"${editoriaName}" em ${monthLabel}: ${parts.join(', ')}.`);
      }
      closeApplyEditoriaModal();
    }

    // preenche o filtro de Formato (união de todos os formatos de todas as redes) e o filtro de Tipo (fixo)
    function renderPlacesUI(){
      const fc = $('filterPlacesContainer'); if(fc){ fc.innerHTML=''; allFormatNames().forEach(p=>{ const lbl=document.createElement('label'); lbl.className='chip'; lbl.innerHTML=`<input type="checkbox" class="fPlace" value="${escapeHtml(p)}"/>${formatIcon(p)} ${escapeHtml(p)}`; fc.appendChild(lbl); }); }
      // tipos (Estático/Vídeo) são fixos — só preenche o container de filtro
      const ft = $('filterTypesContainer'); if(ft){ ft.innerHTML=''; ['Static','Video'].forEach(ti=>{ const lbl = document.createElement('label'); lbl.className='chip'; lbl.innerHTML = `<input type="checkbox" class="fType" value="${ti}"/>${TYPE_ICONS[ti]} ${ti==='Static'?'Estático':'Vídeo'}`; ft.appendChild(lbl); }); }
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
            lbl.innerHTML = `<input type="checkbox" name="mPlace" value="${escapeHtml(f.name)}" ${prevChecked.includes(f.name)?'checked':''} /><span class="format-chip-icon">${formatIcon(f.name)}</span><span class="format-chip-body"><span class="format-chip-name">${escapeHtml(f.name)}</span>${dims?`<span class="format-chip-dims">${dims}</span>`:''}</span>`;
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
      const list = $('statusesList'); if(list){ list.innerHTML=''; APP_SETTINGS.statuses.forEach(s=>{ const chip=document.createElement('span'); chip.className='chip'; chip.style.display='inline-flex'; chip.innerHTML = `<span class="dot" style="background:${s.color}"></span>${escapeHtml(s.name)} <button class="btn ghost small" data-status="${escapeHtml(s.name)}" style="margin-left:8px" aria-label="Remover status">${UI_ICONS.x(13)}</button>`; list.appendChild(chip); }); list.querySelectorAll('button[data-status]').forEach(bt=> bt.addEventListener('click', ()=>{ const v=bt.dataset.status; APP_SETTINGS.statuses = APP_SETTINGS.statuses.filter(x=>x.name!==v); saveSettings(); renderAllDynamicUI(); })); }
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

    // datas comemorativas personalizadas (ex: aniversário da empresa, um evento específico) —
    // "todo ano" repete pelo dia/mês (ignora o ano cadastrado); sem marcar, vale só para a data exata
    function renderCustomDatesUI(){
      const list = $('customDatesList'); if(!list) return;
      list.innerHTML = '';
      const items = (APP_SETTINGS.customDates||[]).slice().sort((a,b)=> a.date.slice(5).localeCompare(b.date.slice(5)));
      if(!items.length){ list.innerHTML = `<div style="font-size:12px;color:var(--text-faint);padding:6px 2px">Nenhuma data personalizada cadastrada ainda.</div>`; return; }
      items.forEach(item=>{
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 8px;border:1px solid var(--border);border-radius:8px;font-size:12px';
        const [y,m,d] = item.date.split('-').map(Number);
        const dateLabel = item.recurring
          ? new Date(2000,m-1,d).toLocaleDateString('pt-BR',{day:'2-digit',month:'long'})
          : new Date(y,m-1,d).toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'});
        row.innerHTML = `<span style="flex:1;font-weight:700;color:var(--text)">${escapeHtml(item.name)}</span><span style="color:var(--muted);white-space:nowrap">${dateLabel}${item.recurring?' · todo ano':''}</span><button class="btn ghost small" data-custom-date="${item.id}" aria-label="Remover data">${UI_ICONS.x(13)}</button>`;
        list.appendChild(row);
      });
      list.querySelectorAll('button[data-custom-date]').forEach(bt=> bt.addEventListener('click', ()=>{
        const v = bt.dataset.customDate;
        APP_SETTINGS.customDates = (APP_SETTINGS.customDates||[]).filter(x=>x.id!==v);
        saveSettings(); renderCustomDatesUI(); renderCommemorativeDatesYearList();
      }));
    }

    // todas as datas comemorativas (fixas + móveis + personalizadas) já reconhecidas pelo
    // calendário num ano específico, em ordem cronológica — cada entrada agrupa os nomes de
    // todas as datas que caem naquele mesmo dia (ex: um evento cadastrado no mesmo dia de um feriado)
    function allCommemorativeDatesForYear(year){
      const byDate = {};
      const add = (dateStr, name)=>{ (byDate[dateStr] = byDate[dateStr] || []).push(name); };
      Object.keys(FIXED_COMMEMORATIVE_DATES).forEach(mmdd=> add(`${year}-${mmdd}`, FIXED_COMMEMORATIVE_DATES[mmdd]));
      const movable = movableCommemorativeDates(year);
      Object.keys(movable).forEach(dateStr=> add(dateStr, movable[dateStr]));
      (APP_SETTINGS.customDates||[]).forEach(c=>{
        if(c.recurring) add(`${year}-${c.date.slice(5)}`, c.name);
        else if(c.date.slice(0,4)===String(year)) add(c.date, c.name);
      });
      return Object.keys(byDate).sort().map(dateStr=> ({ dateStr, names: byDate[dateStr] }));
    }

    // ano atualmente selecionado no filtro de "Todas as datas cadastradas" — inicia no ano
    // do mês exibido no calendário, pra já abrir mostrando o ano relevante
    let commemorativeListYear = null;
    function renderCommemorativeDatesYearList(){
      const sel = $('commemorativeYearSelect');
      const list = $('allCommemorativeDatesList');
      if(!sel || !list) return;
      if(commemorativeListYear===null) commemorativeListYear = viewDate.getFullYear();
      if(!sel.options.length){
        const base = new Date().getFullYear();
        for(let y=base-1; y<=base+4; y++){
          const opt = document.createElement('option'); opt.value = String(y); opt.textContent = String(y);
          sel.appendChild(opt);
        }
      }
      // garante uma opção pro ano selecionado mesmo se estiver fora do intervalo padrão
      // (ex: navegou o calendário pra um ano bem no futuro/passado antes de abrir Configurações)
      if(!Array.from(sel.options).some(o=> o.value===String(commemorativeListYear))){
        const opt = document.createElement('option'); opt.value = String(commemorativeListYear); opt.textContent = String(commemorativeListYear);
        sel.appendChild(opt);
        Array.from(sel.options).sort((a,b)=> Number(a.value)-Number(b.value)).forEach(o=> sel.appendChild(o));
      }
      sel.value = String(commemorativeListYear);
      list.innerHTML = '';
      const items = allCommemorativeDatesForYear(commemorativeListYear);
      if(!items.length){ list.innerHTML = `<div style="font-size:12px;color:var(--text-faint);padding:8px">Nenhuma data neste ano.</div>`; return; }
      items.forEach(({dateStr, names})=>{
        const [y,m,d] = dateStr.split('-').map(Number);
        const label = new Date(y,m-1,d).toLocaleDateString('pt-BR',{day:'2-digit',month:'short',weekday:'short'}).replace(/\./g,'');
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:6px 10px;border-bottom:1px solid var(--border);font-size:12px';
        row.innerHTML = `<span style="color:var(--muted);min-width:90px;flex-shrink:0;text-transform:capitalize">${label}</span><span style="flex:1;color:var(--text)">${escapeHtml(names.join(' · '))}</span>`;
        list.appendChild(row);
      });
      list.lastChild.style.borderBottom = 'none';
    }
    if($('commemorativeYearSelect')) $('commemorativeYearSelect').addEventListener('change', (ev)=>{
      commemorativeListYear = Number(ev.target.value);
      renderCommemorativeDatesYearList();
    });

    // reconstrói toda a UI dependente das configurações, de uma vez
    function renderAllDynamicUI(){ renderTabs(); renderNetsUI(); renderEditoriasUI(); renderPlacesUI(); renderStatusUI(); renderCatalogUI(); renderCustomDatesUI(); renderCommemorativeDatesYearList(); }

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
      $('sVideoWeeklyTarget').value = APP_SETTINGS.videoWeeklyTarget;
      // o navegador de mês de Editorias sempre abre sincronizado com o mês que o calendário
      // está exibindo no momento (viewDate) — nunca com o mês de uma sessão anterior do
      // modal, nem com o mês atual do relógio; dali em diante (com o modal já aberto) o
      // usuário pode navegar livremente pelas próprias setas, ver editoriasMonthKey
      editoriasMonthKey = monthKeyFromDate(viewDate);
      // reconstrói a lista de editorias antes de abrir (cobre qualquer mudança vinda de outra
      // aba/sincronização enquanto o modal estava fechado)
      renderEditoriasUI();
      $('settingsBackdrop').style.display = 'flex';
    }

    function closeSettings(){ closeAllIconPickers(); closeEditoriaMenu(); closeEditoriasMonthPicker(); $('settingsBackdrop').style.display = 'none'; }

    function saveSettingsHandler(){
      TARGET = parseInt($('sTarget').value,10) || TARGET;
      APP_SETTINGS.videoWeeklyTarget = Math.max(0, parseInt($('sVideoWeeklyTarget').value,10) || 0);
      saveSettings(); buildCalendar(); render(); closeSettings();
    }

    // ============================================================
    // EDIÇÃO DE POSTAGEM EXISTENTE — abre o modal já preenchido
    // com os dados do post clicado no calendário/lista
    // ============================================================
    function openEditModal(id){
      const post = state.posts.find(p=>p.id===id); if(!post) return;
      modalOpenedFromApplyEditoria = false;
      if($('modalBackBtn')) $('modalBackBtn').style.display = 'none';
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
      editingReferenceImages = Array.isArray(post.referenceImages) ? post.referenceImages.slice() : [];
      renderReferenceImages();
      if($('mNoProduct')) $('mNoProduct').checked = !!post.noProduct;
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
      renderIntelValidation(null);
      $('modalBackdrop').style.display = 'flex';
      setGuidedPostStep(1);
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
    $('openAdd').addEventListener('click', ()=>{ closeEditState(); openModal(); });
    $('openSettings').addEventListener('click', openSettings);
    $('cancelSettings').addEventListener('click', closeSettings);
    $('saveSettings').addEventListener('click', saveSettingsHandler);
    $('cancelModal').addEventListener('click', closeModal);
    $('saveModal').addEventListener('click', saveModal);
    // as setas ‹ › navegam mês (padrão) ou ano (quando o popover de mês está aberto) — o
    // stopPropagation() no caso do popover aberto é necessário: sem ele, o clique borbulha até
    // o document.addEventListener('click', closeMonthYearPicker) logo abaixo e fecha o popover
    // no mesmo clique em que o ano acabou de mudar, antes do usuário conseguir ver o resultado
    document.getElementById('prevMonth').addEventListener('click', (ev)=>{
      if($('monthYearPicker').classList.contains('open')){ ev.stopPropagation(); stepPickerYear(-1); return; }
      if(currentView==='week'){ viewDate.setDate(viewDate.getDate()-7); updateMonthLabelText(); render(); return; }
      if(currentView==='biweek'){ stepFortnight(-1); buildCalendar(); render(); return; }
      viewDate.setMonth(viewDate.getMonth()-1); buildCalendar(); render();
    });
    document.getElementById('nextMonth').addEventListener('click', (ev)=>{
      if($('monthYearPicker').classList.contains('open')){ ev.stopPropagation(); stepPickerYear(1); return; }
      if(currentView==='week'){ viewDate.setDate(viewDate.getDate()+7); updateMonthLabelText(); render(); return; }
      if(currentView==='biweek'){ stepFortnight(1); buildCalendar(); render(); return; }
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
    if($('addCustomDateBtn')) $('addCustomDateBtn').addEventListener('click', ()=>{
      const name = $('newCustomDateName').value.trim();
      const date = $('newCustomDateInput').value;
      if(!name){ alert('Digite o nome da data.'); return; }
      if(!date){ alert('Escolha uma data.'); return; }
      const recurring = $('newCustomDateRecurring').checked;
      APP_SETTINGS.customDates = APP_SETTINGS.customDates || [];
      APP_SETTINGS.customDates.push({ id: generateId(), name, date, recurring });
      $('newCustomDateName').value=''; $('newCustomDateInput').value=''; $('newCustomDateRecurring').checked = true;
      saveSettings(); renderCustomDatesUI();
    });
    if($('mTitle')) $('mTitle').addEventListener('input', refreshModalDynamic);
    if($('mDate')) $('mDate').addEventListener('input', refreshModalDynamic);
    if($('mArtsLink')) $('mArtsLink').addEventListener('input', refreshModalDynamic);
    if($('mReferencesLink')) $('mReferencesLink').addEventListener('input', refreshModalDynamic);
    // ============================================================
    // IMAGENS DE REFERÊNCIA (campo "Referências salvas em:") — upload local, redimensionado e
    // recomprimido em JPEG no próprio navegador (canvas), pra não inflar demais o payload
    // sincronizado com o servidor (state.posts inteiro vai num único JSON a cada salvamento).
    // As miniaturas refletem na pré-visualização do briefing (bpImagesRow) e são embutidas de
    // verdade no .docx exportado (docxEmbedImage).
    // ============================================================
    function readImageFileCompressed(file){
      return new Promise((resolve, reject)=>{
        const reader = new FileReader();
        reader.onerror = ()=> reject(reader.error);
        reader.onload = ()=>{
          const img = new Image();
          img.onerror = ()=> reject(new Error('Não foi possível ler a imagem'));
          img.onload = ()=>{
            const MAX_W = 1000;
            const scale = Math.min(1, MAX_W / img.naturalWidth);
            const w = Math.max(1, Math.round(img.naturalWidth * scale));
            const h = Math.max(1, Math.round(img.naturalHeight * scale));
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            resolve({ id: generateId(), name: file.name, width: w, height: h, dataUrl: canvas.toDataURL('image/jpeg', 0.82) });
          };
          img.src = reader.result;
        };
        reader.readAsDataURL(file);
      });
    }
    function renderReferenceImages(){
      const wrap = $('mReferenceImagesList'); if(!wrap) return;
      wrap.innerHTML = editingReferenceImages.map(img=>
        `<div class="ref-image-thumb"><img src="${img.dataUrl}" alt="${escapeHtml(img.name||'')}" /><button type="button" class="ref-image-remove" data-id="${img.id}" aria-label="Remover imagem" title="Remover imagem">${UI_ICONS.x(11)}</button></div>`
      ).join('');
    }
    if($('mReferenceImagesBtn') && $('mReferenceImagesInput')){
      $('mReferenceImagesBtn').addEventListener('click', ()=> $('mReferenceImagesInput').click());
      $('mReferenceImagesInput').addEventListener('change', async (ev)=>{
        const files = Array.from(ev.target.files||[]).filter(f=> f.type.startsWith('image/'));
        for(const file of files){
          try{ editingReferenceImages.push(await readImageFileCompressed(file)); }
          catch(e){ /* arquivo ilegível como imagem — ignora e segue com os demais */ }
        }
        ev.target.value = '';
        renderReferenceImages();
        refreshModalDynamic();
      });
    }
    if($('mReferenceImagesList')) $('mReferenceImagesList').addEventListener('click', ev=>{
      const btn = ev.target.closest('.ref-image-remove'); if(!btn) return;
      editingReferenceImages = editingReferenceImages.filter(img=> img.id!==btn.dataset.id);
      renderReferenceImages();
      refreshModalDynamic();
    });
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
    // EXPORTAÇÃO DE BRIEFING EM .DOCX — junta o briefing de todas as postagens num único
    // Word, agrupado por data (ordem cronológica, uma página por data) e, dentro de cada data,
    // na mesma ordem manual do calendário. Sem nenhuma lib externa: um .docx é só um zip com
    // XMLs dentro (OOXML WordprocessingML) — o empacotador de zip abaixo é o mesmo escrito à
    // mão que o Editor de Posts usa pro pacote Feed+Story (post-editor.js/makeZip), só que
    // como cópia independente aqui (cada arquivo do projeto é autocontido, sem módulo
    // compartilhado — mesmo padrão do resto do app).
    // ============================================================
    const DOCX_CRC_TABLE = (()=>{ const t=[]; for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1); t[n]=c>>>0; } return t; })();
    function docxZipCrc(bytes){ let crc=0xffffffff; for(let i=0;i<bytes.length;i++) crc=DOCX_CRC_TABLE[(crc^bytes[i])&255]^(crc>>>8); return (crc^0xffffffff)>>>0; }
    function docxZipHeader(size){ const bytes=new Uint8Array(size), view=new DataView(bytes.buffer); return { bytes, u16:(o,v)=>view.setUint16(o,v,true), u32:(o,v)=>view.setUint32(o,v>>>0,true) }; }
    function docxZipDate(){ const d=new Date(), year=Math.max(1980,d.getFullYear()); return { time:(d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1), date:((year-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate() }; }
    // monta um .zip "stored" (sem compressão, mais simples e suficiente pro tamanho de um
    // briefing em texto) a partir de {name, data:Uint8Array}[] — mesma mecânica de central
    // directory/end-of-central-directory de post-editor.js/makeZip
    function makeStoredZip(files, mimeType){
      const encoder = new TextEncoder(), stamp = docxZipDate(), locals=[], centrals=[];
      let offset = 0;
      files.forEach(file=>{
        const name = encoder.encode(file.name), data = file.data, crc = docxZipCrc(data);
        const local = docxZipHeader(30);
        local.u32(0,0x04034b50); local.u16(4,20); local.u16(6,0x800); local.u16(8,0);
        local.u16(10,stamp.time); local.u16(12,stamp.date); local.u32(14,crc);
        local.u32(18,data.length); local.u32(22,data.length); local.u16(26,name.length); local.u16(28,0);
        locals.push(local.bytes, name, data);
        const central = docxZipHeader(46);
        central.u32(0,0x02014b50); central.u16(4,20); central.u16(6,20); central.u16(8,0x800); central.u16(10,0);
        central.u16(12,stamp.time); central.u16(14,stamp.date); central.u32(16,crc);
        central.u32(20,data.length); central.u32(24,data.length); central.u16(28,name.length);
        central.u16(30,0); central.u16(32,0); central.u16(34,0); central.u16(36,0); central.u32(38,0); central.u32(42,offset);
        centrals.push(central.bytes, name);
        offset += 30 + name.length + data.length;
      });
      const centralSize = centrals.reduce((total,part)=> total+part.length, 0);
      const end = docxZipHeader(22);
      end.u32(0,0x06054b50); end.u16(4,0); end.u16(6,0); end.u16(8,files.length); end.u16(10,files.length);
      end.u32(12,centralSize); end.u32(16,offset); end.u16(20,0);
      return new Blob(locals.concat(centrals,[end.bytes]), { type: mimeType });
    }

    // escapa texto pra dentro de um elemento XML (não é usado dentro de atributos aqui)
    function escapeXml(s){ return String(s==null?'':s).replace(/[&<>]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
    // resolve o texto de um campo de link/local pra um href utilizável (pelo hyperlink do
    // .docx e pela pré-visualização no navegador): URLs com protocolo passam direto, caminhos
    // de rede (\\servidor\pasta) e caminhos locais (C:\pasta) viram URIs file://, e qualquer
    // outro texto é tratado como domínio/URL sem protocolo (ex: "drive.google.com/...")
    function resolveLinkHref(raw){
      const v = String(raw==null?'':raw).trim();
      if(!v) return '';
      if(/^(https?|ftp|file):\/\//i.test(v)) return v;
      if(/^\\\\/.test(v)) return 'file:' + v.replace(/\\/g,'/');
      if(/^[a-zA-Z]:[\\/]/.test(v)) return 'file:///' + v.replace(/\\/g,'/');
      return 'https://' + v.replace(/^\/+/, '');
    }
    // fonte padrão do documento inteiro: Calibri 11pt (w:sz em meios-ponto, 22 = 11pt) — todo
    // docxRun/docxHyperlinkRun usa este mesmo tamanho, exceto onde explicitamente sobrescrito
    const DOCX_RFONTS = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>';
    // um <w:r> (run) com o texto formatado; quebras de linha internas viram <w:br/>, não parágrafos novos
    function docxRun(text, opts){
      opts = opts || {};
      const props = [DOCX_RFONTS, `<w:sz w:val="${opts.size||22}"/><w:szCs w:val="${opts.size||22}"/>`];
      if(opts.bold) props.push('<w:b/><w:bCs/>');
      if(opts.underline) props.push('<w:u w:val="single"/>');
      if(opts.color) props.push(`<w:color w:val="${opts.color}"/>`);
      if(opts.highlight) props.push(`<w:highlight w:val="${opts.highlight}"/>`);
      const lines = String(text==null?'':text).split('\n');
      const body = lines.map((line,i)=> (i?'<w:br/>':'') + `<w:t xml:space="preserve">${escapeXml(line)}</w:t>`).join('');
      return `<w:r><w:rPr>${props.join('')}</w:rPr>${body}</w:r>`;
    }
    // próximo r:id livre da lista de relacionamentos do document.xml (compartilhada entre
    // hyperlinks e imagens embutidas de uma mesma exportação — precisa ser único no arquivo)
    function nextDocxRelId(assets){ return 'rId' + (assets.rels.length + 1); }
    // um <w:hyperlink> (link ou local salvo, ex: "Salvar em", "Referências salvas em", "Imagem")
    // com a aparência padrão de link do Word (azul sublinhado); registra o relacionamento
    // externo em assets.rels, resolvido depois em docxDocumentRelsXml
    function docxHyperlinkRun(text, href, assets){
      const url = resolveLinkHref(href);
      if(!url) return docxRun(text);
      const id = nextDocxRelId(assets);
      assets.rels.push({ id, type:'hyperlink', target: url });
      const props = [DOCX_RFONTS, '<w:sz w:val="22"/><w:szCs w:val="22"/>', '<w:color w:val="0563C1"/>', '<w:u w:val="single"/>'];
      const lines = String(text==null?'':text).split('\n');
      const body = lines.map((line,i)=> (i?'<w:br/>':'') + `<w:t xml:space="preserve">${escapeXml(line)}</w:t>`).join('');
      return `<w:hyperlink r:id="${id}" w:history="1"><w:r><w:rPr>${props.join('')}</w:rPr>${body}</w:r></w:hyperlink>`;
    }
    // decodifica uma dataURL (base64) em bytes, pra gravar como mídia dentro do .docx
    function dataUrlToBytes(dataUrl){
      const idx = String(dataUrl||'').indexOf(',');
      const b64 = idx>=0 ? dataUrl.slice(idx+1) : dataUrl;
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for(let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
      return bytes;
    }
    // parágrafo com uma imagem de referência embutida (inline), em tamanho fixo de exibição
    // (respeitando a proporção original e sem ampliar imagens pequenas); grava o binário em
    // assets.media e o relacionamento em assets.rels
    function docxEmbedImage(img, assets){
      const bytes = dataUrlToBytes(img.dataUrl);
      const mediaIndex = assets.media.length + 1;
      const mediaName = `media/image${mediaIndex}.jpg`;
      assets.media.push({ name: mediaName, data: bytes });
      const id = nextDocxRelId(assets);
      assets.rels.push({ id, type:'image', target: mediaName });
      const widthPx = img.width || 800, heightPx = img.height || 600;
      const maxWidthEmu = 3600000; // ~9,4cm
      const cx = Math.min(maxWidthEmu, Math.round(widthPx * 9525));
      const cy = Math.round(cx * (heightPx / widthPx));
      const picId = mediaIndex + 100;
      const safeName = escapeXml(img.name || `imagem-${mediaIndex}`);
      const drawing = `<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">`+
        `<wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>`+
        `<wp:docPr id="${picId}" name="${safeName}"/>`+
        `<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>`+
        `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">`+
        `<pic:pic><pic:nvPicPr><pic:cNvPr id="${picId}" name="${safeName}"/><pic:cNvPicPr/></pic:nvPicPr>`+
        `<pic:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`+
        `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>`+
        `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>`;
      return `<w:p><w:pPr><w:spacing w:after="120"/></w:pPr><w:r>${drawing}</w:r></w:p>`;
    }
    function docxParagraph(runsXml, pPrExtraXml){
      return `<w:p>${pPrExtraXml?`<w:pPr>${pPrExtraXml}</w:pPr>`:''}${runsXml}</w:p>`;
    }
    // parágrafo vazio com só uma linha fina embaixo — a versão em Word do BRIEFING_SEPARATOR
    function docxRuleParagraph(){
      return `<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="C9C9C9"/></w:pBdr><w:spacing w:after="200"/></w:pPr></w:p>`;
    }
    // cabeçalho de cada data agrupada (equivalente ao BRIEFING_DATE_SEPARATOR do .txt): uma
    // linha em destaque com borda dupla embaixo; cada data (exceto a primeira) começa em página nova
    function docxDateHeadingXml(dateLabel, pageBreakBefore){
      const pPr = (pageBreakBefore?'<w:pageBreakBefore/>':'') + '<w:pBdr><w:bottom w:val="double" w:sz="6" w:space="4" w:color="1A1A1A"/></w:pBdr><w:spacing w:after="220"/>';
      return docxParagraph(docxRun(dateLabel.toUpperCase(), { bold:true }), pPr);
    }
    // parágrafos de uma postagem — mesmos campos e ordem de buildBriefingPlainLines (Título,
    // Publicação prevista para, Formatos, Salvar em, Referências salvas em, Produto(s),
    // Imagem, Observações e Conteúdo), só que como XML do Word em vez de texto puro. `assets`
    // acumula os relacionamentos (hyperlinks/imagens) e a mídia embutida de toda a exportação.
    // Título em maiúsculas, negrito, sublinhado e com destaque em amarelo; links preenchidos
    // (Salvar em, Referências salvas em, Imagem) viram hyperlinks de verdade.
    function buildPostBriefingDocxXml(post, assets){
      const f = computePostBriefingFields(post);
      const hasMeta = f.dateLabel || f.hasFormats || f.artsLink || f.referencesLink || f.productItems.length || f.imageLink || f.imageNotes || f.referenceImages.length;
      let xml = '';
      if(f.title){
        // linha divisória embutida no próprio parágrafo do título (borda inferior), em vez de
        // um parágrafo vazio separado — evita pular uma linha em branco entre título e metadados
        const titleBorder = hasMeta ? '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="4" w:color="C9C9C9"/></w:pBdr>' : '';
        xml += docxParagraph(docxRun(f.title.toUpperCase(), { bold:true, underline:true, highlight:'yellow' }), titleBorder + '<w:spacing w:after="120"/>');
      }
      if(f.dateLabel) xml += docxParagraph(docxRun('Publicação prevista para ', { bold:true }) + docxRun(f.dateLabel), '<w:spacing w:after="80"/>');
      if(f.hasFormats) xml += docxParagraph(docxRun('Formatos: ', { bold:true }) + docxRun(f.formatsText), '<w:spacing w:after="80"/>');
      if(f.artsLink) xml += docxParagraph(docxRun('Salvar em: ', { bold:true }) + docxHyperlinkRun(f.artsLink, f.artsLink, assets), '<w:spacing w:after="80"/>');
      if(f.referencesLink) xml += docxParagraph(docxRun('Referências salvas em: ', { bold:true }) + docxHyperlinkRun(f.referencesLink, f.referencesLink, assets), '<w:spacing w:after="80"/>');
      if(f.productItems.length){
        xml += docxParagraph(docxRun('Produto(s):', { bold:true }), '<w:spacing w:after="40"/>');
        f.productItems.forEach(item=>{ xml += docxParagraph(docxRun('•  '+item), '<w:ind w:left="260"/><w:spacing w:after="40"/>'); });
      }
      if(f.imageLink) xml += docxParagraph(docxRun('Imagem: ', { bold:true }) + docxHyperlinkRun(f.imageLink, f.imageLink, assets), '<w:spacing w:after="80"/>');
      if(f.imageNotes) xml += docxParagraph(docxRun('Observações: ', { bold:true }) + docxRun(f.imageNotes), '<w:spacing w:after="80"/>');
      if(f.referenceImages.length){
        xml += docxParagraph(docxRun('Imagens de referência:', { bold:true }), '<w:spacing w:after="80"/>');
        f.referenceImages.forEach(img=>{ xml += docxEmbedImage(img, assets); });
      }
      if(f.content){
        if(xml) xml += docxRuleParagraph();
        xml += docxParagraph(docxRun('Conteúdo:', { bold:true }), '<w:spacing w:after="80"/>');
        xml += docxParagraph(docxRun(f.content), '<w:spacing w:after="80"/>');
      }
      // respiro extra no fim de cada postagem, pra separar da próxima dentro do mesmo dia
      xml += '<w:p><w:pPr><w:spacing w:after="200"/></w:pPr></w:p>';
      return xml;
    }
    function docxDocumentXml(bodyXml){
      return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`+
        `<w:document `+
        `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" `+
        `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" `+
        `xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" `+
        `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" `+
        `xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${bodyXml}`+
        `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1417" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>`+
        `</w:body></w:document>`;
    }
    // Relationships do word/document.xml — um por hyperlink (externo) ou imagem embutida
    function docxDocumentRelsXml(rels){
      const items = rels.map(r=>{
        const type = r.type==='hyperlink'
          ? 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink'
          : 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';
        const targetMode = r.type==='hyperlink' ? ' TargetMode="External"' : '';
        return `<Relationship Id="${r.id}" Type="${type}" Target="${escapeXml(r.target)}"${targetMode}/>`;
      }).join('');
      return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`+
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items}</Relationships>`;
    }
    // `assets` (opcional) traz { rels, media } acumulados por buildPostBriefingDocxXml/
    // docxHyperlinkRun/docxEmbedImage: os hyperlinks e as imagens de referência embutidas
    function makeBriefingDocx(bodyXml, assets){
      assets = assets || { rels: [], media: [] };
      const now = new Date().toISOString().replace(/\.\d+Z$/,'Z');
      const encoder = new TextEncoder();
      const hasImages = assets.media.length > 0;
      const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`+
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`+
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`+
        `<Default Extension="xml" ContentType="application/xml"/>`+
        (hasImages ? `<Default Extension="jpg" ContentType="image/jpeg"/>` : '')+
        `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>`+
        `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>`+
        `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>`+
        `</Types>`;
      const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`+
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`+
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>`+
        `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>`+
        `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>`+
        `</Relationships>`;
      const coreXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`+
        `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">`+
        `<dc:title>Briefing</dc:title><dc:creator>Calendário de Postagens</dc:creator><cp:lastModifiedBy>Calendário de Postagens</cp:lastModifiedBy>`+
        `<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>`+
        `</cp:coreProperties>`;
      const appXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`+
        `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Calendário de Postagens</Application></Properties>`;
      const files = [
        { name:'[Content_Types].xml', data: encoder.encode(contentTypesXml) },
        { name:'_rels/.rels', data: encoder.encode(relsXml) },
        { name:'docProps/core.xml', data: encoder.encode(coreXml) },
        { name:'docProps/app.xml', data: encoder.encode(appXml) },
        { name:'word/document.xml', data: encoder.encode(docxDocumentXml(bodyXml)) }
      ];
      if(assets.rels.length) files.push({ name:'word/_rels/document.xml.rels', data: encoder.encode(docxDocumentRelsXml(assets.rels)) });
      assets.media.forEach(m=> files.push({ name:'word/'+m.name, data: m.data }));
      return makeStoredZip(files, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    }
    // baixa um Blob binário (usado pelo .docx — download() só serve pra texto puro/CSV)
    function downloadBlob(name, blob){
      const a = document.createElement('a');
      const url = URL.createObjectURL(blob);
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=> URL.revokeObjectURL(url), 1200);
    }
    // gera e baixa o .docx só com as postagens cuja data (YYYY-MM-DD) cai entre startStr e endStr,
    // inclusive nos dois extremos — chamado pelo botão "Exportar .docx" do modal de período
    function exportBriefingForRange(startStr, endStr){
      const posts = state.posts.filter(p=> p.date && p.date>=startStr && p.date<=endStr);
      if(!posts.length){ alert('Nenhuma postagem no período selecionado.'); return; }
      const byDate = {};
      posts.forEach(p=>{ (byDate[p.date] = byDate[p.date] || []).push(p); });
      const dateKeys = Object.keys(byDate).sort();
      const assets = { rels: [], media: [] };
      let body = '';
      dateKeys.forEach((dateStr, idx)=>{
        const [y,m,d] = dateStr.split('-').map(Number);
        const dateLabel = new Date(y, m-1, d).toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
        body += docxDateHeadingXml(dateLabel, idx>0);
        sortByOrder(byDate[dateStr]).forEach(p=>{ body += buildPostBriefingDocxXml(p, assets); });
      });
      downloadBlob(`briefing-${startStr}_a_${endStr}.docx`, makeBriefingDocx(body, assets));
    }

    // ============================================================
    // MODAL "EXPORTAR BRIEFING" — escolhe o período antes de gerar o .docx. Os presets
    // (Semanal/Quinzenal/Mensal/Bimestral/Trimestral/Semestral/Anual) só preenchem De/Até como
    // ponto de partida — quem de fato decide o que entra no arquivo são os dois campos de data,
    // que continuam livres pra edição manual depois de qualquer preset.
    // ============================================================
    // intervalo [Date,Date] de um preset, ancorado no mês/ano de `anchor` (a visão aberta no
    // calendário no momento); bimestre/trimestre/semestre/ano seguem blocos fixos de calendário
    // (jan-fev, mar-abr... / jan-mar, abr-jun... / jan-jun, jul-dez / jan-dez), não uma janela
    // rolante a partir de `anchor` — é como "1º bimestre"/"2º trimestre" são entendidos no dia a dia
    function periodPresetRange(preset, anchor){
      const y = anchor.getFullYear(), m = anchor.getMonth();
      switch(preset){
        case 'week': { const s = getWeekStart(anchor); const e = new Date(s); e.setDate(e.getDate()+6); return [s,e]; }
        case 'biweek': { const fb = fortnightBounds(anchor); return [fb.startDate, fb.endDate]; }
        case 'bimonth': { const start = Math.floor(m/2)*2; return [new Date(y,start,1), new Date(y,start+2,0)]; }
        case 'quarter': { const start = Math.floor(m/3)*3; return [new Date(y,start,1), new Date(y,start+3,0)]; }
        case 'semester': { const start = m<6?0:6; return [new Date(y,start,1), new Date(y,start+6,0)]; }
        case 'year': return [new Date(y,0,1), new Date(y,11,31)];
        default: return [new Date(y,m,1), new Date(y,m+1,0)]; // 'month'
      }
    }
    function applyExportPreset(preset){
      const [s,e] = periodPresetRange(preset, viewDate);
      $('exportStartDate').value = ymd(s);
      $('exportEndDate').value = ymd(e);
      updateExportPeriodSummary();
    }
    const EXPORT_PERIOD_PRESETS = ['week','biweek','month','bimonth','quarter','semester','year'];
    // descobre se o intervalo De/Até atual corresponde exatamente a algum preset — usando a
    // própria data De como âncora (não viewDate), pra funcionar com qualquer mês/ano digitado à
    // mão, não só o que estava visível no calendário quando o modal abriu. Sem correspondência
    // exata, o período é "Personalizado".
    function detectPeriodPreset(startStr, endStr){
      if(!startStr || !endStr) return 'custom';
      const [y,m,d] = startStr.split('-').map(Number);
      const anchor = new Date(y, m-1, d);
      for(const preset of EXPORT_PERIOD_PRESETS){
        const [s,e] = periodPresetRange(preset, anchor);
        if(ymd(s)===startStr && ymd(e)===endStr) return preset;
      }
      return 'custom';
    }
    function setExportPeriodSelect(preset){
      const select = $('exportPeriodPreset'); if(!select) return;
      select.value = preset;
    }
    // feedback ao vivo abaixo dos campos de data: quantas postagens caem no período escolhido,
    // pra dar pra conferir antes de baixar (e avisar se a ordem das datas ficou invertida) —
    // também mantém o dropdown de período em sincronia com as datas atuais
    function updateExportPeriodSummary(){
      const el = $('exportPeriodSummary'); if(!el) return;
      const startStr = $('exportStartDate').value, endStr = $('exportEndDate').value;
      setExportPeriodSelect(detectPeriodPreset(startStr, endStr));
      if(!startStr || !endStr){ el.textContent = ''; return; }
      if(startStr > endStr){ el.textContent = 'A data final precisa ser igual ou depois da inicial.'; return; }
      const count = state.posts.filter(p=> p.date && p.date>=startStr && p.date<=endStr).length;
      el.textContent = `${formatDatePt(startStr)} até ${formatDatePt(endStr)} — ${count} postage${count===1?'m':'ns'} no período`;
    }
    // preset já selecionado ao abrir o modal: acompanha a visão do calendário aberta no momento
    // (mês, quinzena ou semana); Lista (ou qualquer outra) cai no mensal, o padrão mais comum
    function defaultExportPreset(){
      if(currentView==='week') return 'week';
      if(currentView==='biweek') return 'biweek';
      return 'month';
    }
    function openExportBriefingModal(){
      if(!state.posts || state.posts.length===0){ alert('Nenhuma postagem para exportar'); return; }
      const preset = defaultExportPreset();
      setExportPeriodSelect(preset);
      applyExportPreset(preset);
      $('exportBriefingBackdrop').style.display = 'flex';
    }
    function closeExportBriefingModal(){ $('exportBriefingBackdrop').style.display = 'none'; }
    // ============================================================
    // LIGAÇÃO DOS DEMAIS BOTÕES DA TOOLBAR (exportar, seleção,
    // lote, filtros) E FECHAMENTO DOS MODAIS
    // ============================================================
    function closeToolbarMoreMenu(){
      const wrap = $('toolbarMoreWrap'), menu = $('toolbarMoreMenu'), btn = $('toolbarMoreBtn');
      if(wrap) wrap.classList.remove('open');
      if(menu) menu.classList.remove('open');
      if(btn) btn.setAttribute('aria-expanded','false');
    }
    if($('toolbarMoreBtn') && $('toolbarMoreMenu')){
      $('toolbarMoreBtn').addEventListener('click', ev=>{
        ev.stopPropagation();
        const willOpen = !$('toolbarMoreMenu').classList.contains('open');
        closeToolbarMoreMenu();
        if(willOpen){
          $('toolbarMoreWrap').classList.add('open');
          $('toolbarMoreMenu').classList.add('open');
          $('toolbarMoreBtn').setAttribute('aria-expanded','true');
        }
      });
      $('toolbarMoreMenu').addEventListener('click', ev=> ev.stopPropagation());
      ['exportBriefingBtn','exportCsvBtn','resetMonthBtn'].forEach(id=>{
        const action = $(id); if(action) action.addEventListener('click', closeToolbarMoreMenu);
      });
      document.addEventListener('click', closeToolbarMoreMenu);
      document.addEventListener('keydown', ev=>{ if(ev.key==='Escape') closeToolbarMoreMenu(); });
    }
    const _exportCsvBtn = $('exportCsvBtn'); if(_exportCsvBtn) _exportCsvBtn.addEventListener('click', exportCSV);
    if($('exportBriefingBtn')) $('exportBriefingBtn').addEventListener('click', openExportBriefingModal);
    const _resetMonthBtn = $('resetMonthBtn'); if(_resetMonthBtn) _resetMonthBtn.addEventListener('click', resetMonth);
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
      filters.editorias = []; filters.places = []; filters.types = []; filters.statuses = []; filters.collab='any'; $('filtersBackdrop').style.display='none'; buildCalendar(); render();
    });
    function closeFilters(){ $('filtersBackdrop').style.display = 'none'; }

    // fechamento padrão de qualquer modal: pelo botão "X" ou clicando fora da caixa (no backdrop).
    // `closeBtnSelector` é opcional — só é preciso quando o modal tem mais de um botão com a
    // classe ".modal-close" (caso do modal de postagem, que também tem o "⋮" de mais ações);
    // sem ele, cai no primeiro ".modal-close" encontrado, como nos demais modais.
    // `closeOnBackdropClick` (padrão true) desliga o fechamento por clique fora — usado no modal
    // de criar/editar postagem, onde um clique acidental fora da caixa vinha fechando o modal e
    // descartando o que a pessoa já tinha preenchido; ali só o "X" (ou "‹ Voltar") fecha.
    function wireModalDismiss(backdropId, closeFn, closeBtnSelector, closeOnBackdropClick){
      const backdrop = $(backdropId);
      if(!backdrop) return;
      if(closeOnBackdropClick !== false) backdrop.addEventListener('click', ev=>{ if(ev.target === backdrop) closeFn(); });
      const closeBtn = backdrop.querySelector(closeBtnSelector || '.modal-close');
      if(closeBtn) closeBtn.addEventListener('click', closeFn);
    }
    wireModalDismiss('modalBackdrop', closeModal, '#modalCloseBtn', false);
    // botão "⋮" do modal de edição — fixo, ligado uma única vez; lê editingId no momento do
    // clique (por isso o getter), já que o mesmo botão é reaproveitado a cada postagem editada
    if($('modalMenuBtn')) wireCardMenuButton($('modalMenuBtn'), () => editingId);
    wireIntelValidation();
    wireCaptionGenerator();
    wireRemoveProductConfirm();
    wireClearContentBtn();
    wireModalDismiss('settingsBackdrop', closeSettings);
    wireModalDismiss('filtersBackdrop', closeFilters);
    // modal "Aplicar editoria ao mês" — o "‹" do cabeçalho e o "X" fazem a mesma coisa (fecham
    // este modal e revelam a lista de editorias, que continua aberta por baixo, em Configurações);
    // o "‹" existe separado só pra deixar explícito que é "voltar", não "cancelar sem salvar"
    wireModalDismiss('applyEditoriaBackdrop', closeApplyEditoriaModal, '#applyEditoriaCloseBtn');
    if($('applyEditoriaBackBtn')) $('applyEditoriaBackBtn').addEventListener('click', closeApplyEditoriaModal);
    if($('cancelApplyEditoria')) $('cancelApplyEditoria').addEventListener('click', closeApplyEditoriaModal);
    if($('confirmApplyEditoria')) $('confirmApplyEditoria').addEventListener('click', confirmApplyEditoriaModal);
    wireModalDismiss('scheduleWarningBackdrop', closeScheduleWarning, '#scheduleWarningCloseBtn');
    if($('scheduleWarningOkBtn')) $('scheduleWarningOkBtn').addEventListener('click', closeScheduleWarning);
    wireModalDismiss('commemorativeConfirmBackdrop', closeCommemorativeDateConfirm, '#commemorativeConfirmCloseBtn');
    if($('commemorativeConfirmCancel')) $('commemorativeConfirmCancel').addEventListener('click', closeCommemorativeDateConfirm);
    if($('commemorativeConfirmOk')) $('commemorativeConfirmOk').addEventListener('click', confirmCommemorativeDatePost);
    // "‹ Voltar" do modal de postagem: só aparece quando ele foi aberto a partir de uma linha do
    // modal "Aplicar editoria" (ver renderApplyEditoriaModal) — fechar aqui também revela essa
    // lista de volta, igual ao "X", mas com o rótulo certo pra esse contexto
    if($('modalBackBtn')) $('modalBackBtn').addEventListener('click', closeModal);
    wireModalDismiss('exportBriefingBackdrop', closeExportBriefingModal);
    if($('cancelExportBriefing')) $('cancelExportBriefing').addEventListener('click', closeExportBriefingModal);
    if($('exportPeriodPreset')) $('exportPeriodPreset').addEventListener('change', ()=>{
      const preset = $('exportPeriodPreset').value;
      if(preset==='custom'){
        // sem intervalo próprio: limpa De/Até pra obrigar a escolher as duas datas na mão
        $('exportStartDate').value = '';
        $('exportEndDate').value = '';
        updateExportPeriodSummary();
        return;
      }
      applyExportPreset(preset);
    });
    if($('exportStartDate')) $('exportStartDate').addEventListener('input', updateExportPeriodSummary);
    if($('exportEndDate')) $('exportEndDate').addEventListener('input', updateExportPeriodSummary);
    if($('confirmExportBriefing')) $('confirmExportBriefing').addEventListener('click', ()=>{
      const startStr = $('exportStartDate').value, endStr = $('exportEndDate').value;
      if(!startStr || !endStr){ alert('Escolha as duas datas do período.'); return; }
      if(startStr > endStr){ alert('A data final precisa ser igual ou depois da inicial.'); return; }
      exportBriefingForRange(startStr, endStr);
      closeExportBriefingModal();
    });
    wireModalDismiss('dayPostsBackdrop', closeDayPosts, '#dayPostsCloseBtn');
    // botão "+" do modal "Postagens do dia" — cria uma postagem nova já com a data do dia aberto
    if($('dayPostsAddBtn')) $('dayPostsAddBtn').addEventListener('click', ()=>{
      const dateStr = openDayPostsDate;
      closeDayPosts();
      closeEditState();
      openModal(dateStr);
    });
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
    // FLUXO GUIADO DO MODAL DE POSTAGEM
    // O formulário e o preview originais são reaproveitados; o preview permanece
    // visível na lateral e continua sendo atualizado em tempo real.
    function setGuidedPostStep(step){

      const modal = document.querySelector('#modalBackdrop .modal--guided-post');
      if(!modal) return;
      guidedPostStep = Math.max(1, Math.min(3, Number(step)||1));
      modal.querySelectorAll('[data-guided-step]').forEach(group=>{
        group.hidden = Number(group.dataset.guidedStep) !== guidedPostStep;
      });
      modal.querySelectorAll('[data-guided-step-target]').forEach(btn=>{
        const active = Number(btn.dataset.guidedStepTarget) === guidedPostStep;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-current', active ? 'step' : 'false');
      });
      const back = $('guidedPostBack'), next = $('guidedPostNext'), save = $('saveModal');
      if(back) back.hidden = guidedPostStep === 1;
      if(next) next.hidden = guidedPostStep === 3;
      if(save) save.hidden = guidedPostStep !== 3;
      const body = modal.querySelector('.modal-body');
      if(body) body.scrollTop = 0;
    }

    function setupGuidedPostFlow(){

      const modal = document.querySelector('#modalBackdrop .modal');
      const body = modal && modal.querySelector('.modal-body');
      const grid = body && body.querySelector('.grid-2');
      const preview = grid && grid.querySelector('[data-guided-preview]');
      const footer = modal && modal.querySelector('.modal-footer');
      const save = $('saveModal');
      if(!modal || !body || !grid || !preview || !footer || !save) return;

      modal.classList.add('modal--guided-post');
      footer.classList.add('guided-post-footer');

      const nav = document.createElement('div');
      nav.className = 'guided-flow-nav';
      nav.innerHTML = `<div class="guided-flow-steps"><button type="button" class="guided-step-btn" data-guided-step-target="1"><span class="guided-step-number">1</span>Planejamento</button><button type="button" class="guided-step-btn" data-guided-step-target="2"><span class="guided-step-number">2</span>Conteúdo</button><button type="button" class="guided-step-btn" data-guided-step-target="3"><span class="guided-step-number">3</span>Entrega</button></div>`;
      body.insertBefore(nav, grid);

      const layout = document.createElement('div');
      layout.className = 'guided-post-layout';
      const formPanel = document.createElement('div');
      formPanel.className = 'guided-form-panel';
      const previewPanel = document.createElement('aside');
      previewPanel.className = 'guided-preview-panel';
      body.insertBefore(layout, grid);
      formPanel.appendChild(grid);
      previewPanel.appendChild(preview);
      layout.append(formPanel, previewPanel);

      const back = document.createElement('button');
      back.type = 'button'; back.id = 'guidedPostBack'; back.className = 'btn ghost'; back.textContent = 'Voltar';
      const next = document.createElement('button');
      next.type = 'button'; next.id = 'guidedPostNext'; next.className = 'btn'; next.textContent = 'Próximo';
      footer.insertBefore(back, save);
      footer.insertBefore(next, save);

      nav.querySelectorAll('[data-guided-step-target]').forEach(btn=> btn.addEventListener('click', ()=> setGuidedPostStep(btn.dataset.guidedStepTarget)));
      back.addEventListener('click', ()=> setGuidedPostStep(guidedPostStep-1));
      next.addEventListener('click', ()=> setGuidedPostStep(guidedPostStep+1));
      setGuidedPostStep(1);
    }

    // ============================================================
    // INICIALIZAÇÃO DA APLICAÇÃO
    // ============================================================
    setupGuidedPostFlow();
    // carrega configurações e postagens persistidas
    loadSettings();
    renderAllDynamicUI();
    // catálogo mestre de produtos, pro autocomplete de Produto(s) — ver productCandidates()
    if(typeof CatalogProvider!=='undefined'){
      CatalogProvider.load('vonder').then(result=>{ masterCatalog = result.items||[]; });
    }
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
      if(scheduleValue) entry.scheduleByMonth = { [editoriasMonthKey || monthKeyFromDate(viewDate)]: scheduleValue };
      APP_SETTINGS.editorias.push(entry);
      saveSettings(); renderAllDynamicUI();
      closeNewEditoriaForm();
    });
    // navegador de mês compartilhado acima da lista de editorias — ligado uma única vez (os
    // elementos são estáticos, não recriados a cada renderEditoriasUI); só troca
    // editoriasMonthKey e manda re-renderizar, pra refletir em todas as editorias de uma vez
    // (chip + painel aberto). Com o popover de meses aberto, as mesmas setas trocam de ano
    // (mesmo padrão do prevMonth/nextMonth do calendário principal com o monthYearPicker aberto).
    if($('editoriasMonthPrev')) $('editoriasMonthPrev').addEventListener('click', (ev)=>{
      if(editoriasMonthPickerEl && editoriasMonthPickerEl.classList.contains('open')){ ev.stopPropagation(); stepEditoriasPickerYear(-1); return; }
      const [y,m] = editoriasMonthKey.split('-').map(Number);
      editoriasMonthKey = monthKeyFromDate(new Date(y, m-2, 1));
      renderEditoriasUI();
    });
    if($('editoriasMonthNext')) $('editoriasMonthNext').addEventListener('click', (ev)=>{
      if(editoriasMonthPickerEl && editoriasMonthPickerEl.classList.contains('open')){ ev.stopPropagation(); stepEditoriasPickerYear(1); return; }
      const [y,m] = editoriasMonthKey.split('-').map(Number);
      editoriasMonthKey = monthKeyFromDate(new Date(y, m, 1));
      renderEditoriasUI();
    });
    if($('editoriasMonthLabel')) $('editoriasMonthLabel').addEventListener('click', (ev)=>{ ev.stopPropagation(); toggleEditoriasMonthPicker(); });
    document.addEventListener('click', ()=> closeEditoriasMonthPicker());
    loadState();
    // monta o calendário e, se ainda não houver nenhuma postagem, cria exemplos de demonstração
    // (só no modo local/offline — num calendário sincronizado com o servidor não faz sentido
    // criar posts de exemplo pra toda a equipe; espera o syncPull() trazer os dados reais)
    buildCalendar();
    // exemplos de demonstração só fazem sentido pra marca padrão (a base de dados que já
    // existia antes do portal) — uma marca nova criada pelo usuário deve começar zerada
    if(!SYNC_ENABLED && state.posts.length===0 && BRAND_SUFFIX===''){
      state.posts.push({ id: generateId(), title: 'Campanha: Lançamento Comunidade', date: '2026-08-18', channel: 'Instagram', color:'#E4405F', status:'Aprovado', editoria:['Lançamentos'], place:'Feed', type:'Static' });
      state.posts.push({ id: generateId(), title: 'Blog: Anúncio oficial', date: '2026-08-20', channel: 'Blog', color:'#06b6d4', status:'Em produção', editoria:['Informativo'], place:'Feed', type:'Static' });
      state.posts.push({ id: generateId(), title: 'Postagem de teste — Social', date: '2026-08-19', channel: 'LinkedIn', color:'#f97316', status:'Rascunho', editoria:['Destaques'], place:'Feed', type:'Video' });
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
      // mesma cadência pra Central de Inteligência (só leitura aqui — quem treina é intelligence-center.html)
      refreshIntel();
      setInterval(()=> refreshIntel(), 20000);
    } else {
      setSyncStatus('Salvando só neste navegador (abra pelo endereço do servidor pra sincronizar)', 'warn');
    }




