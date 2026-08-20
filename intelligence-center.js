    // ============================================================
    // HELPERS BÁSICOS (mesmos padrões de app.js, arquivo independente)
    // ============================================================
    const $ = id => document.getElementById(id);
    function generateId(){ return 'intel-' + Math.random().toString(36).slice(2,9) + Date.now().toString(36).slice(-4); }
    function escapeHtml(s){ return String(s||'').replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
    function humanSize(bytes){
      if(!bytes && bytes!==0) return '';
      if(bytes < 1024) return bytes + ' B';
      if(bytes < 1024*1024) return Math.round(bytes/1024) + ' KB';
      return (bytes/1024/1024).toFixed(1) + ' MB';
    }
    const MAX_FILE_BYTES = 15 * 1024 * 1024;

    // ============================================================
    // TEMA (claro/escuro) e cor de destaque — lido das mesmas chaves de localStorage do
    // calendário para a tela manter a aparência consistente
    // ============================================================
    const THEME_KEY = 'calendar_theme_v1';
    const COLOR_THEME_KEY = 'calendar_color_theme_v1';
    const CUSTOM_COLOR_KEY = 'calendar_color_theme_custom_v1';
    const COLOR_THEMES = [
      { id:'dourado',  dark:'#F6BE00', light:'#F6BE00' },
      { id:'azul',     dark:'#2f6fed', light:'#7fb0f2' },
      { id:'cinza',    dark:'#6b6b70', light:'#a8a8ae' },
      { id:'petroleo', dark:'#3c5878', light:'#8fa8c4' },
      { id:'ardosia',  dark:'#3e4f63', light:'#8898a8' },
      { id:'esverdeado',dark:'#3f5a52', light:'#a0b4ac' },
      { id:'turquesa', dark:'#0f9488', light:'#5fd6c4' },
      { id:'verde',    dark:'#2f8a3a', light:'#8fd68a' },
      { id:'oliva',    dark:'#5a6a3a', light:'#b0c090' },
      { id:'laranja',  dark:'#d9720f', light:'#f5b878' },
      { id:'marrom',   dark:'#8a5a3a', light:'#d0ac8c' },
      { id:'vinho',    dark:'#a8264a', light:'#f0a0be' },
      { id:'rose',     dark:'#7a4650', light:'#cfa8ae' },
      { id:'magenta',  dark:'#a52a92', light:'#f0a8e4' },
      { id:'roxo',     dark:'#6a3fa0', light:'#c4a8f0' },
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
      const r=(n>>16)&255,g=(n>>8)&255,b=n&255;
      return `rgba(${r},${g},${b},${alpha})`;
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
      const ink = mode === 'dark'
        ? dark
        : (relLuminance(dark) <= 0.18 ? dark : mixHex(dark, '#000000', 0.4));
      root.setProperty('--accent-ink', ink);
    }
    document.documentElement.setAttribute('data-theme', localStorage.getItem(THEME_KEY) || 'light');
    applyColorTheme(localStorage.getItem(COLOR_THEME_KEY) || 'dourado');

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
    const FALLBACK_EDITORIAS = [
      { name:'Informativo', color:'#7c3aed' },
      { name:'Destaques', color:'#0284c7' },
      { name:'Lançamentos', color:'#16a34a' },
      { name:'Dica VONDER', color:'#b45309' },
      { name:'Trend', color:'#db2777' },
      { name:'Personalizado', color:'#64748b' }
    ];
    function readEditoriaList(){
      const raw = localStorage.getItem(CALENDAR_SETTINGS_KEY);
      if(!raw) return FALLBACK_EDITORIAS;
      try{
        const s = JSON.parse(raw);
        let eds = Array.isArray(s.editorias) ? s.editorias : null;
        if(!eds || !eds.length) return FALLBACK_EDITORIAS;
        eds = eds.map((e,i)=> typeof e === 'string' ? { name:e, color: FALLBACK_EDITORIAS[i%FALLBACK_EDITORIAS.length].color } : e);
        return eds;
      }catch(e){ return FALLBACK_EDITORIAS; }
    }
    let EDITORIAS = readEditoriaList();

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
            INTEL = IntelStore.normalize(result.server.v);
            IntelStore.writeLocal(INTEL);
            syncVersion = result.server.updated_at;
            renderLibrary();
            renderWorkspace();
            setSyncStatus('Atualizado com mudanças de outra pessoa', 'warn');
            alert('Outra pessoa salvou uma alteração enquanto você editava. Os dados foram atualizados com a versão mais recente do servidor — se sua última ação não aparecer, refaça-a.');
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

    const STATUS_LABELS = { 'sem-dados':'Sem referências', 'nao-treinado':'Não treinado', 'desatualizado':'Novas referências não analisadas', 'poucas-referencias':'Poucas referências', 'treinado':'Treinado' };
    const STATUS_CLASSES = { 'sem-dados':'muted', 'nao-treinado':'warn', 'desatualizado':'warn', 'poucas-referencias':'warn', 'treinado':'ok' };

    function renderLibrary(){
      const grid = $('editoriaLibraryGrid'); if(!grid) return;
      grid.innerHTML = '';
      EDITORIAS.forEach(ed=>{
        const bucket = IntelStore.getBucket(INTEL, ed.name);
        const status = IntelStore.learningStatus(bucket);
        const n = IntelStore.referenceCount(bucket);
        const lastUpdate = bucket.dna ? new Date(bucket.dna.generatedAt).toLocaleDateString('pt-BR') : '—';
        const card = document.createElement('div');
        card.className = 'intel-editoria-card' + (selectedEditoria===ed.name ? ' active' : '');
        card.innerHTML = `
          <div class="intel-editoria-card-top">
            <span class="dot" style="background:${escapeHtml(ed.color||'#64748b')};width:12px;height:12px"></span>
            <span class="intel-editoria-card-name">${escapeHtml(ed.name)}</span>
          </div>
          <div class="intel-editoria-card-stat">${n} referência${n===1?'':'s'} analisada${n===1?'':'s'}</div>
          <span class="intel-status-pill ${STATUS_CLASSES[status]}">${STATUS_LABELS[status]}</span>
          <div class="intel-editoria-card-updated">Atualizado em ${lastUpdate}</div>
        `;
        card.addEventListener('click', ()=>{ selectedEditoria = ed.name; renderLibrary(); renderWorkspace(); });
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
    // reduz a imagem antes de guardar (uma editoria acumula muitas artes ao longo do tempo —
    // guardar em resolução original em base64 estouraria a cota do localStorage rápido demais);
    // a proporção é calculada a partir da imagem original, antes do corte
    function downscaleImage(dataUrl, maxDim){
      return new Promise(resolve=>{
        const img = new Image();
        img.onload = ()=>{
          const ratio = classifyRatio(img.naturalWidth, img.naturalHeight);
          const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
          const w = Math.max(1, Math.round(img.naturalWidth * scale));
          const h = Math.max(1, Math.round(img.naturalHeight * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve({ dataUrl: canvas.toDataURL('image/jpeg', 0.82), ratio });
        };
        img.onerror = ()=> resolve({ dataUrl, ratio:null });
        img.src = dataUrl;
      });
    }
    const RATIO_LABELS = { quadrado:'Quadrado (1:1)', vertical:'Vertical (4:5/9:16)', horizontal:'Horizontal (16:9)' };
    const VISUAL_TAG_LABELS = { realUse:'Produto em uso real', lowText:'Pouco texto', visibleCta:'CTA visível', recurringElement:'Elemento recorrente' };

    function renderVisualsList(bucket){
      const el = $('intelVisualsList'); if(!el) return;
      const items = bucket.references.visuals;
      el.innerHTML = '';
      if(!items.length){ el.innerHTML = `<div class="bg-empty">Nenhuma arte enviada ainda.</div>`; return; }
      items.slice().reverse().forEach(item=>{
        const row = document.createElement('div');
        row.className = 'bg-list-row';
        const tags = Object.keys(item.tags||{}).filter(k=> item.tags[k]).map(k=> VISUAL_TAG_LABELS[k]).filter(Boolean);
        const metaParts = [item.format, item.ratio ? RATIO_LABELS[item.ratio] : null].filter(Boolean);
        row.innerHTML = `
          ${item.kind==='video' ? `<span class="bg-file-icon">${UI_ICONS.film(16)}</span>` : `<img src="${item.dataUrl}" alt="" style="width:44px;height:44px;object-fit:cover;border-radius:var(--radius-sm);border:1px solid var(--border);flex-shrink:0" />`}
          <div class="bg-list-row-main">
            <div class="bg-list-row-title">${escapeHtml(item.name)}</div>
            ${metaParts.length ? `<div class="bg-list-row-sub">${metaParts.map(escapeHtml).join(' · ')}</div>` : ''}
            ${tags.length ? `<div class="bg-list-row-sub">${tags.map(escapeHtml).join(' · ')}</div>` : ''}
          </div>
          <button type="button" class="btn-icon" aria-label="Remover" title="Remover">${UI_ICONS.x(13)}</button>
        `;
        row.querySelector('button').addEventListener('click', ()=>{
          bucket.references.visuals = bucket.references.visuals.filter(x=> x.id!==item.id);
          saveIntel(); renderLibrary(); renderVisualsList(bucket);
        });
        el.appendChild(row);
      });
    }
    function renderCaptionsList(bucket){
      const el = $('intelCaptionsList'); if(!el) return;
      const items = bucket.references.captions;
      el.innerHTML = '';
      if(!items.length){ el.innerHTML = `<div class="bg-empty">Nenhuma legenda adicionada ainda.</div>`; return; }
      items.slice().reverse().forEach(item=>{
        const row = document.createElement('div');
        row.className = 'bg-list-row';
        row.innerHTML = `<div class="bg-list-row-main"><div class="bg-list-row-sub" style="color:var(--text);white-space:pre-wrap">${escapeHtml(item.text)}</div></div><button type="button" class="btn-icon" aria-label="Remover" title="Remover">${UI_ICONS.x(13)}</button>`;
        row.querySelector('button').addEventListener('click', ()=>{
          bucket.references.captions = bucket.references.captions.filter(x=> x.id!==item.id);
          saveIntel(); renderLibrary(); renderCaptionsList(bucket);
        });
        el.appendChild(row);
      });
    }
    function renderBriefingsList(bucket){
      const el = $('intelBriefingsList'); if(!el) return;
      const items = bucket.references.briefings;
      el.innerHTML = '';
      if(!items.length){ el.innerHTML = `<div class="bg-empty">Nenhum briefing adicionado ainda.</div>`; return; }
      items.slice().reverse().forEach(item=>{
        const row = document.createElement('div');
        row.className = 'bg-list-row';
        const fileLink = item.fileName ? `<div class="bg-list-row-sub"><a href="${item.dataUrl}" download="${escapeHtml(item.fileName)}" target="_blank" rel="noopener">${escapeHtml(item.fileName)}</a>${item.size?` · ${humanSize(item.size)}`:''}</div>` : '';
        row.innerHTML = `
          <span class="bg-file-icon">${UI_ICONS.file(16)}</span>
          <div class="bg-list-row-main">
            ${item.text ? `<div class="bg-list-row-sub" style="color:var(--text);white-space:pre-wrap">${escapeHtml(item.text)}</div>` : ''}
            ${fileLink}
          </div>
          <button type="button" class="btn-icon" aria-label="Remover" title="Remover">${UI_ICONS.x(13)}</button>
        `;
        row.querySelector('button').addEventListener('click', ()=>{
          bucket.references.briefings = bucket.references.briefings.filter(x=> x.id!==item.id);
          saveIntel(); renderLibrary(); renderBriefingsList(bucket);
        });
        el.appendChild(row);
      });
    }

    function renderTrainingPanel(bucket){
      renderVisualsList(bucket);
      renderCaptionsList(bucket);
      renderBriefingsList(bucket);
      $('intelProductsNotes').value = bucket.productsNotes || '';
      const n = IntelStore.referenceCount(bucket);
      $('intelAnalyzeHint').textContent = n===0 ? 'Envie ao menos uma referência para poder analisar.' : (n<3 ? `${n} referência${n===1?'':'s'} enviada${n===1?'':'s'} — quanto mais referências, mais confiável fica o DNA.` : '');
    }

    function setupTrainingHandlers(){
      $('intelVisualUploadInput').addEventListener('change', async ()=>{
        if(!selectedEditoria) return;
        const input = $('intelVisualUploadInput');
        const files = Array.from(input.files || []);
        if(!files.length) return;
        const bucket = IntelStore.getBucket(INTEL, selectedEditoria);
        const format = $('intelVisualFormat').value;
        const tags = {
          realUse: $('intelTagRealUse').checked,
          lowText: $('intelTagLowText').checked,
          visibleCta: $('intelTagCta').checked,
          recurringElement: $('intelTagRecurring').checked
        };
        for(const file of files){
          if(file.size > MAX_FILE_BYTES){ alert(`"${file.name}" é grande demais (máx. 15 MB) — ignorado.`); continue; }
          const isVideo = /^video\//.test(file.type);
          if(isVideo){
            const dataUrl = await readFileAsDataUrl(file);
            bucket.references.visuals.push({ id:generateId(), name:file.name, mime:file.type, size:file.size, dataUrl, addedAt:Date.now(), format, kind:'video', ratio:null, tags });
          } else {
            const raw = await readFileAsDataUrl(file);
            const { dataUrl, ratio } = await downscaleImage(raw, 900);
            bucket.references.visuals.push({ id:generateId(), name:file.name, mime:'image/jpeg', size: Math.round(dataUrl.length*0.75), dataUrl, addedAt:Date.now(), format, kind:'imagem', ratio, tags });
          }
        }
        input.value = '';
        saveIntel();
        renderLibrary();
        renderTrainingPanel(bucket);
      });

      $('intelCaptionAdd').addEventListener('click', ()=>{
        if(!selectedEditoria) return;
        const text = $('intelCaptionInput').value.trim();
        if(!text){ alert('Cole o texto de uma legenda.'); return; }
        const bucket = IntelStore.getBucket(INTEL, selectedEditoria);
        bucket.references.captions.push({ id:generateId(), text, addedAt:Date.now() });
        $('intelCaptionInput').value = '';
        saveIntel(); renderLibrary(); renderTrainingPanel(bucket);
      });

      $('intelBriefingUploadInput').addEventListener('change', ()=>{
        const file = $('intelBriefingUploadInput').files && $('intelBriefingUploadInput').files[0];
        if(!file) return;
        if(file.size > MAX_FILE_BYTES){ alert('Arquivo muito grande (máx. 15 MB).'); $('intelBriefingUploadInput').value=''; return; }
        $('intelBriefingUploadBtnText').textContent = 'Selecionado: ' + file.name;
      });
      $('intelBriefingAdd').addEventListener('click', async ()=>{
        if(!selectedEditoria) return;
        const text = $('intelBriefingInput').value.trim();
        const fileInput = $('intelBriefingUploadInput');
        const file = fileInput.files && fileInput.files[0];
        if(!text && !file){ alert('Cole o texto do briefing ou anexe um arquivo.'); return; }
        const bucket = IntelStore.getBucket(INTEL, selectedEditoria);
        const entry = { id:generateId(), text, addedAt:Date.now() };
        if(file){
          entry.dataUrl = await readFileAsDataUrl(file);
          entry.fileName = file.name;
          entry.size = file.size;
        }
        bucket.references.briefings.push(entry);
        $('intelBriefingInput').value = '';
        fileInput.value = '';
        $('intelBriefingUploadBtnText').textContent = 'Anexar arquivo (opcional)';
        saveIntel(); renderLibrary(); renderTrainingPanel(bucket);
      });

      $('intelProductsNotes').addEventListener('change', ()=>{
        if(!selectedEditoria) return;
        const bucket = IntelStore.getBucket(INTEL, selectedEditoria);
        bucket.productsNotes = $('intelProductsNotes').value.trim();
        saveIntel();
      });

      $('intelAnalyzeBtn').addEventListener('click', ()=>{
        if(!selectedEditoria) return;
        const bucket = IntelStore.getBucket(INTEL, selectedEditoria);
        if(IntelStore.referenceCount(bucket)===0){ alert('Envie ao menos uma referência (arte, legenda ou briefing) antes de analisar.'); return; }
        bucket.dna = IntelStore.generateDNA(bucket);
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
    function renderDnaPanel(bucket){
      const dna = bucket.dna;
      const empty = $('intelDnaEmpty'), content = $('intelDnaContent');
      if(!dna){ empty.style.display = 'block'; content.style.display = 'none'; return; }
      empty.style.display = 'none'; content.style.display = 'block';
      $('intelDnaMeta').textContent = `Gerado em ${new Date(dna.generatedAt).toLocaleString('pt-BR')} · a partir de ${dna.referenceCount} referência${dna.referenceCount===1?'':'s'}`;
      $('intelDnaVisualRules').innerHTML = dna.visualRules.map(r=> `<li>${escapeHtml(r)}</li>`).join('');
      $('intelDnaContentRules').innerHTML = dna.contentRules.map(r=> `<li>${escapeHtml(r)}</li>`).join('');
      $('intelDnaStructure').innerHTML = dna.recommendedStructure.map(r=> `<li>${escapeHtml(r)}</li>`).join('');
      $('intelDnaWords').innerHTML = chipsHtml(dna.recurringWords.map(w=> w.word));
      $('intelDnaCtas').innerHTML = chipsHtml(dna.ctas);
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
    renderLibrary();
    renderWorkspace();

    if(SYNC_ENABLED){
      syncPull();
      setInterval(()=> syncPull(), 20000);
    } else {
      setSyncStatus('Salvando só neste navegador (abra pelo endereço do servidor pra sincronizar)', 'warn');
    }
