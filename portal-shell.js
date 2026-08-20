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
  // MARCA ATIVA — resolvida já no topo do arquivo, de forma síncrona
  // ============================================================
  const BRANDS_KEY = 'portal_brands_v1';
  const ACTIVE_BRAND_KEY = 'portal_active_brand_v1';
  const COLLAPSE_KEY = 'portal_sidebar_collapsed_v1';
  // a marca "default" é a base de dados que já existia antes do portal (posts/settings/guia
  // sem sufixo) — por isso ela nunca é migrada, só vira a primeira entrada da lista
  const DEFAULT_BRANDS = [{ id:'default', name:'Vonder', shortName:'VD', photo:null }];

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
  // SINCRONIZAÇÃO DA LISTA DE MARCAS (api.php?k=brands) — mesma mecânica de sync de chave
  // única que intelligence-data.js já usa pra "intel" (fetch/push/versão otimista)
  // ============================================================
  const SYNC_ENABLED = location.protocol !== 'file:';
  let syncVersion = 0;
  let syncPushTimer = null;
  async function syncFetchBrands(){
    const res = await fetch('api.php?k=brands', { cache:'no-store' });
    if(!res.ok) throw new Error('sync fetch '+res.status);
    return res.json();
  }
  async function syncPushBrands(value){
    const res = await fetch('api.php?k=brands', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ v:value, expected_updated_at: syncVersion })
    });
    const data = await res.json().catch(()=>({}));
    if(res.status===409) return { conflict:true, server:data };
    if(!res.ok) throw new Error('sync push '+res.status);
    syncVersion = data.updated_at;
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
          // outra pessoa salvou a lista de marcas primeiro: adota a versão do servidor
          BRANDS = result.server.v;
          window.PortalBrand.list = BRANDS;
          localStorage.setItem(BRANDS_KEY, JSON.stringify(BRANDS));
          syncVersion = result.server.updated_at;
          if(!brandPopoverOpen) renderBrandTrigger();
        }
      }catch(e){ /* offline — fica salvo só neste navegador, sem travar a UI */ }
    }, 700);
  }
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
    { href:'visual-editor.html', label:'Calendário de Postagens', icon:'<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>' },
    { href:'intelligence-center.html', label:'Central de Inteligência', icon:'<path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2.3h6c0-1.1.4-1.8 1-2.3A7 7 0 0 0 12 2Z"/><path d="M9 18h6"/><path d="M10 22h4"/>' }
  ];
  function currentPageFile(){
    return (location.pathname.split('/').pop() || 'visual-editor.html');
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
    `;
    renderBrandTrigger();
    renderCollapseBtn();
    applyCollapsedClass();
    $('portalBrandTrigger').addEventListener('click', ()=>{ brandPopoverOpen ? closeBrandPopover() : openBrandPopover(); });
    $('portalCollapseBtn').addEventListener('click', toggleSidebarCollapsed);
  }

  renderSidebar();

  if(SYNC_ENABLED){
    syncPullBrands();
    setInterval(syncPullBrands, 20000);
  }

})();
