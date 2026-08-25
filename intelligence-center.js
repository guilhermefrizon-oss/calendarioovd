    // ============================================================
    // HELPERS BÁSICOS (mesmos padrões de app.js, arquivo independente)
    // ============================================================
    const $ = id => document.getElementById(id);
    function generateId(){ return 'intel-' + Math.random().toString(36).slice(2,9) + Date.now().toString(36).slice(-4); }
    function escapeHtml(s){ return String(s||'').replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
    const MAX_FILE_BYTES = 15 * 1024 * 1024;

    // ============================================================
    // TEMA (claro/escuro) e cor de destaque já vêm aplicados pelo portal-shell.js (primeiro
    // script da página, com acesso à marca ativa e ao tema Personalizado) — nada a fazer aqui.
    // ============================================================
    // usada fora de tema, em averageColorFromCanvas mais adiante
    function rgbToHex(r,g,b){
      return '#'+[r,g,b].map(v=> Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');
    }

    // ============================================================
    // ÍCONES — mesmo padrão de app.js (SVG outline, herda currentColor)
    // ============================================================
    function svgIcon(paths, size){
      return `<svg width="${size||14}" height="${size||14}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
    }
    const UI_ICONS = {
      x: (s)=> svgIcon('<path d="M18 6 6 18"/><path d="M6 6l12 12"/>', s),
      file: (s)=> svgIcon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>', s),
      film: (s)=> svgIcon('<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M10.5 9.5l5 2.5-5 2.5v-5z" fill="currentColor" stroke="none"/>', s)
    };

    // ============================================================
    // LISTA DE EDITORIAS — o calendário (app.js) é quem edita essa lista, em Configurações;
    // aqui só lemos, direto da mesma chave de localStorage, sem depender de app.js
    // ============================================================
    const BRAND_SUFFIX = (window.PortalBrand && window.PortalBrand.suffix) || '';
    const CALENDAR_SETTINGS_KEY = 'calendar_settings_v1' + BRAND_SUFFIX;
    // editorias são exclusivas de cada marca (ver app.js, EDITORIAS_BY_BRAND) — este fallback
    // só entra quando a marca ainda não tem configurações salvas. Trend e Personalizado são
    // universais (toda marca tem as duas, cada uma com sua própria cópia independente); as
    // demais só existem pra marca que as tem listada, e uma marca sem entrada aqui cai só
    // nas universais até ter suas próprias editorias cadastradas
    const UNIVERSAL_FALLBACK_EDITORIAS = [
      { name:'Trend', color:'#db2777' },
      { name:'Personalizado', color:'#64748b' }
    ];
    const FALLBACK_EDITORIAS_BY_BRAND = {
      '': [
        { name:'Informativo', color:'#7c3aed' },
        { name:'Destaques', color:'#0284c7' },
        { name:'Lançamentos', color:'#16a34a' },
        { name:'Dica VONDER', color:'#b45309' }
      ],
      '__ferramentas-gerais': [
        { name:'Post E-commerce', color:'#0284c7' },
        { name:'Lançamentos', color:'#16a34a' },
        { name:'Destaques', color:'#7c3aed' },
        { name:'Blog - Conecta FG', color:'#4f46e5' },
        { name:'Datas comemorativas', color:'#db2777' }
      ],
      '__osten-ferragens': [
        { name:'Datas comemorativas', color:'#db2777' }
      ],
      '__dismatal': [
        { name:'Datas comemorativas', color:'#db2777' }
      ]
    };
    const FALLBACK_EDITORIAS = (FALLBACK_EDITORIAS_BY_BRAND[BRAND_SUFFIX] || []).concat(UNIVERSAL_FALLBACK_EDITORIAS);
    function readEditoriaList(){
      const raw = localStorage.getItem(CALENDAR_SETTINGS_KEY);
      if(!raw) return FALLBACK_EDITORIAS;
      try{
        const s = JSON.parse(raw);
        let eds = Array.isArray(s.editorias) ? s.editorias : null;
        if(!eds || !eds.length) return FALLBACK_EDITORIAS;
        eds = eds.map((e,i)=> typeof e === 'string' ? { name:e, color: FALLBACK_EDITORIAS.length ? FALLBACK_EDITORIAS[i%FALLBACK_EDITORIAS.length].color : '#64748b' } : e);
        return eds;
      }catch(e){ return FALLBACK_EDITORIAS; }
    }
    let EDITORIAS = readEditoriaList();

    // ============================================================
    // LISTA DE REDES SOCIAIS E SEUS FORMATOS — mesma fonte usada em Configurações → Redes no
    // Calendário de Postagens (app.js); aqui só lemos, pra abrir os campos de upload certos
    // pra cada rede na "Nova peça de referência"
    // ============================================================
    const FALLBACK_NETWORK_FORMATS = {
      Instagram: [{ name:'Feed', width:1080, height:1350 }, { name:'Stories', width:1080, height:1920 }, { name:'Reels', width:1080, height:1920 }],
      Facebook: [{ name:'Feed', width:1080, height:1350 }, { name:'Stories', width:1080, height:1920 }, { name:'Reels', width:1080, height:1920 }],
      LinkedIn: [{ name:'Post', width:1200, height:627 }, { name:'Artigo', width:1200, height:644 }],
      TikTok: [{ name:'Vídeo', width:1080, height:1920 }],
      Blog: [{ name:'Post', width:1200, height:630 }],
      Email: [{ name:'Email', width:600, height:800 }]
    };
    const FALLBACK_NETWORKS = Object.keys(FALLBACK_NETWORK_FORMATS).map(name=> ({ name, formats: FALLBACK_NETWORK_FORMATS[name] }));
    function readNetworkList(){
      const raw = localStorage.getItem(CALENDAR_SETTINGS_KEY);
      if(!raw) return FALLBACK_NETWORKS;
      try{
        const s = JSON.parse(raw);
        const nets = Array.isArray(s.networks) ? s.networks.filter(n=>n.name!=='Twitter') : null;
        if(!nets || !nets.length) return FALLBACK_NETWORKS;
        return nets.map(n=> ({ name:n.name, formats: (Array.isArray(n.formats) && n.formats.length) ? n.formats : (FALLBACK_NETWORK_FORMATS[n.name] || [{name:'Post'}]) }));
      }catch(e){ return FALLBACK_NETWORKS; }
    }
    let NETWORKS = readNetworkList();
    function networkFormats(networkName){
      const n = NETWORKS.find(x=> x.name===networkName);
      return n ? n.formats : [];
    }
    // ============================================================
    // MODELO E PERSISTÊNCIA DO APRENDIZADO — delegados a intelligence-data.js (IntelStore),
    // ponto único de leitura/escrita/análise, também usado pelo calendário (app.js) para ler
    // o DNA já gerado e sugerir/validar conteúdo na hora de criar uma publicação.
    // ============================================================
    let INTEL = IntelStore.readLocal();
    function saveIntel(){
      const savedLocally = IntelStore.writeLocal(INTEL);
      if(!savedLocally) setSyncStatus('Referências grandes demais para o cache local do navegador — tentando salvar só no servidor…', 'warn');
      scheduleSyncPush();
    }

    const SYNC_ENABLED = location.protocol !== 'file:';
    let syncVersion = 0;
    let syncPushTimer = null;
    function setSyncStatus(text, kind){
      const el = $('syncStatus'); if(!el) return;
      el.textContent = text;
      el.className = 'sync-status' + (kind ? ' '+kind : '');
    }
    function scheduleSyncPush(){
      if(!SYNC_ENABLED) return;
      clearTimeout(syncPushTimer);
      syncPushTimer = setTimeout(async ()=>{
        setSyncStatus('Salvando no servidor…');
        try{
          const result = await IntelStore.pushServer(INTEL, syncVersion);
          if(result.conflict){
            // server.v===null = chave ainda vazia no servidor: não apaga o aprendizado local,
            // só adota a versão e reagenda o envio pra essa cópia acabar subindo
            if(result.server.v === null){
              syncVersion = result.server.updated_at;
              scheduleSyncPush();
            } else {
              INTEL = IntelStore.normalize(result.server.v);
              IntelStore.writeLocal(INTEL);
              syncVersion = result.server.updated_at;
              renderLibrary();
              renderWorkspace();
              setSyncStatus('Atualizado com mudanças de outra pessoa', 'warn');
              alert('Outra pessoa salvou uma alteração enquanto você editava. Os dados foram atualizados com a versão mais recente do servidor — se sua última ação não aparecer, refaça-a.');
            }
          } else {
            syncVersion = result.updated_at;
            setSyncStatus('Sincronizado com o servidor', 'ok');
          }
        }catch(e){
          setSyncStatus('Falha ao salvar no servidor (ficou salvo só neste navegador)', 'warn');
        }
      }, 700);
    }
    async function syncPull(){
      if(!SYNC_ENABLED) return;
      try{
        const res = await IntelStore.fetchServer();
        if(res.v!==null && res.updated_at!==syncVersion){
          INTEL = IntelStore.normalize(res.v);
          IntelStore.writeLocal(INTEL);
          renderLibrary();
          renderWorkspace();
        }
        syncVersion = res.updated_at;
        setSyncStatus('Sincronizado com o servidor', 'ok');
      }catch(e){
        setSyncStatus('Sem conexão com o servidor — usando cópia local', 'warn');
      }
    }

    // ============================================================
    // 1. BIBLIOTECA DE EDITORIAS
    // ============================================================
    let selectedEditoria = null;

    const STATUS_LABELS = { 'sem-dados':'Sem referências', 'nao-treinado':'Inteligência não criada', 'desatualizado':'Novas referências não analisadas', 'poucas-referencias':'Poucas referências', 'treinado':'Inteligência criada' };
    const STATUS_CLASSES = { 'sem-dados':'muted', 'nao-treinado':'warn', 'desatualizado':'warn', 'poucas-referencias':'warn', 'treinado':'ok' };

    function renderLibrary(){
      const grid = $('editoriaLibraryGrid'); if(!grid) return;
      grid.innerHTML = '';
      EDITORIAS.forEach(ed=>{
        const bucket = IntelStore.getBucket(INTEL, ed.name);
        const status = IntelStore.learningStatus(bucket);
        const analyzedCount = bucket.dna ? bucket.dna.referenceCount : 0;
        const lastUpdate = bucket.dna ? new Date(bucket.dna.generatedAt).toLocaleDateString('pt-BR') : '—';
        const card = document.createElement('div');
        card.className = 'intel-editoria-card' + (selectedEditoria===ed.name ? ' active' : '');
        card.innerHTML = `
          <div class="intel-editoria-card-top">
            <span class="dot" style="background:${escapeHtml(ed.color||'#64748b')};width:12px;height:12px"></span>
            <span class="intel-editoria-card-name">${escapeHtml(ed.name)}</span>
          </div>
          <div class="intel-editoria-card-stat">${analyzedCount} referência${analyzedCount===1?'':'s'} analisada${analyzedCount===1?'':'s'}</div>
          <span class="intel-status-pill ${STATUS_CLASSES[status]}">${STATUS_LABELS[status]}</span>
          <div class="intel-editoria-card-updated">Atualizado em ${lastUpdate}</div>
        `;
        card.addEventListener('click', ()=>{
          selectedEditoria = ed.name;
          resetPieceDraft();
          $('intelPieceBriefing').value = '';
          $('intelPieceCaption').value = '';
          renderLibrary(); renderWorkspace();
        });
        grid.appendChild(card);
      });
      if(!EDITORIAS.length) grid.innerHTML = `<div class="bg-empty">Nenhuma editoria cadastrada ainda — cadastre editorias em Configurações, no Calendário de Postagens.</div>`;
    }

    // ============================================================
    // 2. ÁREA DE TREINAMENTO
    // ============================================================
    function readFileAsDataUrl(file){
      return new Promise((resolve, reject)=>{
        const reader = new FileReader();
        reader.onload = ()=> resolve(reader.result);
        reader.onerror = ()=> reject(reader.error);
        reader.readAsDataURL(file);
      });
    }
    // classifica a proporção largura×altura da imagem num rótulo simples de "formato visual"
    function classifyRatio(w, h){
      if(!w || !h) return null;
      const r = w / h;
      if(r > 1.15) return 'horizontal';
      if(r < 0.87) return 'vertical';
      return 'quadrado';
    }
    // amostra a imagem já reduzida numa grade de pontos (não pixel a pixel, só o bastante pra
    // estimar a cor média) — usada depois pra notar paleta/luminosidade recorrente entre as peças
    function averageColorFromCanvas(ctx, w, h){
      try{
        const gridW = Math.min(w, 40), gridH = Math.min(h, 40);
        const stepX = Math.max(1, Math.floor(w/gridW));
        const stepY = Math.max(1, Math.floor(h/gridH));
        const data = ctx.getImageData(0, 0, w, h).data;
        let r=0, g=0, b=0, n=0;
        for(let y=0; y<h; y+=stepY){
          for(let x=0; x<w; x+=stepX){
            const i = (y*w + x) * 4;
            r += data[i]; g += data[i+1]; b += data[i+2]; n++;
          }
        }
        if(!n) return null;
        return rgbToHex(r/n, g/n, b/n);
      }catch(e){ return null; }
    }
    // reduz a imagem antes de guardar (uma editoria acumula muitas artes ao longo do tempo —
    // guardar em resolução original em base64 estouraria a cota do localStorage rápido demais);
    // a proporção e a cor média são calculadas a partir da imagem já reduzida
    function downscaleImage(dataUrl, maxDim){
      return new Promise(resolve=>{
        const img = new Image();
        img.onload = ()=>{
          const ratio = classifyRatio(img.naturalWidth, img.naturalHeight);
          const rawRatio = (img.naturalWidth && img.naturalHeight) ? img.naturalWidth / img.naturalHeight : null;
          const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
          const w = Math.max(1, Math.round(img.naturalWidth * scale));
          const h = Math.max(1, Math.round(img.naturalHeight * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          const color = averageColorFromCanvas(ctx, w, h);
          resolve({ dataUrl: canvas.toDataURL('image/jpeg', 0.82), ratio, rawRatio, color });
        };
        img.onerror = ()=> resolve({ dataUrl, ratio:null, rawRatio:null, color:null });
        img.src = dataUrl;
      });
    }
    const RATIO_LABELS = { quadrado:'Quadrado (1:1)', vertical:'Vertical (4:5/9:16)', horizontal:'Horizontal (16:9)' };

    // ============================================================
    // LIGHTBOX — clique numa arte/vídeo de referência pra ver maior, num modal com cantos
    // arredondados e um X pra fechar
    // ============================================================
    function openLightbox(item){
      const content = $('intelLightboxContent');
      content.innerHTML = item.kind==='video'
        ? `<video src="${item.dataUrl}" controls autoplay></video>`
        : `<img src="${item.dataUrl}" alt="${escapeHtml(item.name||'')}" />`;
      $('intelLightbox').style.display = 'flex';
    }
    function closeLightbox(){
      $('intelLightbox').style.display = 'none';
      $('intelLightboxContent').innerHTML = '';
    }
    function setupLightbox(){
      $('intelLightboxClose').addEventListener('click', closeLightbox);
      $('intelLightbox').addEventListener('click', e=>{ if(e.target.id==='intelLightbox') closeLightbox(); });
      document.addEventListener('keydown', e=>{ if(e.key==='Escape') closeLightbox(); });
    }

    // ============================================================
    // "NOVA PEÇA DE REFERÊNCIA" — rascunho em memória da peça sendo montada (rede + artes por
    // formato); briefing/legenda ficam só no textarea, lidos na hora de salvar. É reiniciado a
    // cada troca de editoria ou depois de adicionar a peça.
    // ============================================================
    let pieceDraft = { network: (NETWORKS[0] && NETWORKS[0].name) || null, formats: {} };
    function resetPieceDraft(){
      pieceDraft = { network: (NETWORKS[0] && NETWORKS[0].name) || null, formats: {} };
    }

    function renderPieceNetworkSelect(){
      const sel = $('intelPieceNetwork'); if(!sel) return;
      sel.innerHTML = NETWORKS.map(n=> `<option value="${escapeHtml(n.name)}">${escapeHtml(n.name)}</option>`).join('');
      if(pieceDraft.network) sel.value = pieceDraft.network;
    }

    async function addPieceFormatFiles(formatName, fileList){
      const files = Array.from(fileList || []);
      if(!files.length) return;
      if(!pieceDraft.formats[formatName]) pieceDraft.formats[formatName] = [];
      for(const file of files){
        if(file.size > MAX_FILE_BYTES){ alert(`"${file.name}" é grande demais (máx. 15 MB) — ignorado.`); continue; }
        const isVideo = /^video\//.test(file.type);
        if(isVideo){
          const dataUrl = await readFileAsDataUrl(file);
          pieceDraft.formats[formatName].push({ id:generateId(), name:file.name, mime:file.type, size:file.size, dataUrl, addedAt:Date.now(), kind:'video', ratio:null, color:null });
        } else {
          const raw = await readFileAsDataUrl(file);
          const { dataUrl, ratio, color } = await downscaleImage(raw, 900);
          pieceDraft.formats[formatName].push({ id:generateId(), name:file.name, mime:'image/jpeg', size: Math.round(dataUrl.length*0.75), dataUrl, addedAt:Date.now(), kind:'imagem', ratio, color });
        }
      }
    }

    function findFormatSlot(formatName){
      return Array.from(document.querySelectorAll('#intelPieceFormats .intel-format-slot')).find(s=> s.dataset.formatName===formatName);
    }

    // dois layouts bem diferentes por formato: sem referência ainda, título+formato em cima e o
    // campo de arrastar/selecionar embaixo; com referência, a miniatura ao lado do título+formato
    // e o link "Substituir referência" no rodapé do card (só existe quando já há o que substituir)
    function formatSlotHtml(f){
      const items = pieceDraft.formats[f.name] || [];
      const dims = (f.width && f.height) ? `<div class="intel-format-slot-dims">(${f.width}×${f.height})</div>` : '';
      if(!items.length){
        return `
          <div class="intel-format-slot" data-format-name="${escapeHtml(f.name)}">
            <div class="intel-format-slot-header">${escapeHtml(f.name)}</div>
            ${dims}
            <label class="intel-format-empty-drop">
              <span>Arraste aqui ou clique para selecionar (mais de um arquivo = carrossel)</span>
              <input type="file" accept="image/*,video/*" multiple style="display:none" />
            </label>
          </div>
        `;
      }
      const previews = items.map((item,idx)=> `
        <div class="intel-preview-box" data-idx="${idx}">
          ${item.kind==='video' ? `<div class="intel-preview-video-badge">${UI_ICONS.film(22)}</div>` : `<img src="${item.dataUrl}" alt="" />`}
          <button type="button" class="intel-preview-remove" aria-label="Remover" title="Remover">${UI_ICONS.x(12)}</button>
        </div>
      `).join('');
      return `
        <div class="intel-format-slot" data-format-name="${escapeHtml(f.name)}">
          <div class="intel-format-slot-body">
            <div class="intel-format-previews">${previews}</div>
            <div class="intel-format-info">
              <div class="intel-format-slot-header">${escapeHtml(f.name)}</div>
              ${dims}
            </div>
          </div>
          <label class="intel-module-link">
            Substituir referência
            <input type="file" accept="image/*,video/*" multiple style="display:none" />
          </label>
        </div>
      `;
    }

    // reconstrói só o card do formato afetado (o layout muda inteiro entre vazio/preenchido, não
    // dá pra só trocar as miniaturas); "Substituir referência" sempre troca o que já estava
    // selecionado (em vez de acumular) — reflete que só se monta uma referência por vez, mas cada
    // arquivo de um carrossel ainda pode ser removido individualmente pelo X da miniatura
    function refreshFormatSlot(f){
      const old = findFormatSlot(f.name); if(!old) return;
      const wrapper = document.createElement('div');
      wrapper.innerHTML = formatSlotHtml(f).trim();
      const next = wrapper.firstElementChild;
      old.replaceWith(next);
      wireFormatSlot(next, f);
    }

    function wireFormatSlot(slot, f){
      const items = pieceDraft.formats[f.name] || [];
      const input = slot.querySelector('input[type=file]');
      input.addEventListener('change', async ()=>{
        pieceDraft.formats[f.name] = [];
        await addPieceFormatFiles(f.name, input.files);
        refreshFormatSlot(f);
      });
      ['dragenter','dragover'].forEach(evt=> slot.addEventListener(evt, e=>{ e.preventDefault(); e.stopPropagation(); slot.classList.add('dragover'); }));
      ['dragleave','dragend'].forEach(evt=> slot.addEventListener(evt, e=>{ e.preventDefault(); e.stopPropagation(); slot.classList.remove('dragover'); }));
      slot.addEventListener('drop', async e=>{
        e.preventDefault(); e.stopPropagation();
        slot.classList.remove('dragover');
        pieceDraft.formats[f.name] = [];
        await addPieceFormatFiles(f.name, e.dataTransfer && e.dataTransfer.files);
        refreshFormatSlot(f);
      });
      slot.querySelectorAll('.intel-preview-box[data-idx]').forEach(box=>{
        const idx = Number(box.dataset.idx);
        box.querySelector('.intel-preview-remove').addEventListener('click', e=>{
          e.stopPropagation();
          pieceDraft.formats[f.name].splice(idx,1);
          refreshFormatSlot(f);
        });
        box.addEventListener('click', ()=> openLightbox(items[idx]));
      });
    }

    // monta um campo de upload por formato da rede selecionada — os formatos vêm das Redes
    // cadastradas em Configurações, então mudam sozinhos conforme a rede escolhida no passo 1
    function renderPieceFormatSlots(){
      const container = $('intelPieceFormats'); if(!container) return;
      const formats = networkFormats(pieceDraft.network);
      if(!formats.length){
        container.innerHTML = `<div class="bg-empty">Nenhum formato cadastrado para esta rede — cadastre em Configurações → Redes, no Calendário de Postagens.</div>`;
        return;
      }
      container.innerHTML = formats.map(f=> formatSlotHtml(f)).join('');
      formats.forEach(f=>{
        const slot = findFormatSlot(f.name);
        if(slot) wireFormatSlot(slot, f);
      });
    }

    function fmtDate(ts){ return ts ? new Date(ts).toLocaleDateString('pt-BR') : '—'; }

    // card de uma peça já adicionada — mesma disposição de módulo usada em "Artes por formato"
    // (miniatura ao lado do título+info, "Remover" fixado no rodapé); o item mostrado na
    // miniatura é o desta peça no formato da seção em que o card está sendo listado (uma peça
    // com Feed+Stories aparece uma vez em cada uma dessas seções, com a arte correspondente)
    function pieceCardHtml(post, formatName, item){
      const formatCounts = Object.entries(post.formats||{}).filter(([,v])=> v && v.length).map(([k,v])=> `${k} (${v.length})`).join(', ');
      const tags = [formatCounts || 'sem artes', post.requestBriefing ? 'briefing' : null, post.caption ? 'legenda' : null].filter(Boolean);
      const previewHtml = item ? `
        <div class="intel-preview-box" data-piece-preview data-format-name="${escapeHtml(formatName||'')}" data-item-id="${escapeHtml(item.id)}">
          ${item.kind==='video' ? `<div class="intel-preview-video-badge">${UI_ICONS.film(22)}</div>` : `<img src="${item.dataUrl}" alt="" />`}
        </div>
      ` : `<div class="intel-preview-box intel-preview-box--empty">${UI_ICONS.file(22)}</div>`;
      return `
        <div class="intel-format-slot intel-format-slot--piece" data-piece-id="${escapeHtml(post.id)}">
          <div class="intel-format-slot-body">
            <div class="intel-format-previews">${previewHtml}</div>
            <div class="intel-format-info">
              <div class="intel-format-slot-header">${fmtDate(post.addedAt)}</div>
              <div class="intel-format-slot-dims">${tags.map(escapeHtml).join(' · ')}</div>
            </div>
          </div>
          <button type="button" class="intel-module-link">Remover</button>
        </div>
      `;
    }

    // seccionado por rede social e, dentro de cada rede, por formato — uma peça com artes em
    // mais de um formato aparece uma vez em cada seção de formato correspondente; peças sem
    // nenhuma arte (só briefing/legenda) caem numa seção "Sem artes" pra não sumir da lista
    function renderPiecesList(bucket){
      const el = $('intelPiecesList'); if(!el) return;
      const items = bucket.posts || [];
      if(!items.length){ el.innerHTML = `<div class="bg-empty">Nenhuma peça adicionada ainda.</div>`; return; }
      const ordered = items.slice().reverse();

      const byNetwork = new Map();
      ordered.forEach(post=>{
        const net = post.network || 'Rede não definida';
        if(!byNetwork.has(net)) byNetwork.set(net, []);
        byNetwork.get(net).push(post);
      });

      el.innerHTML = Array.from(byNetwork.entries()).map(([network, posts])=>{
        const byFormat = new Map();
        const semArtes = [];
        posts.forEach(post=>{
          const withItems = Object.entries(post.formats||{}).filter(([,v])=> v && v.length);
          if(!withItems.length){ semArtes.push(post); return; }
          withItems.forEach(([formatName, arr])=>{
            if(!byFormat.has(formatName)) byFormat.set(formatName, []);
            byFormat.get(formatName).push({ post, item:arr[0] });
          });
        });

        const formatGroupsHtml = Array.from(byFormat.entries()).map(([formatName, entries])=> `
          <div class="intel-pieces-format-group">
            <div class="bg-quick-insert-label">${escapeHtml(formatName)}</div>
            <div class="intel-pieces-format-stack">
              ${entries.map(({post,item})=> pieceCardHtml(post, formatName, item)).join('')}
            </div>
          </div>
        `).join('');

        const semArtesHtml = semArtes.length ? `
          <div class="intel-pieces-format-group">
            <div class="bg-quick-insert-label">Sem artes</div>
            <div class="intel-pieces-format-stack">
              ${semArtes.map(post=> pieceCardHtml(post, null, null)).join('')}
            </div>
          </div>
        ` : '';

        return `
          <div class="intel-pieces-network-section">
            <div class="intel-pieces-network-label">${escapeHtml(network)}</div>
            <div class="intel-pieces-format-rowset">${formatGroupsHtml}${semArtesHtml}</div>
          </div>
        `;
      }).join('');

      el.querySelectorAll('.intel-format-slot[data-piece-id]').forEach(card=>{
        const post = ordered.find(p=> p.id===card.dataset.pieceId);
        const previewBox = card.querySelector('[data-piece-preview]');
        if(previewBox){
          const item = (post.formats[previewBox.dataset.formatName]||[]).find(i=> i.id===previewBox.dataset.itemId);
          if(item) previewBox.addEventListener('click', ()=> openLightbox(item));
        }
        card.querySelector('.intel-module-link').addEventListener('click', ()=>{
          bucket.posts = bucket.posts.filter(p=> p.id!==post.id);
          saveIntel(); renderLibrary(); renderPiecesList(bucket); renderPieceFormatSlots();
        });
      });
    }

    function renderTrainingPanel(bucket){
      renderPieceNetworkSelect();
      renderPieceFormatSlots();
      renderPiecesList(bucket);
      $('intelInstructionsNotes').value = bucket.instructions || '';
      const n = IntelStore.referenceCount(bucket);
      let hint = n===0 ? 'Envie ao menos uma referência para poder criar a inteligência.' : (n<3 ? `${n} referência${n===1?'':'s'} enviada${n===1?'':'s'} — quanto mais referências, mais confiável fica o DNA.` : '');
      $('intelAnalyzeHint').textContent = hint;
      $('intelAnalyzeBtn').textContent = bucket.dna ? 'Atualizar inteligência' : 'Criar inteligência da editoria';
      $('intelAnalyzeBtn').disabled = false;
    }

    function setupTrainingHandlers(){
      $('intelPieceNetwork').addEventListener('change', ()=>{
        const newNetwork = $('intelPieceNetwork').value;
        const allowedFormats = networkFormats(newNetwork).map(f=> f.name);
        // mantém os uploads já feitos nos formatos que também existem na rede nova (ex: Feed
        // existe tanto em Instagram quanto em Facebook); descarta só o que não existe mais
        const kept = {};
        Object.keys(pieceDraft.formats).forEach(k=>{ if(allowedFormats.includes(k)) kept[k] = pieceDraft.formats[k]; });
        pieceDraft.formats = kept;
        pieceDraft.network = newNetwork;
        renderPieceFormatSlots();
      });

      $('intelPieceAdd').addEventListener('click', ()=>{
        if(!selectedEditoria) return;
        const briefing = $('intelPieceBriefing').value.trim();
        const caption = $('intelPieceCaption').value.trim();
        const hasAnyFile = Object.values(pieceDraft.formats).some(arr=> arr && arr.length);
        if(!hasAnyFile && !briefing && !caption){ alert('Preencha ao menos o briefing, uma arte ou a legenda antes de adicionar a peça.'); return; }
        const bucket = IntelStore.getBucket(INTEL, selectedEditoria);
        bucket.posts.push({ id:generateId(), network:pieceDraft.network, requestBriefing:briefing, caption, formats:pieceDraft.formats, addedAt:Date.now() });
        resetPieceDraft();
        $('intelPieceBriefing').value = '';
        $('intelPieceCaption').value = '';
        saveIntel(); renderLibrary(); renderTrainingPanel(bucket);
      });

      $('intelInstructionsNotes').addEventListener('change', ()=>{
        if(!selectedEditoria) return;
        const bucket = IntelStore.getBucket(INTEL, selectedEditoria);
        bucket.instructions = $('intelInstructionsNotes').value.trim();
        saveIntel();
      });

      $('intelAnalyzeBtn').addEventListener('click', ()=>{
        if(!selectedEditoria) return;
        const bucket = IntelStore.getBucket(INTEL, selectedEditoria);
        if(IntelStore.referenceCount(bucket)===0){ alert('Adicione ao menos uma peça de referência (com arte, briefing ou legenda) antes de analisar.'); return; }

        bucket.dna = IntelStore.generateDNA(bucket);
        IntelStore.recordDnaGeneration(bucket);
        saveIntel();
        renderLibrary();
        renderWorkspace();
        switchIntelTab('intelPanelDna');
      });
    }

    // ============================================================
    // 3. DNA DA EDITORIA
    // ============================================================
    function chipsHtml(items){
      if(!items || !items.length) return `<span class="bg-empty" style="padding:0">Nenhum identificado ainda.</span>`;
      return items.map(t=> `<span class="chip" style="cursor:default">${escapeHtml(t)}</span>`).join('');
    }
    // mensagem de "não identificado" explica a causa mais provável em vez de um genérico
    // "envie mais referências" — cada bloco depende de uma fonte diferente de referência
    const NOT_IDENTIFIED_STRATEGY = 'Ainda não identificado — adicione legendas, briefings ou orientações adicionais com texto para a IA identificar isso.';
    const NOT_IDENTIFIED_CAPTION = 'Ainda não identificado — adicione legendas para a IA identificar isso (briefings não entram aqui, só o texto realmente publicado).';
    const NOT_IDENTIFIED_VISUAL = 'Ainda não identificado — envie artes, carrosséis ou vídeos para a IA analisar.';
    const CONFIDENCE_CLASSES = { 'Alta':'ok', 'Média':'warn', 'Baixa':'muted' };
    // "entry" é o formato { value, confidence, count } devolvido por IntelStore.withConfidence
    function confidencePillHtml(entry){
      if(!entry || !entry.confidence) return '';
      const cls = CONFIDENCE_CLASSES[entry.confidence] || 'muted';
      return ` <span class="intel-status-pill ${cls}" style="margin-left:6px;text-transform:none;letter-spacing:0">${escapeHtml(entry.confidence)} confiança · ${entry.count} ref.</span>`;
    }
    function renderConfEntry(elId, entry, fallback){
      const el = $(elId); if(!el) return;
      if(!entry || entry.value===null || entry.value===undefined){
        el.innerHTML = `<span style="color:var(--text-faint)">${fallback || NOT_IDENTIFIED_TEXT}</span>`;
        return;
      }
      const text = Array.isArray(entry.value) ? chipsHtml(entry.value) : escapeHtml(entry.value);
      el.innerHTML = text + confidencePillHtml(entry);
    }
    function renderDnaPanel(bucket){
      const dna = bucket.dna;
      const empty = $('intelDnaEmpty'), content = $('intelDnaContent');
      if(!dna){ empty.style.display = 'block'; content.style.display = 'none'; return; }
      empty.style.display = 'none'; content.style.display = 'block';
      $('intelDnaMeta').textContent = `Gerado em ${new Date(dna.generatedAt).toLocaleString('pt-BR')} · a partir de ${dna.referenceCount} referência${dna.referenceCount===1?'':'s'}`;

      const instrEl = $('intelDnaUserInstructions');
      if(dna.userInstructions){ instrEl.style.display = 'block'; instrEl.textContent = `Orientações informadas: ${dna.userInstructions}`; }
      else instrEl.style.display = 'none';

      // Como essa editoria funciona
      renderConfEntry('intelDnaObjective', dna.howItWorks.objective, NOT_IDENTIFIED_STRATEGY);
      renderConfEntry('intelDnaAudience', dna.howItWorks.audience, NOT_IDENTIFIED_STRATEGY);

      // Como a marca comunica
      renderConfEntry('intelDnaTone', dna.howBrandCommunicates.tone, NOT_IDENTIFIED_CAPTION);
      renderConfEntry('intelDnaLanguage', dna.howBrandCommunicates.language, NOT_IDENTIFIED_CAPTION);

      // Padrões visuais identificados
      renderConfEntry('intelDnaPresentation', dna.visualStrategy.presentation, NOT_IDENTIFIED_VISUAL);
      renderConfEntry('intelDnaVisualStyle', dna.visualStrategy.style, NOT_IDENTIFIED_VISUAL);
      renderConfEntry('intelDnaComposition', dna.visualStrategy.composition, NOT_IDENTIFIED_VISUAL);
      renderConfEntry('intelDnaRecurringVisual', dna.visualStrategy.recurring, NOT_IDENTIFIED_VISUAL);
      renderConfEntry('intelDnaHierarchy', dna.visualStrategy.hierarchy, NOT_IDENTIFIED_VISUAL);

      // Padrões de conteúdo identificados
      const structureEntry = dna.contentStrategy.textStructure;
      $('intelDnaTextStructureConf').innerHTML = confidencePillHtml(structureEntry);
      $('intelDnaTextStructure').innerHTML = structureEntry.value
        ? structureEntry.value.map(r=> `<li>${escapeHtml(r)}</li>`).join('')
        : `<li style="border:0;background:transparent;padding:2px 0;color:var(--text-faint)">${NOT_IDENTIFIED_CAPTION}</li>`;
      renderConfEntry('intelDnaOpeningTypes', dna.contentStrategy.openingTypes, NOT_IDENTIFIED_CAPTION);
      renderConfEntry('intelDnaCtaFormats', dna.contentStrategy.ctaFormats, NOT_IDENTIFIED_CAPTION);

      // Modelos recomendados
      const modelsEl = $('intelDnaContentModels');
      if(!dna.contentModels.length){
        modelsEl.innerHTML = `<div class="bg-empty">Nenhum modelo reutilizável identificado ainda — adicione mais legendas para a IA encontrar um padrão.</div>`;
      } else {
        modelsEl.innerHTML = dna.contentModels.map((m,i)=> `
          <div class="bg-list-row" style="cursor:default">
            <div class="bg-list-row-main">
              <div class="bg-list-row-title">Modelo ${i+1}: ${escapeHtml(m.pattern)}</div>
              <div class="bg-list-row-sub">Identificado em ${m.count} legenda${m.count===1?'':'s'} · confiança ${escapeHtml(m.confidence||'Baixa')}</div>
            </div>
          </div>
        `).join('');
      }
    }

    // ============================================================
    // 4. HISTÓRICO DE ATUALIZAÇÃO DA INTELIGÊNCIA — quando o DNA foi (re)gerado ao longo do
    // tempo; a visão ao vivo das próprias peças (rede, briefing, artes por formato e legenda)
    // fica dentro de "Artes por formato", já que só dá pra montar uma peça nova por vez
    // ============================================================
    function renderRefsPanel(bucket){
      const dna = bucket.dna;
      const empty = $('intelRefsEmpty'), content = $('intelRefsContent');
      if(!dna){ empty.style.display = 'block'; content.style.display = 'none'; return; }
      empty.style.display = 'none'; content.style.display = 'block';

      $('intelRefsMeta').textContent = `${dna.referenceCount} referência${dna.referenceCount===1?'':'s'} usada${dna.referenceCount===1?'':'s'} na última criação/atualização, em ${new Date(dna.generatedAt).toLocaleString('pt-BR')}`;

      const historyEl = $('intelRefsHistory');
      const history = (bucket.dnaHistory || []).slice().reverse();
      if(!history.length){
        historyEl.innerHTML = `<div class="bg-empty">Sem histórico de atualização ainda.</div>`;
      } else {
        historyEl.innerHTML = history.map(h=> `
          <div class="bg-list-row" style="cursor:default">
            <div class="bg-list-row-main">
              <div class="bg-list-row-title">${new Date(h.generatedAt).toLocaleString('pt-BR')}</div>
              <div class="bg-list-row-sub">${h.referenceCount} referência${h.referenceCount===1?'':'s'} analisada${h.referenceCount===1?'':'s'}</div>
            </div>
          </div>
        `).join('');
      }
    }

    // ============================================================
    // 5. VALIDAÇÃO INTELIGENTE (testar publicação)
    // ============================================================
    function scoreColor(score){
      if(score===null) return 'var(--text-faint)';
      if(score>=70) return 'var(--success)';
      if(score>=45) return 'var(--accent-ink)';
      return 'var(--danger)';
    }
    function renderTestResult(result){
      const el = $('intelTestResult');
      if(result.score===null){
        el.innerHTML = `<div class="bg-inline-warning" style="margin-top:14px">${escapeHtml(result.improvements[0])}</div>`;
        return;
      }
      const color = scoreColor(result.score);
      el.innerHTML = `
        <div class="intel-adherence" style="margin-top:16px">
          <div class="intel-adherence-header">
            <span>Nível de aderência</span>
            <span style="color:${color};font-weight:900">${result.score}%</span>
          </div>
          <div class="intel-score-bar"><div class="intel-score-bar-fill" style="width:${result.score}%;background:${color}"></div></div>
          ${result.mainConcept ? `<div class="intel-main-concept"><b>Conceito principal:</b> ${escapeHtml(result.mainConcept)}</div>` : ''}
        </div>
        <div class="form-group" style="margin-top:14px">
          <h3 class="fg-label">Pontos fortes</h3>
          <ul class="intel-rule-list intel-rule-list--positive">${result.strengths.map(s=> `<li>${escapeHtml(s)}</li>`).join('')}</ul>
        </div>
        ${result.improvements.length ? `<div class="form-group">
          <h3 class="fg-label">Sugestões de melhoria</h3>
          <ul class="intel-rule-list intel-rule-list--warn">${result.improvements.map(s=> `<li>${escapeHtml(s)}</li>`).join('')}</ul>
        </div>` : ''}
      `;
    }
    function setupTestHandlers(){
      $('intelTestBtn').addEventListener('click', ()=>{
        if(!selectedEditoria) return;
        const bucket = IntelStore.getBucket(INTEL, selectedEditoria);
        const result = IntelStore.validatePost({ title: $('intelTestTitle').value, caption: $('intelTestCaption').value }, bucket.dna);
        renderTestResult(result);
      });
    }

    // ============================================================
    // NAVEGAÇÃO ENTRE ABAS DO WORKSPACE (mesmo padrão do menu de Configurações)
    // ============================================================
    function switchIntelTab(panelId){
      document.querySelectorAll('#intelWorkspaceBody .settings-nav-btn').forEach(b=> b.classList.toggle('active', b.dataset.panel===panelId));
      document.querySelectorAll('#intelWorkspaceBody .settings-panel').forEach(p=> p.classList.toggle('active', p.id===panelId));
    }
    function setupWorkspaceNav(){
      document.querySelectorAll('#intelWorkspaceBody .settings-nav-btn').forEach(btn=>{
        btn.addEventListener('click', ()=> switchIntelTab(btn.dataset.panel));
      });
    }

    // ============================================================
    // MONTAGEM DO WORKSPACE DA EDITORIA SELECIONADA
    // ============================================================
    function renderWorkspace(){
      const emptyEl = $('intelWorkspaceEmpty');
      const bodyEl = $('intelWorkspaceBody');
      if(!selectedEditoria){ emptyEl.style.display = 'block'; bodyEl.style.display = 'none'; return; }
      emptyEl.style.display = 'none'; bodyEl.style.display = 'block';
      const ed = EDITORIAS.find(e=> e.name===selectedEditoria);
      const bucket = IntelStore.getBucket(INTEL, selectedEditoria);
      const status = IntelStore.learningStatus(bucket);
      $('intelWorkspaceTitle').innerHTML = `<span class="dot" style="background:${escapeHtml(ed?ed.color:'#64748b')};width:12px;height:12px"></span> ${escapeHtml(selectedEditoria)}`;
      $('intelWorkspaceStatus').textContent = STATUS_LABELS[status];
      $('intelWorkspaceStatus').className = 'intel-status-pill ' + STATUS_CLASSES[status];
      renderTrainingPanel(bucket);
      renderDnaPanel(bucket);
      renderRefsPanel(bucket);
      $('intelTestTitle').value = '';
      $('intelTestCaption').value = '';
      $('intelTestResult').innerHTML = '';
    }

    // ============================================================
    // INICIALIZAÇÃO
    // ============================================================
    setupWorkspaceNav();
    setupTrainingHandlers();
    setupTestHandlers();
    setupLightbox();
    renderLibrary();
    renderWorkspace();

    if(SYNC_ENABLED){
      syncPull();
      setInterval(()=> syncPull(), 20000);
    } else {
      setSyncStatus('Salvando só neste navegador (abra pelo endereço do servidor pra sincronizar)', 'warn');
    }
