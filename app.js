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
    let currentView = 'month'; // 'month' | 'list'
    // metas configuráveis (persistidas nas Configurações)
    let TARGET = 3;
    let WEEK_VIDEO_TARGET = 3;
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
    }
    applyTheme(localStorage.getItem(THEME_KEY) || 'light');

    // ============================================================
    // HELPERS DE COR E EXIBIÇÃO — cores de tags/status, ícones de rede,
    // normalização de texto e montagem de URL de imagem de produto
    // ============================================================
    const TAG_PALETTE = ['#7c3aed','#0284c7','#16a34a','#b45309','#dc2626','#db2777','#0d9488','#4f46e5','#65a30d','#ea580c'];
    function hexToRgba(hex, alpha){
      const h = (hex||'#7c3aed').replace('#','');
      const full = h.length===3 ? h.split('').map(c=>c+c).join('') : h;
      const n = parseInt(full,16) || 0x7c3aed;
      const r=(n>>16)&255,g=(n>>8)&255,b=n&255;
      return `rgba(${r},${g},${b},${alpha})`;
    }
    function tagStyle(hex){ return `background:${hexToRgba(hex,0.12)};color:${hex};border:1px solid ${hexToRgba(hex,0.28)}`; }
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
    function networkIcon(name){
      return ICONS[name] || `<span class="dot" style="background:${networkColor(name)}"></span>`;
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
        chip.innerHTML = `${img}<div class="pc-body"><span class="pc-name">${escapeHtml(p.name)}</span>${p.code?`<span class="pc-code">${escapeHtml(p.code)}</span>`:''}</div><button type="button" class="pc-remove" data-idx="${idx}" aria-label="Remover produto">✕</button>`;
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
      box.innerHTML = `<div class="ts-header"><span class="ts-icon">✨</span><span>Sugestões de título</span><button type="button" class="ts-shuffle" title="Gerar outras opções">🔄</button></div>` +
        suggestions.map(s=>`<div class="ts-option"><span class="ts-text">${escapeHtml(s)}</span><button type="button" class="ts-use" data-text="${escapeHtml(s)}">Usar</button></div>`).join('');
      box.querySelectorAll('.ts-use').forEach(bt=> bt.addEventListener('click', ()=>{ $('mTitle').value = bt.dataset.text; box.style.display = 'none'; renderModalPreview(); }));
      box.querySelector('.ts-shuffle').addEventListener('click', renderTitleSuggestion);
      box.style.display = 'flex';
    }

    // ============================================================
    // PRÉ-VISUALIZAÇÃO AO VIVO DO MODAL — reflete título, status,
    // redes, editorias, tipo e produtos escolhidos em tempo real
    // ============================================================
    function renderModalPreview(){
      const wrap = $('modalPreview'); if(!wrap) return;
      const title = $('mTitle').value.trim();
      const statusEl = document.querySelector('input[name="mStatus"]:checked');
      const status = statusEl ? statusEl.value : '';
      const stColor = statusColor(status);
      const nets = Array.from(document.querySelectorAll('.mNet:checked')).map(n=>n.value);
      const editorias = Array.from(document.querySelectorAll('.mEditoria:checked')).map(e=>e.value);
      const typeEl = document.querySelector('input[name="mType"]:checked');
      const type = typeEl ? typeEl.value : 'Static';
      const collab = $('mCollab') ? $('mCollab').checked : false;

      wrap.querySelector('.mp-bar').style.background = stColor;
      const titleEl = wrap.querySelector('.mp-title');
      titleEl.textContent = title || 'Sua postagem aparecerá aqui';
      titleEl.classList.toggle('placeholder', !title);

      const tags = [];
      if(status) tags.push(`<span class="tag" style="${tagStyle(stColor)}">${escapeHtml(status)}</span>`);
      editorias.forEach(ed=> tags.push(`<span class="tag" style="${tagStyle(editoriaColor(ed))}">${escapeHtml(ed)}</span>`));
      nets.forEach(n=> tags.push(`<span class="tag tag--outline">${networkIcon(n)} ${escapeHtml(n)}</span>`));
      if(type==='Video') tags.push(`<span class="tag tag--outline">🎬 Vídeo</span>`);
      if(collab) tags.push(`<span class="tag tag--collab">Collab</span>`);
      selectedProducts.forEach(p=>{ if(p.code) tags.push(`<img class="mp-prod-thumb" src="${productImageUrl(p.code)}" referrerpolicy="no-referrer" onerror="this.style.display='none'" alt="" title="${escapeHtml(p.name)}" />`); });
      wrap.querySelector('.mp-meta').innerHTML = tags.join('');
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

    // pré-visualização do texto do briefing, abaixo de Notas — consolida título, formatos (com
    // dimensões) e os links de onde salvar arte/referências, na ordem: Título, Formatos,
    // Dimensões, Salvar em, Referências salvas em. Não inclui "Briefing salvo em" porque esse
    // campo indica onde o PRÓPRIO briefing fica, não é conteúdo do briefing em si.
    function renderBriefingPreview(){
      const el = $('mBriefingPreview'); if(!el) return;
      const title = $('mTitle').value.trim();
      const nets = Array.from(document.querySelectorAll('.mNet:checked')).map(n=>n.value);
      const checkedPlaces = Array.from(document.querySelectorAll('input[name="mPlace"]:checked')).map(n=>n.value);
      const formats = formatsForNetworks(nets).filter(f=> checkedPlaces.includes(f.name));
      const dims = formats.filter(f=> f.width && f.height).map(f=> `${f.width}x${f.height}px`);
      const artsLink = $('mArtsLink').value.trim();
      const referencesLink = $('mReferencesLink').value.trim();

      // cada linha guarda a versão em texto puro (pro botão de copiar) e em HTML (pra exibição,
      // só o título em negrito) lado a lado, pra nunca ficarem dessincronizadas — por exemplo,
      // se o Título ainda estiver vazio mas outros campos já preenchidos
      const rows = [];
      if(title) rows.push({ plain: title, html: `<strong>${escapeHtml(title)}</strong>` });
      if(checkedPlaces.length) rows.push({ plain: `Formatos: ${joinPt(checkedPlaces)}` });
      if(dims.length) rows.push({ plain: `Dimensões: ${joinPt(dims)}` });
      if(artsLink) rows.push({ plain: `Salvar em: ${artsLink}` });
      if(referencesLink) rows.push({ plain: `Referências salvas em: ${referencesLink}` });

      currentBriefingText = rows.map(r=>r.plain).join('\n');
      el.innerHTML = rows.length>0
        ? rows.map(r=>`<div>${r.html || escapeHtml(r.plain)}</div>`).join('')
        : `<span style="color:var(--text-faint)">Preencha os campos acima para ver o texto do briefing aqui.</span>`;
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
      renderModalPreview();
      renderBriefingPreview();
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
    const ICONS = {
      Instagram: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="3" width="18" height="18" rx="5" stroke="#7c3aed" stroke-width="1.6" fill="none"/><circle cx="12" cy="12" r="3.2" stroke="#7c3aed" stroke-width="1.6" fill="none"/><circle cx="17.5" cy="6.5" r="0.9" fill="#7c3aed"/></svg>`,
      Twitter: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M22 5.92c-.63.28-1.3.47-2 .56.72-.43 1.27-1.12 1.53-1.94-.68.4-1.44.69-2.25.85C18.9 4.5 17.7 4 16.4 4c-2.02 0-3.66 1.64-3.66 3.66 0 .29.03.57.09.84C9.2 8.4 6.2 6.7 4.1 4.1c-.32.56-.5 1.2-.5 1.88 0 1.3.66 2.45 1.66 3.12-.6-.02-1.17-.18-1.66-.46v.05c0 1.77 1.26 3.25 2.93 3.59-.31.08-.64.12-.98.12-.24 0-.48-.02-.71-.07.48 1.5 1.87 2.6 3.52 2.63-1.29 1.01-2.92 1.61-4.69 1.61-.3 0-.6-.02-.9-.05C6.95 20.2 9.37 21 12 21c7.07 0 10.94-5.86 10.94-10.94l-.01-.5C22 7.45 22.5 6.7 22 5.92z" fill="#1DA1F2"/></svg>`,
      LinkedIn: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="3" width="20" height="18" rx="2" stroke="#0A66C2" stroke-width="1.2" fill="none"/><path d="M6 10.5v6M8 7.5v9M11 7.5v9M14 7.5v9" stroke="#0A66C2" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      Blog: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 7.5h18M3 12h12M3 16.5h9" stroke="#ef4444" stroke-width="1.2" stroke-linecap="round"/></svg>`,
      Email: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2.5" y="4" width="19" height="16" rx="2" stroke="#374151" stroke-width="1.2" fill="none"/><path d="M3 7l9 6 9-6" stroke="#374151" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    };
    const FORMAT_ICONS = {
      Feed: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" stroke-width="1.6"/><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/><path d="M21 15l-5-5-4 4-3-3-6 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      Story: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="6" y="2" width="12" height="20" rx="6" stroke="currentColor" stroke-width="1.6"/></svg>`,
      Stories: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="6" y="2" width="12" height="20" rx="6" stroke="currentColor" stroke-width="1.6"/></svg>`,
      Reels: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" stroke-width="1.6"/><path d="M10 9l5 3-5 3V9z" fill="currentColor"/></svg>`
    };

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
    function buildCalendar(){
      const grid = $('grid');
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
        } else {
          cell.classList.add('empty');
          cell.innerHTML = `<div style="height:18px"></div>`;
        }
        grid.appendChild(cell);
      }
      // atualiza o rótulo do mês exibido (ex: "Agosto 2026")
      updateMonthLabelText();
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
      btn.type = 'button'; btn.className = btnClass; btn.setAttribute('aria-label','Mais ações'); btn.title = 'Mais ações'; btn.textContent = '⋮';
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
      const stColor = statusColor(p.status);
      const entries = postChannelEntries(p);
      const multi = entries.length>1;
      const formatsCount = entries.reduce((n,c)=> n+(c.places||[]).length, 0);
      const hasVideo = entries.some(c=>(c.types||[]).some(t=>(t||'').toLowerCase()==='video'));
      const icon = multi ? entries.map(c=>networkIcon(c.channel)).join('') : networkIcon(p.channel);
      const channelLabel = multi ? `${entries.length} redes` : escapeHtml(networkShortName(p.channel));
      const eds = Array.isArray(p.editoria)?p.editoria:[p.editoria].filter(Boolean);
      const placeText = multi ? `${formatsCount} formatos` : (Array.isArray(p.place)?p.place.join('/'):(p.place||''));
      const tagsHtml = [
        ...eds.map(e=>`<span class="tag" style="${tagStyle(editoriaColor(e))}">${escapeHtml(e)}</span>`),
        multi ? `<span class="tag tag--outline">${formatsCount} formatos</span>` : '',
        hasVideo ? `<span class="tag tag--outline">🎬 Vídeo</span>` : '',
        p.collab ? `<span class="tag tag--collab">Collab</span>` : ''
      ].filter(Boolean).join('');
      const prods = getPostProducts(p);
      const productNames = prods.map(x=>x.name).filter(Boolean).join(', ');
      div.title = multi ? [p.status, postChannelsDetailText(p), productNames].filter(Boolean).join(' · ') : [p.status, placeText, productNames].filter(Boolean).join(' · ');
      div.innerHTML = `<div class="event-bar" style="background:${stColor}"></div><div class="event-body"><div class="event-title">${escapeHtml(p.title)}</div><div class="event-sub"><span class="icon">${icon}</span><span>${channelLabel}</span></div>${tagsHtml?`<div class="event-tags">${tagsHtml}</div>`:''}</div>`;
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
      const stColor = statusColor(p.status);
      const entries = postChannelEntries(p);
      const multi = entries.length>1;
      const formatsCount = entries.reduce((n,c)=> n+(c.places||[]).length, 0);
      const hasVideo = entries.some(c=>(c.types||[]).some(t=>(t||'').toLowerCase()==='video'));
      const icon = multi ? entries.map(c=>networkIcon(c.channel)).join('') : networkIcon(p.channel);
      const channelLabel = multi ? `${entries.length} redes` : escapeHtml(networkShortName(p.channel));
      const channelTitle = multi ? postChannelsDetailText(p) : (p.channel||'');
      const eds = Array.isArray(p.editoria)?p.editoria:[p.editoria].filter(Boolean);
      const tagsHtml = [
        ...eds.map(e=>`<span class="tag" style="${tagStyle(editoriaColor(e))}">${escapeHtml(e)}</span>`),
        multi ? `<span class="tag tag--outline">${formatsCount} formatos</span>` : '',
        p.collab ? `<span class="tag tag--collab">Collab</span>` : '',
        hasVideo ? `<span class="tag tag--outline">🎬 Vídeo</span>` : ''
      ].filter(Boolean).join('');
      row.innerHTML = `<span class="drag-handle" title="Arraste para reordenar">⠿</span><span class="list-row-bar" style="background:${stColor}"></span><span class="list-row-title">${escapeHtml(p.title)}</span><span class="list-row-channel" title="${escapeHtml(channelTitle)}">${icon}${channelLabel}</span><span class="list-row-tags">${tagsHtml}</span><span class="tag" style="${tagStyle(stColor)}">${escapeHtml(p.status||'')}</span>`;
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
    // alterna a visão ativa entre "month" (grade) e "list" (lista)
    function setView(v){
      currentView = v;
      $('grid').style.display = v==='month' ? 'grid' : 'none';
      $('weekdayHeader').style.display = v==='month' ? 'grid' : 'none';
      $('listView').style.display = v==='list' ? 'flex' : 'none';
      document.querySelectorAll('#viewToggle button').forEach(b=> b.classList.toggle('active', b.dataset.view===v));
      render();
    }

    function render(){
      // limpa as postagens já desenhadas em cada célula
      document.querySelectorAll('.day').forEach(c=>{ const posts = c.querySelector('.posts'); if(posts) posts.innerHTML = ''; });
      const filtered = getFilteredPosts();
      // agrupa as postagens filtradas por data
      const postsMap = {};
      filtered.forEach(p=>{ postsMap[p.date] = postsMap[p.date] || []; postsMap[p.date].push(p); });

      // desenha cada célula com limite de cards visíveis + badge "+N"
      const maxVisible = 3;
      document.querySelectorAll('.day[data-date]').forEach(cell=>{
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

      // badges de meta diária por dia + resumo semanal de vídeos (sugestão da IA)
      // calcula os vídeos da semana que contém viewDate (domingo a sábado)
      const weekStart = new Date(viewDate); weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);
      let weekVideos = 0;
      let monthTotal = 0;
      const YEAR = viewDate.getFullYear(), MONTH = viewDate.getMonth();
      document.querySelectorAll('.day[data-date]').forEach(cell=>{
        const date = cell.dataset.date;
        if(!date) return;
        const postsAll = state.posts.filter(p=>p.date===date && !p.collab);
        const total = postsAll.length;
        monthTotal += total;
        const videoCount = postsAll.filter(p=> postChannelEntries(p).some(c=>(c.types||[]).some(t=>(t||'').toLowerCase()==='video'))).length;
        // soma ao total da semana, se a data cair dentro dela
        const d = new Date(date);
        if(d >= weekStart && d <= weekEnd) weekVideos += videoCount;

        const badge = cell.querySelector('.day-count');
        if(badge){
          badge.className = `day-count ${total < TARGET ? 'low':'ok'}`;
          badge.textContent = `${total}/${TARGET}`;
          badge.title = total < TARGET ? `Sugestão: meta ${TARGET} posts/dia. Atualmente ${total}. Collab não conta.` : 'Meta diária atingida';
        }
      });

      // resumo rápido no topo da toolbar
      const summaryEl = $('aiSummary');
      if(summaryEl){ summaryEl.textContent = `${monthTotal} postagens neste mês · ${weekVideos}/${WEEK_VIDEO_TARGET} vídeos nesta semana`; }

      // card de sugestão semanal, exibido abaixo do calendário
      const suggestion = $('suggestionCard');
      if(suggestion){
        suggestion.style.display = 'block';
        const weekStatus = weekVideos >= WEEK_VIDEO_TARGET ? `<strong style="color:var(--success)">${weekVideos}/${WEEK_VIDEO_TARGET} vídeos</strong>` : `<strong style="color:var(--danger)">${weekVideos}/${WEEK_VIDEO_TARGET} vídeos</strong>`;
        suggestion.innerHTML = `<strong>Sugestão IA</strong><div style="margin-top:6px;color:var(--text)">Meta diária: <strong>${TARGET}</strong> posts por dia. Collabs não entram na contagem. Vídeos: ideal ${WEEK_VIDEO_TARGET} por semana — recomendação atual: ${weekStatus}. Dica: se estiver abaixo, considere transformar 1 dos posts do dia em vídeo ou aumentar a frequência esta semana.</div>`;
      }

      if(currentView==='list') renderListView();
      // mantém o popup de "postagens do dia" em dia com qualquer mudança (edição, exclusão,
      // duplicação, arrastar...), já que praticamente toda ação de estado passa por aqui
      renderDayPostsList();
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
      if(list.length===0){ closeDayPosts(); return; } // a última postagem do dia foi removida/filtrada — fecha sozinho
      container.innerHTML = '';
      list.forEach(p=> container.appendChild(createListRow(p)));
      const [y,m,d] = openDayPostsDate.split('-').map(Number);
      const label = new Date(y, m-1, d).toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long' });
      $('dayPostsTitle').textContent = `Postagens de ${label}`;
    }

    function addPostFromForm(){
      // função legada mantida sem efeito, por segurança (nada mais a chama)
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

    function openModal(){
      $('modalBackdrop').style.display = 'flex';
      // pré-preenche a data com o mês/dia atualmente visível no calendário
      const defaultDate = viewDate.toISOString().slice(0,10);
      $('mDate').value = defaultDate;
      // limpa os campos do formulário
      $('mTitle').value=''; $('mNotes').value=''; $('mProductName').value='';
      $('mBriefingLink').value=''; $('mReferencesLink').value=''; $('mArtsLink').value='';
      document.querySelectorAll('.mNet').forEach(n=>n.checked=false); document.querySelectorAll('.mEditoria').forEach(e=>e.checked=false);
      // formato depende da(s) rede(s) escolhida(s) — sem rede marcada, não há formato para pré-selecionar
      renderModalFormatsUI();
      document.querySelector('input[name="mType"][value="Static"]').checked = true;
      document.querySelectorAll('input[name="mStatus"]').forEach((el,i)=> el.checked = i===0);
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
      const place = Array.from(document.querySelectorAll('input[name="mPlace"]:checked')).map(n=>n.value);
      const type = document.querySelector('input[name="mType"]:checked').value;
      const statusEl = document.querySelector('input[name="mStatus"]:checked');
      const status = statusEl ? statusEl.value : ((APP_SETTINGS.statuses[0] && APP_SETTINGS.statuses[0].name) || 'Rascunho');
      const notes = $('mNotes').value.trim();
      const briefingLink = $('mBriefingLink').value.trim();
      const referencesLink = $('mReferencesLink').value.trim();
      const artsLink = $('mArtsLink').value.trim();
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
        post.title = title; post.date = date; post.status = status; post.notes = notes; post.collab = $('mCollab').checked;
        post.briefingLink = briefingLink; post.referencesLink = referencesLink; post.artsLink = artsLink;
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
        status, notes, briefingLink, referencesLink, artsLink, collab: $('mCollab').checked, color: null, editoria: editorias, products: products.slice(), order: nextOrderForDate(date)
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
      document.querySelectorAll('.mNet').forEach(n=>n.checked=false); $('mCollab').checked = false;
      document.querySelectorAll('.mEditoria').forEach(e=>e.checked=false); $('mProductName').value=''; selectedProducts=[]; renderSelectedProducts();
      renderModalFormatsUI();
    }

    function clearForm(){ }

    // ============================================================
    // PERSISTÊNCIA DAS POSTAGENS (localStorage)
    // ============================================================
    function saveState(){
      localStorage.setItem('calendar_posts_v1', JSON.stringify(state.posts));
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
    const BRAND_COLORS = { Instagram:'#7c3aed', Twitter:'#1DA1F2', LinkedIn:'#0A66C2', Blog:'#ef4444', Email:'#374151' };
    const BRAND_SHORT_NAMES = { Instagram:'IG', Twitter:'TW', LinkedIn:'LI', Blog:'BL', Email:'EM' };
    // formatos padrão por rede — cada rede tem seu próprio conjunto (ex: Reels só existe no Instagram),
    // cada formato com as dimensões (px) e extensões de arquivo aceitas
    const NETWORK_DEFAULT_FORMATS = {
      Instagram: [
        { name:'Feed Vertical', width:1080, height:1350, extensions:['JPG','PNG','MP4'] },
        { name:'Stories', width:1080, height:1920, extensions:['JPG','PNG','MP4'] },
        { name:'Reels', width:1080, height:1920, extensions:['MP4'] }
      ],
      Twitter: [{ name:'Post', width:1200, height:675, extensions:['JPG','PNG','MP4'] }],
      LinkedIn: [
        { name:'Post', width:1200, height:627, extensions:['JPG','PNG','MP4'] },
        { name:'Artigo', width:1200, height:644, extensions:['JPG','PNG'] }
      ],
      Blog: [{ name:'Post', width:1200, height:630, extensions:['JPG','PNG'] }],
      Email: [{ name:'Email', width:600, height:800, extensions:['JPG','PNG'] }]
    };
    const DEFAULT_SETTINGS = {
      TARGET: 3,
      WEEK_VIDEO_TARGET: 3,
      networks: [
        { name:'Instagram', shortName:'IG', color:'#7c3aed', formats: NETWORK_DEFAULT_FORMATS.Instagram.map(f=>Object.assign({},f)) },
        { name:'Twitter', shortName:'TW', color:'#1DA1F2', formats: NETWORK_DEFAULT_FORMATS.Twitter.map(f=>Object.assign({},f)) },
        { name:'LinkedIn', shortName:'LI', color:'#0A66C2', formats: NETWORK_DEFAULT_FORMATS.LinkedIn.map(f=>Object.assign({},f)) },
        { name:'Blog', shortName:'BL', color:'#ef4444', formats: NETWORK_DEFAULT_FORMATS.Blog.map(f=>Object.assign({},f)) },
        { name:'Email', shortName:'EM', color:'#374151', formats: NETWORK_DEFAULT_FORMATS.Email.map(f=>Object.assign({},f)) }
      ],
      editorias: [
        { name:'Informativo', color:'#7c3aed' },
        { name:'Destaques', color:'#0284c7' },
        { name:'Lançamentos', color:'#16a34a' },
        { name:'Dica VONDER', color:'#b45309' }
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
      // grava as configurações e as metas principais
      APP_SETTINGS.TARGET = TARGET;
      APP_SETTINGS.WEEK_VIDEO_TARGET = WEEK_VIDEO_TARGET;
      localStorage.setItem('calendar_settings_v1', JSON.stringify(APP_SETTINGS));
    }

    function loadSettings(){
      const raw = localStorage.getItem('calendar_settings_v1');
      if(raw){ try{ const s = JSON.parse(raw); APP_SETTINGS = Object.assign({}, DEFAULT_SETTINGS, s||{}); if(!APP_SETTINGS.statuses || !APP_SETTINGS.statuses.length) APP_SETTINGS.statuses = DEFAULT_SETTINGS.statuses.slice(); TARGET = APP_SETTINGS.TARGET || TARGET; WEEK_VIDEO_TARGET = APP_SETTINGS.WEEK_VIDEO_TARGET || WEEK_VIDEO_TARGET; }catch(e){ APP_SETTINGS = Object.assign({}, DEFAULT_SETTINGS); } }
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
      APP_SETTINGS.networks.forEach(n=>{ const b = document.createElement('button'); b.className='btn ghost'; b.dataset.tab = n.name; b.textContent = n.name; tabs.appendChild(b); });
      // liga o clique de cada aba
      tabs.querySelectorAll('button').forEach(b=>{ b.addEventListener('click', ()=>{ tabs.querySelectorAll('button').forEach(x=>x.classList.add('ghost')); b.classList.remove('ghost'); activeTab = b.dataset.tab; render(); }); });
      // garante que a aba ativa esteja com a classe correta após reconstruir a lista
      const active = Array.from(tabs.children).find(x=>x.dataset.tab===activeTab) || tabs.children[0]; if(active){ tabs.querySelectorAll('button').forEach(x=>x.classList.add('ghost')); active.classList.remove('ghost'); }
    }

    // nome da rede cujo sub-dropdown de formatos está aberto em Configurações (persiste entre
    // re-renders, já que qualquer alteração nas configurações reconstrói a lista inteira)
    let openNetworkFormats = null;
    // nome da rede cujos campos (nome/nome curto/cor) estão em modo de edição — mesma lógica de persistência
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
      const c = $('netsContainer'); if(c){ c.innerHTML = ''; APP_SETTINGS.networks.forEach(n=>{ const lbl = document.createElement('label'); lbl.innerHTML = `<input type="checkbox" class="mNet" value="${escapeHtml(n.name)}" /> <span class="net-icon">${networkIcon(n.name)}</span>${escapeHtml(n.name)}`; c.appendChild(lbl); lbl.querySelector('input').addEventListener('change', ()=>{ renderModalFormatsUI(); refreshModalDynamic(); }); }); }
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
                <span class="dot" style="background:${n.color}"></span>
                <span class="net-view-name">${escapeHtml(n.name)}</span>
                ${n.shortName?`<span class="net-view-short">(${escapeHtml(n.shortName)})</span>`:''}
              </span>
              <div class="net-edit-fields">
                <input type="color" class="net-edit-color" value="${n.color||'#7c3aed'}" title="Cor da rede" style="flex-shrink:0" />
                <input type="text" class="net-edit-name" value="${escapeHtml(n.name)}" title="Nome da rede" style="flex:2;min-width:110px" />
                <input type="text" class="net-edit-short" value="${escapeHtml(n.shortName||'')}" maxlength="4" title="Nome curto" placeholder="Curto" style="flex:0 0 64px" />
              </div>
              <button type="button" class="net-row-formats-toggle">Formatos: ${escapeHtml(formatsSummary)} <span class="settings-caret">▾</span></button>
              <button type="button" class="btn ghost small net-edit-toggle" aria-label="Editar rede" title="Editar nome/nome curto/cor">✏️</button>
              <button type="button" class="btn ghost small net-remove-btn" aria-label="Remover rede">✕</button>
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
            item.innerHTML = `<span class="format-row-name">${escapeHtml(f.name)}</span>${meta?`<span class="format-row-meta">${escapeHtml(meta)}</span>`:''}<button type="button" class="btn ghost small net-remove-format-btn" aria-label="Remover formato">✕</button>`;
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

          // edita a cor da rede
          row.querySelector('.net-edit-color').addEventListener('change', (ev)=>{ n.color = ev.target.value; saveSettings(); renderAllDynamicUI(); render(); });
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
                <input type="color" class="ed-edit-color" value="${e.color||'#7c3aed'}" title="Cor da editoria" style="flex-shrink:0" />
                <input type="text" class="ed-edit-name" value="${escapeHtml(e.name)}" title="Nome da editoria" style="flex:2;min-width:110px" />
              </div>` +
            (hasSchedule ? `<span class="chip" style="font-size:11px" title="Repete em dias fixos">📅 ${escapeHtml(scheduleLabel)} · ${escapeHtml(channelsLabel)}</span><button type="button" class="btn ghost small" data-apply="${escapeHtml(e.name)}">Aplicar ao mês visível</button>` : '') +
            `<button type="button" class="net-row-formats-toggle ed-schedule-toggle">${hasSchedule?'Editar datas/formatos':'+ Datas e formatos'} <span class="settings-caret">▾</span></button>
              <button type="button" class="btn ghost small ed-edit-toggle" aria-label="Editar editoria" title="Editar nome/cor">✏️</button>
              <button type="button" class="btn ghost small" data-editoria="${escapeHtml(e.name)}" aria-label="Remover editoria">✕</button>
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

    // preenche o Formato do modal de criar/editar postagem, com base na(s) rede(s) marcada(s)
    // (cada rede tem seu próprio conjunto — ex: Reels só aparece se Instagram estiver marcado)
    function renderModalFormatsUI(){
      const container = $('mPlacesContainer'); if(!container) return;
      const selectedNets = Array.from(document.querySelectorAll('.mNet:checked')).map(n=>n.value);
      const formats = formatsForNetworks(selectedNets);
      const prevChecked = Array.from(container.querySelectorAll('input:checked')).map(el=>el.value);
      container.innerHTML = '';
      if(formats.length===0){
        container.innerHTML = `<span style="font-size:12px;color:var(--text-faint)">Selecione uma rede para ver os formatos disponíveis</span>`;
      } else {
        formats.forEach(f=>{
          const lbl = document.createElement('label'); lbl.className='chip';
          const dims = (f.width && f.height) ? `${f.width}×${f.height}px` : '';
          const exts = (f.extensions||[]).join(', ');
          const meta = [dims, exts].filter(Boolean).join(' · ');
          lbl.title = meta;
          lbl.innerHTML = `<input type="checkbox" name="mPlace" value="${escapeHtml(f.name)}" ${prevChecked.includes(f.name)?'checked':''} /> ${FORMAT_ICONS[f.name]||''} ${escapeHtml(f.name)}`;
          lbl.querySelector('input').addEventListener('change', refreshModalDynamic);
          container.appendChild(lbl);
        });
      }
      refreshModalDynamic();
    }

    function renderStatusUI(){
      const m = $('mStatusContainer'); if(m){ m.innerHTML=''; APP_SETTINGS.statuses.forEach((s,i)=>{ const lbl=document.createElement('label'); lbl.className='chip'; lbl.innerHTML = `<input type="radio" name="mStatus" value="${escapeHtml(s.name)}" ${i===0?'checked':''} /> <span class="dot" style="background:${s.color}"></span>${escapeHtml(s.name)}`; m.appendChild(lbl); lbl.querySelector('input').addEventListener('change', refreshModalDynamic); }); }
      const fc = $('filterStatusContainer'); if(fc){ fc.innerHTML=''; APP_SETTINGS.statuses.forEach(s=>{ const lbl=document.createElement('label'); lbl.className='chip'; lbl.innerHTML = `<input type="checkbox" class="fStatus" value="${escapeHtml(s.name)}" /> <span class="dot" style="background:${s.color}"></span>${escapeHtml(s.name)}`; fc.appendChild(lbl); }); }
      const bs = $('bStatusSelect'); if(bs){ bs.innerHTML = '<option value="">Manter</option>' + APP_SETTINGS.statuses.map(s=>`<option value="${escapeHtml(s.name)}">${escapeHtml(s.name)}</option>`).join(''); }
      const list = $('statusesList'); if(list){ list.innerHTML=''; APP_SETTINGS.statuses.forEach(s=>{ const chip=document.createElement('span'); chip.className='chip'; chip.style.display='inline-flex'; chip.innerHTML = `<span class="dot" style="background:${s.color}"></span>${escapeHtml(s.name)} <button class="btn ghost small" data-status="${escapeHtml(s.name)}" style="margin-left:8px" aria-label="Remover status">✕</button>`; list.appendChild(chip); }); list.querySelectorAll('button[data-status]').forEach(bt=> bt.addEventListener('click', ()=>{ const v=bt.dataset.status; APP_SETTINGS.statuses = APP_SETTINGS.statuses.filter(x=>x.name!==v); saveSettings(); renderAllDynamicUI(); })); }
    }

    function renderCatalogUI(){
      const list = $('catalogList'); if(!list) return;
      list.innerHTML = '';
      (APP_SETTINGS.catalog||[]).forEach(item=>{
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 6px;border:1px solid var(--border);border-radius:8px;font-size:12px';
        row.innerHTML = `<img src="${productImageUrl(item.code)}" alt="" referrerpolicy="no-referrer" style="width:24px;height:24px;object-fit:contain;border-radius:4px;background:#fff;border:1px solid var(--border);flex-shrink:0" onerror="this.style.visibility='hidden'" /><span style="color:var(--muted);flex-shrink:0;min-width:110px">${escapeHtml(item.code)}</span><span style="flex:1">${escapeHtml(item.name)}</span><button class="btn ghost small" data-catalog="${escapeHtml(item.code)}" aria-label="Remover produto">✕</button>`;
        list.appendChild(row);
      });
      list.querySelectorAll('button[data-catalog]').forEach(bt=> bt.addEventListener('click', ()=>{ const v=bt.dataset.catalog; APP_SETTINGS.catalog = (APP_SETTINGS.catalog||[]).filter(x=>x.code!==v); saveSettings(); renderCatalogUI(); }));
    }

    // reconstrói toda a UI dependente das configurações, de uma vez
    function renderAllDynamicUI(){ renderTabs(); renderNetsUI(); renderEditoriasUI(); renderPlacesUI(); renderStatusUI(); renderCatalogUI(); }

    // ============================================================
    // MODAL DE CONFIGURAÇÕES — abrir, fechar e salvar as metas
    // ============================================================
    function openSettings(){
      $('sTarget').value = TARGET;
      $('sWeekVideos').value = WEEK_VIDEO_TARGET;
      $('settingsBackdrop').style.display = 'flex';
    }

    function closeSettings(){ $('settingsBackdrop').style.display = 'none'; }

    function saveSettingsHandler(){
      const t = parseInt($('sTarget').value,10) || TARGET;
      const w = parseInt($('sWeekVideos').value,10) || WEEK_VIDEO_TARGET;
      TARGET = t; WEEK_VIDEO_TARGET = w;
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
      document.querySelectorAll('input[name="mStatus"]').forEach(el=>{ el.checked = (el.value === (post.status || (APP_SETTINGS.statuses[0] && APP_SETTINGS.statuses[0].name))); });
      $('mNotes').value = post.notes || '';
      $('mBriefingLink').value = post.briefingLink || '';
      $('mReferencesLink').value = post.referencesLink || '';
      $('mArtsLink').value = post.artsLink || '';
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
      $('mCollab').checked = !!post.collab;
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
      $('mCollab').checked = false;
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

    // aplica uma ação e retorna a ação inversa correspondente (não usada atualmente pelo fluxo principal, mantida como utilitária)
    function doAction(action, pushingInverse=true){
      if(action.type==='move'){
        const post = state.posts.find(p=>p.id===action.id);
        if(!post) return null;
        const from = post.date;
        post.date = action.to;
        saveState();
        buildCalendar(); render();
        return { type:'move', id:action.id, from:action.to, to:from };
      }
      if(action.type==='create'){
        // action.posts pode conter objetos completos de post ou apenas ids (dependendo
        // de quem empilhou a ação); aqui só tratamos o caso de objetos completos
        if(action.posts && action.posts.length && typeof action.posts[0] === 'object'){
          action.posts.forEach(p=> state.posts.push(p));
          saveState(); buildCalendar(); render();
          return { type:'delete', ids: action.posts.map(p=>p.id), posts: action.posts };
        }
        return null;
      }
      if(action.type==='delete'){
        // remove as postagens pelos ids informados
        const removed = [];
        action.ids.forEach(id=>{
          const idx = state.posts.findIndex(p=>p.id===id);
          if(idx>-1) removed.push(state.posts.splice(idx,1)[0]);
        });
        saveState(); buildCalendar(); render();
        return { type:'create', posts: removed };
      }
      return null;
    }

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
      viewDate.setMonth(viewDate.getMonth()-1); buildCalendar(); render();
    });
    document.getElementById('nextMonth').addEventListener('click', ()=>{
      if($('monthYearPicker').classList.contains('open')){ stepPickerYear(1); return; }
      viewDate.setMonth(viewDate.getMonth()+1); buildCalendar(); render();
    });
    // popover de seleção rápida de mês dentro do ano
    $('monthLabel').addEventListener('click', (ev)=>{ ev.stopPropagation(); toggleMonthYearPicker(); });
    $('monthYearPicker').addEventListener('click', ev=> ev.stopPropagation());
    document.addEventListener('click', ()=> closeMonthYearPicker());
    document.addEventListener('keydown', ev=>{ if(ev.key==='Escape') closeMonthYearPicker(); });
    document.querySelectorAll('#viewToggle button').forEach(b=> b.addEventListener('click', ()=> setView(b.dataset.view)));
    if($('addStatusBtn')) $('addStatusBtn').addEventListener('click', ()=>{ const v=$('newStatusInput').value.trim(); if(!v) return; const c = $('newStatusColor') ? $('newStatusColor').value : '#7c3aed'; APP_SETTINGS.statuses.push({name:v, color:c}); $('newStatusInput').value=''; saveSettings(); renderAllDynamicUI(); });
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
    if($('mArtsLink')) $('mArtsLink').addEventListener('input', refreshModalDynamic);
    if($('mReferencesLink')) $('mReferencesLink').addEventListener('input', refreshModalDynamic);
    // botão de copiar o texto da pré-visualização do briefing — feedback visual rápido (✓) no
    // próprio ícone, sem precisar de alert/toast
    if($('mCopyBriefingBtn')) $('mCopyBriefingBtn').addEventListener('click', ()=>{
      const btn = $('mCopyBriefingBtn');
      if(!currentBriefingText){ return; }
      copyTextToClipboard(currentBriefingText).then(()=>{
        const original = btn.textContent;
        btn.textContent = '✓';
        setTimeout(()=>{ btn.textContent = original; }, 1200);
      });
    });
    document.querySelectorAll('input[name="mType"]').forEach(el=> el.addEventListener('change', refreshModalDynamic));
    if($('mCollab')) $('mCollab').addEventListener('change', refreshModalDynamic);
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
    // IMPORTAÇÃO DE BRIEFING — aceita arquivos .csv, .json ou .docx
    // (tabela) e cria uma postagem para cada combinação de rede/formato
    // ============================================================
    $('importBriefingBtn').addEventListener('click', ()=>{
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.csv,application/json,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx';
      input.onchange = e => {
        const f = e.target.files[0]; if(!f) return;
        // arquivos .docx têm um fluxo de leitura próprio (via mammoth)
        if(f.name.toLowerCase().endsWith('.docx')){ handleDocxFile(f); return; }
        const r = new FileReader();
        r.onload = ev => {
          try{
            const txt = ev.target.result;
            if(f.name.toLowerCase().endsWith('.csv')) parseBriefingCSV(txt);
            else if(f.name.toLowerCase().endsWith('.json')){ const rows = JSON.parse(txt); importBriefingRows(rows); }
            else { alert('Formato não reconhecido. Para .docx selecione o arquivo .docx diretamente — o import irá processá-lo.'); }
          }catch(err){ alert('Arquivo de briefing inválido'); console.error(err); }
        };
        r.readAsText(f);
      };
      input.click();
    });

    // carrega um script externo uma única vez (usado para a biblioteca mammoth via CDN)
    function loadScriptOnce(url){
      return new Promise((resolve,reject)=>{
        if(document.querySelector(`script[src="${url}"]`)) return resolve();
        const s = document.createElement('script'); s.src = url; s.onload = ()=>resolve(); s.onerror = ()=>reject(new Error('Failed to load '+url)); document.head.appendChild(s);
      });
    }

    // converte um .docx de briefing (com uma tabela) em linhas importáveis
    async function handleDocxFile(file){
      try{
        // carrega a mammoth via CDN (faz o unzip/processamento do .docx)
        await loadScriptOnce('https://cdn.jsdelivr.net/npm/mammoth/mammoth.browser.min.js');
        const arr = await file.arrayBuffer();
        const result = await mammoth.convertToHtml({arrayBuffer: arr});
        const html = result.value;
        // interpreta o HTML resultante e extrai a primeira tabela encontrada
        const parser = new DOMParser();
        const doc = parser.parseFromString(html,'text/html');
        const table = doc.querySelector('table');
        if(!table){ alert('Arquivo .docx processado, mas não foi encontrada tabela no documento. Coloque os briefings em tabela no Word.'); return; }
        const rows = [];
        const trs = Array.from(table.querySelectorAll('tr'));
        if(trs.length<2){ alert('Tabela do briefing não contém linhas suficientes (cabeçalho + dados).'); return; }
        const headers = Array.from(trs[0].querySelectorAll('td,th')).map(h=>h.textContent.trim());
        trs.slice(1).forEach(tr=>{
          const cols = Array.from(tr.querySelectorAll('td,th')).map(td=>td.textContent.trim());
          const obj = {};
          headers.forEach((h,i)=> obj[h] = cols[i] || '');
          rows.push(obj);
        });
        importBriefingRows(rows);
      }catch(err){ console.error(err); alert('Erro ao processar .docx: '+err.message); }
    }

    // listener vazio, reservado para um futuro tratamento de "colar" arquivo .docx
    document.addEventListener('paste', ()=>{});

    // divide uma linha CSV em colunas, respeitando vírgulas dentro de aspas
    function splitCsvLine(line){
      const parts = line.split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/);
      return parts.map(p=>{ p = p.trim(); if(p.startsWith('"') && p.endsWith('"')) p = p.slice(1,-1).replace(/""/g,'"'); return p; });
    }

    // faz o parse de um arquivo CSV de briefing e importa suas linhas
    function parseBriefingCSV(text){
      const lines = text.split(/\r?\n/).filter(l=>l.trim().length>0);
      if(lines.length<2){ alert('CSV vazio ou inválido'); return; }
      const headers = splitCsvLine(lines[0]).map(h=>h.trim());
      const rows = lines.slice(1).map(l=>{
        const cols = splitCsvLine(l);
        const obj = {};
        headers.forEach((h,i)=> obj[h] = cols[i] || '');
        return obj;
      });
      importBriefingRows(rows);
    }

    // cria postagens a partir das linhas do briefing (uma por combinação de rede x formato)
    function importBriefingRows(rows){
      // rows: array de objetos com chaves como Date,Title,Channel,Place,Editoria,ProductCode,ProductName,Type,Status,Collab,Notes
      const created = [];
      // mantém a ordem de leitura do arquivo dentro de cada dia (soma-se ao que já existir no calendário)
      const orderCounters = {};
      function nextImportOrder(date){ if(!(date in orderCounters)) orderCounters[date] = nextOrderForDate(date); return orderCounters[date]++; }
      rows.forEach(r=>{
        const date = r.Date || r.date || r.DATA || '';
        if(!date) return;
        const title = r.Title || r.title || r.Titulo || r.Título || '';
        const channels = (r.Channel||r.channel||r.Channeles||r.Channels||'').split(/[|,;]+/).map(s=>s.trim()).filter(Boolean) || ['Instagram'];
        const places = (r.Place||r.place||'').split(/[|,;]+/).map(s=>s.trim()).filter(Boolean);
        const editorias = (r.Editoria||r.editoria||r.Category||'').split(/[|,;]+/).map(s=>s.trim()).filter(Boolean);
        const productCodes = (r.ProductCode||r.productCode||r.Codigo||r.Código||'').split('|').map(s=>s.trim()).filter(Boolean);
        const productNames = (r.ProductName||r.productName||r.Produto||r.Product||'').split('|').map(s=>s.trim()).filter(Boolean);
        const products = [];
        for(let i=0;i<Math.max(productCodes.length, productNames.length);i++){ products.push({ code: productCodes[i]||'', name: productNames[i]||'' }); }
        const type = r.Type||r.type||'Static';
        const status = r.Status||r.status||((APP_SETTINGS.statuses[0]&&APP_SETTINGS.statuses[0].name)||'Rascunho');
        const collab = (String(r.Collab||r.collab||'').toLowerCase()==='true');
        const notes = r.Notes||r.notes||r.Observacoes||'';
        channels.forEach(ch=>{
          if(places.length>0){ places.forEach(pl=>{ const p = { id: generateId(), title, date, channel: ch, place: pl, type, status, notes, collab, color:null, editoria: editorias, products: products.slice(), order: nextImportOrder(date) }; state.posts.push(p); created.push(p); }); }
          else { const p = { id: generateId(), title, date, channel: ch, place: 'Feed', type, status, notes, collab, color:null, editoria: editorias, products: products.slice(), order: nextImportOrder(date) }; state.posts.push(p); created.push(p); }
        });
      });
      if(created.length>0){ saveState(); buildCalendar(); render(); pushUndo({ type:'create', posts: created.map(p=>p.id) }); redoStack = []; alert(`Importados ${created.length} posts do briefing.`); }
      else alert('Nenhum post importado do briefing.');
    }
    // ============================================================
    // LIGAÇÃO DOS DEMAIS BOTÕES DA TOOLBAR (exportar, seleção,
    // lote, filtros) E FECHAMENTO DOS MODAIS
    // ============================================================
    const _exportCsvBtn = $('exportCsvBtn'); if(_exportCsvBtn) _exportCsvBtn.addEventListener('click', exportCSV);
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
      filters.statuses = Array.from(document.querySelectorAll('.fStatus:checked')).map(x=>x.value);
      const coll = document.querySelector('input[name="fCollab"]:checked'); filters.collab = coll?coll.value:'any';
      $('filtersBackdrop').style.display='none'; buildCalendar(); render();
    });
    if($('clearFilters')) $('clearFilters').addEventListener('click', ()=>{
      document.querySelectorAll('.fEditoria').forEach(x=>x.checked=false);
      document.querySelectorAll('.fPlace').forEach(x=>x.checked=false);
      document.querySelectorAll('.fType').forEach(x=>x.checked=false);
      document.querySelectorAll('.fStatus').forEach(x=>x.checked=false);
      const any = document.querySelector('input[name="fCollab"][value="any"]'); if(any) any.checked = true;
      filters.editorias = []; filters.places = []; filters.types = []; filters.statuses = []; filters.collab='any'; $('filtersBackdrop').style.display='none'; buildCalendar(); render();
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
    // liga os botões de "Adicionar" das listas de configurações
    if($('addNetBtn')) $('addNetBtn').addEventListener('click', ()=>{
      const v=$('newNetInput').value.trim(); if(!v) return;
      const c = $('newNetColor') ? $('newNetColor').value : '#7c3aed';
      const shortV = $('newNetShort') ? $('newNetShort').value.trim() : '';
      APP_SETTINGS.networks.push({ name:v, shortName: shortV || v.slice(0,2).toUpperCase(), color:c, formats:[] });
      $('newNetInput').value=''; if($('newNetShort')) $('newNetShort').value='';
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
      const entry = { name: v, color: $('newEditoriaColor') ? $('newEditoriaColor').value : '#7c3aed' };
      const scheduleValue = newEditoriaScheduleEditor ? newEditoriaScheduleEditor.getValue() : null;
      if(scheduleValue) entry.schedule = scheduleValue;
      APP_SETTINGS.editorias.push(entry);
      saveSettings(); renderAllDynamicUI();
      closeNewEditoriaForm();
    });
    loadState();
    // monta o calendário e, se ainda não houver nenhuma postagem, cria exemplos de demonstração
    buildCalendar();
    if(state.posts.length===0){
      state.posts.push({ id: generateId(), title: 'Campanha: Lançamento Comunidade', date: '2026-08-18', channel: 'Instagram', color:'#7c3aed', status:'Aprovado', editoria:['Lançamentos'], place:'Feed', type:'Static' });
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
