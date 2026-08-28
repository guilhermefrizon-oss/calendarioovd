(function(){
'use strict';
// Tema (claro/escuro) e cor de destaque já vêm aplicados pelo portal-shell.js (primeiro
// script da página, com acesso à marca ativa e ao tema Personalizado) — nada a fazer aqui.
var $=function(s){return document.querySelector(s)}, $$=function(s){return Array.prototype.slice.call(document.querySelectorAll(s))};
var canvases={feed:$('#feedCanvas'),story:$('#storyCanvas')};
var templates={
 feed:{w:1080,h:1350,footerY:1184,footerH:166,textX:66,titleY:1227,subY:1278,titleMax:625,codeX:731,codeY:1228,dualCodeY:1227,codeW:390,codeH:49},
 story:{w:1080,h:1920,footerY:1458,footerH:173,textX:67,titleY:1504,subY:1557,titleMax:620,codeX:714,codeY:1520,dualCodeY:1503,codeW:410,codeH:49}
};
var positions={
 feed:{left:{badge:[68,108,484,313],product:[458,128,410,333]},stacked:{badge:[42,338,484,313],product:[92,147,340,276]},right:{badge:[582,600,484,313],product:[618,360,365,296]}},
 story:{left:{badge:[64,246,471,306],product:[450,286,430,349]},stacked:{badge:[42,548,471,306],product:[88,333,370,300]},right:{badge:[568,548,471,306],product:[610,268,370,300]}}
};
var state={editoriaName:null,editoriaColor:null,footerColor:'#FFBE00',brandBadgeColor:'#fbc400',background:null,product:null,productDrawable:null,productHasCircle:true,badgeFeed:null,badgeStory:null,customAssets:{},autoLayout:'left',bgZoom:{feed:1,story:1},overlayScale:1,format:{feed:{bgDx:0,bgDy:0,overlayDx:0,overlayDy:0},story:{bgDx:0,bgDy:0,overlayDx:0,overlayDy:0}}};
var lastProductBox={feed:null,story:null},lastBadgeBox={feed:null,story:null};
var catalog=[],selectedProduct=null,catalogFocus=0,catalogLoading=true;
// ============================================================
// EDITORIAS — mesma fonte usada em Configurações → Editorias no Calendário (app.js), lida
// direto da mesma chave de localStorage (cada marca tem sua própria lista, ver BRAND_SUFFIX).
// Cada editoria só é selecionável aqui se tiver um preset registrado em EDITORIA_PRESETS;
// as demais aparecem desabilitadas ("Em breve") até ganharem composição própria.
// ============================================================
var BRAND_SUFFIX=(window.PortalBrand&&window.PortalBrand.suffix)||'';
var CALENDAR_SETTINGS_KEY='calendar_settings_v1'+BRAND_SUFFIX;
// mapeia o sufixo de marca (ver app.js/portal-shell.js) pro "slug" do catálogo correspondente
// em data/catalog-{slug}.json (ver catalog-provider.js). Uma marca sem entrada aqui cai no
// próprio sufixo sem "__" como slug — se o arquivo ainda não existir, CatalogProvider.load()
// resolve pra lista vazia (mesmo estado de "sem catálogo" que já existia antes)
var CATALOG_SLUG_BY_BRAND_SUFFIX={ '':'vonder', '__ferramentas-gerais':'fg', '__dismatal':'dismatal' };
var CATALOG_SLUG=CATALOG_SLUG_BY_BRAND_SUFFIX[BRAND_SUFFIX]||BRAND_SUFFIX.replace(/^__/,'');
// FG e Dismatal revendem produto VONDER e seus códigos de catálogo apontam pro mesmo sistema
// de fotos (app.ovd.com.br), então usam o mesmo proxy de fotos por código que a VONDER. Se
// algum dia ganharem catálogo de código próprio (outro fornecedor de foto), tira a marca daqui.
var CATALOG_PHOTO_SLUG=({ fg:'vonder', dismatal:'vonder' })[CATALOG_SLUG]||CATALOG_SLUG;
// editorias são exclusivas de cada marca (ver app.js, EDITORIAS_BY_BRAND) — este fallback só
// entra quando a marca ainda não tem configurações salvas. Trend e Personalizado são
// universais (toda marca tem as duas, cada uma com sua própria cópia independente); as
// demais só existem pra marca listada, e uma marca sem entrada aqui cai só nas universais
var UNIVERSAL_FALLBACK_EDITORIAS=[{name:'Trend',color:'#db2777'},{name:'Personalizado',color:'#64748b'}];
var FALLBACK_EDITORIAS_BY_BRAND={
 '':[{name:'Informativo',color:'#7c3aed'},{name:'Destaques',color:'#0284c7'},{name:'Lançamentos',color:'#16a34a'},
     {name:'Dica VONDER',color:'#b45309'}],
 '__ferramentas-gerais':[{name:'Post E-commerce',color:'#0284c7'},{name:'Lançamentos',color:'#16a34a'},
     {name:'Destaques',color:'#7c3aed'},{name:'Blog - Conecta FG',color:'#4f46e5'},{name:'Datas comemorativas',color:'#db2777'}],
 '__osten-ferragens':[{name:'Datas comemorativas',color:'#db2777'}],
 '__dismatal':[{name:'Datas comemorativas',color:'#db2777'}]
};
var FALLBACK_EDITORIAS=(FALLBACK_EDITORIAS_BY_BRAND[BRAND_SUFFIX]||[]).concat(UNIVERSAL_FALLBACK_EDITORIAS);
function readEditoriaList(){
 var raw=localStorage.getItem(CALENDAR_SETTINGS_KEY);if(!raw)return FALLBACK_EDITORIAS;
 try{var s=JSON.parse(raw),eds=Array.isArray(s.editorias)?s.editorias:null;if(!eds||!eds.length)return FALLBACK_EDITORIAS;
  return eds.map(function(e,i){return typeof e==='string'?{name:e,color:(FALLBACK_EDITORIAS.length?FALLBACK_EDITORIAS[i%FALLBACK_EDITORIAS.length].color:'#64748b')}:e})
 }catch(e){return FALLBACK_EDITORIAS}
}
var EDITORIAS=readEditoriaList();
// a lista acima só reflete o que já estava salvo NESTE navegador (pode estar desatualizada,
// já que esta página nunca chamou o servidor até agora) — assim que o SyncBackend
// responder, atualiza a lista e o cache local, e redesenha a grade se ainda estiver visível
var SYNC_ENABLED=location.protocol!=='file:';
function refreshEditoriasFromServer(){
 if(!SYNC_ENABLED||typeof SyncBackend==='undefined')return;
 SyncBackend.get('settings'+BRAND_SUFFIX).then(function(res){
  if(!res||res.v===null)return;
  var eds=Array.isArray(res.v.editorias)?res.v.editorias:null;if(!eds||!eds.length)return;
  var normalized=eds.map(function(e,i){return typeof e==='string'?{name:e,color:(FALLBACK_EDITORIAS.length?FALLBACK_EDITORIAS[i%FALLBACK_EDITORIAS.length].color:'#64748b')}:e});
  EDITORIAS=normalized;
  try{var raw=localStorage.getItem(CALENDAR_SETTINGS_KEY),s=raw?JSON.parse(raw):{};s.editorias=normalized;localStorage.setItem(CALENDAR_SETTINGS_KEY,JSON.stringify(s))}catch(e){}
  renderEditoriaGrid()
 }).catch(function(){})
}
// preset visual de cada editoria (selo do feed/story + cor do rodapé) — exclusivo por marca:
// cada marca tem seu próprio catálogo de editorias, então uma editoria "Destaques" da VONDER
// não tem nada a ver com uma "Destaques" da Ferramentas Gerais, mesmo com o mesmo nome. Por
// isso o registro é indexado primeiro por BRAND_SUFFIX e só depois por nome da editoria.
// Novas editorias/marcas ganham entrada aqui à medida que a arte for feita.
var EDITORIA_PRESETS_BY_BRAND={
 '':{ // VONDER (marca padrão)
  'Destaques':{
   footerColor:'#FFBE00',
   badgeFeed:(window.POST_EDITOR_ASSETS&&window.POST_EDITOR_ASSETS.feed)||'post-editor-assets/destaques-feed.png',
   badgeStory:(window.POST_EDITOR_ASSETS&&window.POST_EDITOR_ASSETS.story)||'post-editor-assets/destaques-story.png'
  }
 }
};
var EXTERNAL_EDITORIA_PRESETS=window.POST_EDITOR_CUSTOM_PRESETS||{};
Object.keys(EXTERNAL_EDITORIA_PRESETS).forEach(function(brand){
 EDITORIA_PRESETS_BY_BRAND[brand]=Object.assign({},EDITORIA_PRESETS_BY_BRAND[brand]||{},EXTERNAL_EDITORIA_PRESETS[brand])
});
var EDITORIA_PRESETS=EDITORIA_PRESETS_BY_BRAND[BRAND_SUFFIX]||{};
function escapeHtml(value){return String(value||'').replace(/[&<>\"]/g,function(ch){return{'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[ch]})}
function normalizeText(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()}
function normalizeCode(value){return String(value||'').replace(/\D/g,'')}
// tamanho pedido ao proxy de fotos para as miniaturas de pré-visualização (grade de busca,
// resumo do produto selecionado etc. nunca passam de ~58px na tela, então isso evita baixar
// a foto original — que pode ter vários MB — só para exibi-la minúscula)
var CATALOG_THUMB_WIDTH=160;
// tamanho pedido pra foto usada de fato na arte (recorte do produto). O maior lado desenhado
// nunca passa de ~1920px (Story) e o zoom do produto vai até 135%, então 1600px de origem já
// cobre com folga — mas é uma fração do tamanho da foto original (que pode ter 4000px+),
// então o recorte fica pronto bem mais rápido sem perda de qualidade perceptível.
var CATALOG_PRODUCT_WIDTH=1600;
function productImageUrl(code,width){var digits=normalizeCode(code);if(!digits)return'';return'product-image.php?code='+encodeURIComponent(digits)+'&v=4'+(width?'&w='+width:'')}
function localProductImageUrl(code,width){var digits=normalizeCode(code);if(!digits)return'';return'http://127.0.0.1:8765/product-image?code='+encodeURIComponent(digits)+'&v=4'+(width?'&w='+width:'')}
// o helper local só existe na máquina de quem está editando (rodado pelo "Abrir
// Calendario.cmd"); num site publicado (GitHub Pages etc.) chamar 127.0.0.1 faz o Chrome
// pedir a permissão de "Acessar dispositivos na rede local" pro visitante à toa, então só
// tentamos esse endereço quando a própria página está sendo servida localmente
var IS_LOCAL_HOST=location.protocol==='file:'||/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
function itemImageUrls(item,width){
 var codes=catalogCodes(item),code=codes[0]&&codes[0].code,direct=(item&&(item.imageUrl||item.image||item.photo))||'',urls=[];
 // Em file:// o PHP da pasta não é executado. O helper local devolve a foto com CORS;
 // quando há servidor web, o PHP continua sendo a primeira opção. A URL direta (foto em
 // tamanho real, sem redimensionar) fica como último fallback pra quando nenhum proxy
 // responder — e nunca será desenhada se contaminar o canvas.
 if(CATALOG_PHOTO_SLUG==='vonder'&&code){
  if(location.protocol==='file:')urls.push(localProductImageUrl(code,width));else urls.push(productImageUrl(code,width));
  if(IS_LOCAL_HOST)urls.push(localProductImageUrl(code,width))
 }
 if(direct)urls.push(direct);
 return urls.filter(function(url,index){return url&&urls.indexOf(url)===index})
}
function itemImageUrl(item){return itemImageUrls(item)[0]||''}
function itemThumbnailUrls(item){return(item&&item.thumbnail)?[item.thumbnail]:itemImageUrls(item,CATALOG_THUMB_WIDTH)}
// tenta cada URL da lista em sequência quando a anterior falhar (onerror) — usado pelas
// miniaturas do catálogo pra cair pra foto original quando a miniatura do proxy não responde
// (ex.: página aberta por um servidor estático que não executa o PHP do proxy nem tem o
// helper local rodando)
function setImgWithFallback(img,urls,onAllFail){
 var list=(urls||[]).filter(Boolean),i=0;
 if(!list.length){if(onAllFail)onAllFail();return}
 img.onerror=function(){i++;if(i<list.length)img.src=list[i];else{img.onerror=null;if(onAllFail)onAllFail()}};
 img.src=list[0]
}
function itemBackgroundUrl(item){return(item&&(item.background||item.usageImage||item.applicationImage||item.sceneImage))||''}
function catalogCodes(item){
 var raw=Array.isArray(item&&item.codes)?item.codes:(Array.isArray(item&&item.variants)?item.variants:null),out=[];
 if(raw)raw.slice(0,2).forEach(function(entry){if(typeof entry==='string')out.push({code:entry,label:''});else if(entry&&entry.code)out.push({code:entry.code,label:entry.label||entry.name||entry.variant||''})});
 if(!out.length&&item&&item.code)out.push({code:item.code,label:item.variant||''});return out
}
function editorNameFor(item){var title=item&&(item.title||item.shortName),sub=item&&(item.subtitle||item.shortDescription||item.descriptionShort);if(title)return title+(sub?'\n'+sub:'');var parsed=splitName(item&&item.name);return parsed.title+(parsed.sub?'\n'+parsed.sub:'')}
var FLOW_STEP_ORDER={editoria:0,choose:1,edit:2};
var currentFlowMode='editoria',maxFlowOrder=0,pendingLeaveEditTarget=null;
function setFlow(mode){
 currentFlowMode=mode;maxFlowOrder=Math.max(maxFlowOrder,FLOW_STEP_ORDER[mode]);
 $('#editoriaChooser').hidden=mode!=='editoria';$('#productChooser').hidden=mode!=='choose';$('#editorWorkspace').hidden=mode!=='edit';
 $('#editorIntro').textContent=mode==='editoria'?'Primeiro, escolha qual editoria você vai postar.':mode==='choose'?'Agora, escolha qual produto será usado na arte.':'Dados carregados. Revise a arte e ajuste o que precisar.';
 var cur=FLOW_STEP_ORDER[mode];
 $$('[data-flow-step]').forEach(function(el){var own=FLOW_STEP_ORDER[el.dataset.flowStep];el.classList.toggle('is-active',own===cur);el.classList.toggle('is-complete',own<cur);el.classList.toggle('is-clickable',own!==cur&&own<=maxFlowOrder)});
 if(mode==='choose'){renderCatalogResults();setTimeout(function(){$('#catalogSearch').focus()},20)}
}
// navegação entre etapas iniciada pelo usuário (clique nos passos do topo ou nos botões
// "Trocar") — sair da etapa "Editar e baixar" pede confirmação, porque a composição em tela
// nunca é salva automaticamente; indo pra frente (ou entre editoria/produto) não há nada a perder
function goToStep(mode){
 if(mode===currentFlowMode)return;
 if(currentFlowMode==='edit'){pendingLeaveEditTarget=mode;$('#confirmLeaveEdit').hidden=false;return}
 setFlow(mode)
}
function closeConfirmLeaveEdit(){$('#confirmLeaveEdit').hidden=true;pendingLeaveEditTarget=null}
$('#confirmLeaveEditCancel').addEventListener('click',closeConfirmLeaveEdit);
$('#confirmLeaveEditOk').addEventListener('click',function(){var target=pendingLeaveEditTarget;closeConfirmLeaveEdit();if(target)setFlow(target)});
$('#confirmLeaveEdit').addEventListener('click',function(ev){if(ev.target===ev.currentTarget)closeConfirmLeaveEdit()});
document.addEventListener('keydown',function(ev){if(ev.key==='Escape'&&!$('#confirmLeaveEdit').hidden)closeConfirmLeaveEdit()});
$$('[data-flow-step]').forEach(function(el){el.addEventListener('click',function(){if(el.classList.contains('is-clickable'))goToStep(el.dataset.flowStep)})});
function syncEditoriaBadges(){
 [['selectedEditoriaDotChoose','selectedEditoriaNameChoose'],['selectedEditoriaDotEdit','selectedEditoriaNameEdit']].forEach(function(ids){
  var dot=$('#'+ids[0]),name=$('#'+ids[1]);if(!dot||!name)return;dot.style.background=state.editoriaColor||'#64748b';name.textContent=state.editoriaName||'Editoria'
 })
}
function renderEditoriaGrid(){
 var box=$('#editoriaGrid');
 box.innerHTML=EDITORIAS.map(function(e){
  var available=!!EDITORIA_PRESETS[e.name];
  return '<button type="button" class="pe-editoria-item" data-editoria="'+escapeHtml(e.name)+'"'+(available?'':' disabled')+'><span class="pe-editoria-dot" style="background:'+(e.color||'#64748b')+'"></span><span><strong>'+escapeHtml(e.name)+'</strong><small>'+(available?'Preset disponível':'Em breve')+'</small></span></button>'
 }).join('');
 $$('#editoriaGrid [data-editoria]:not(:disabled)').forEach(function(btn){
  btn.addEventListener('click',function(){var e=EDITORIAS.filter(function(x){return x.name===btn.dataset.editoria})[0];if(e)chooseEditoria(e)})
 })
}
function chooseEditoria(editoria){
 var preset=EDITORIA_PRESETS[editoria.name];if(!preset)return;
 state.editoriaName=editoria.name;state.editoriaColor=editoria.color||'#64748b';state.footerColor=preset.footerColor||'#FFBE00';
 state.brandBadgeColor=preset.brandBadgeColor||'#fbc400';if($('#brandBadgeColor'))$('#brandBadgeColor').value=state.brandBadgeColor;
 state.customAssets={};var brandField=$('#brandVariantField');if(brandField)brandField.hidden=!preset.supportsBrandVariant;
 var usesCodes=preset.supportsCodes!==false,usesCutout=preset.supportsProductCutout!==false;
 $('#codeControls').hidden=!usesCodes;$('#selectedProductCode').hidden=!usesCodes;$('#productDrop').hidden=!usesCutout;$('#removeWhiteField').hidden=!usesCutout;
 $('#imageSectionHint').textContent=usesCutout?'Envie a cena e, se tiver, o produto recortado':'Envie somente a imagem de uso do produto';
 syncEditoriaBadges();status('Carregando preset de '+editoria.name+'…',true);
 var assetNames=Object.keys(preset.assetSources||{}),sources=[preset.badgeFeed,preset.badgeStory].concat(assetNames.map(function(name){return preset.assetSources[name]}));
 Promise.all(sources.map(function(src){return src?loadImage(src):Promise.resolve(null)})).then(function(v){state.badgeFeed=v[0];state.badgeStory=v[1];assetNames.forEach(function(name,index){state.customAssets[name]=v[index+2]});drawAll();status('Preset de '+editoria.name+' carregado',false)}).catch(function(){drawAll();status('Preset de '+editoria.name+' carregado; algumas imagens não abriram',false)});
 setFlow('choose')
}
function setProductFilePreview(src,text,fallbacks){
 var preview=$('#productFilePreview'),drop=$('#productDrop');if(!preview||!drop)return;
 preview.hidden=!src;drop.classList.toggle('has-preview',!!src);
 if(src)setImgWithFallback(preview,[src].concat(fallbacks||[]));else{preview.removeAttribute('src');preview.onerror=null}
 if(text)$('#productFileName').textContent=text
}
function setProductFilePreviewFromFile(file){
 var reader=new FileReader();reader.onload=function(){setProductFilePreview(reader.result,file.name+' · clique para alterar')};reader.readAsDataURL(file)
}
function updateSelectedSummary(item,manual){
 var thumb=$('#selectedProductThumb');thumb.innerHTML='＋';$('#selectedProductName').textContent=manual?'Produto manual':(item.name||'Produto sem nome');$('#selectedProductCode').textContent=manual?'Sem vínculo com o catálogo':(catalogCodes(item).map(function(v){return v.code}).join(' · ')||'Sem código');
 var urls=!manual&&itemThumbnailUrls(item);if(urls&&urls.length){var im=document.createElement('img');im.alt='';thumb.innerHTML='';thumb.appendChild(im);setImgWithFallback(im,urls,function(){thumb.textContent='＋'})}
}
function showEditor(item,manual){updateSelectedSummary(item||{},!!manual);setFlow('edit');setTimeout(function(){drawAll()},0)}
function chooseManualProduct(){
 selectedProduct=null;$('#productName').value='';$('#productCode').value='';$('#productCode2').value='';$('#codeCount').value='1';if($('#brandVariant'))$('#brandVariant').value='vonder';state.product=null;state.productDrawable=null;state.productHasCircle=false;state.background=null;setProductFilePreview('','PNG transparente ou foto em fundo branco');$('#backgroundFileName').textContent='Clique ou arraste uma imagem';syncCodeFields();showEditor({},true);drawAll();status('Preencha os dados e envie as imagens',false)
}
function chooseCatalogProduct(item){
 selectedProduct=item;var codes=catalogCodes(item);$('#productName').value=editorNameFor(item);$('#productCode').value=codes[0]?codes[0].code:'';$('#productCode2').value=codes[1]?codes[1].code:'';$('#codeVariant1').value=(codes[0]&&codes[0].label)||'110 V~';$('#codeVariant2').value=(codes[1]&&codes[1].label)||'220 V~';$('#codeCount').value=codes.length>1?'2':'1';syncCodeFields();
 if($('#brandVariant'))$('#brandVariant').value=item.brandVariant||(/vonder\s*plus/i.test(item.name||'')?'vonder-plus':'vonder');
 state.product=null;state.productDrawable=null;state.productHasCircle=false;state.background=null;state.format.feed={bgDx:0,bgDy:0,overlayDx:0,overlayDy:0};state.format.story={bgDx:0,bgDy:0,overlayDx:0,overlayDy:0};var thumbUrls=itemThumbnailUrls(item);setProductFilePreview(thumbUrls[0],'Carregada automaticamente · clique para alterar',thumbUrls.slice(1));showEditor(item,false);drawAll();
 var bgUrl=itemBackgroundUrl(item);if(bgUrl){$('#backgroundFileName').textContent='Foto de aplicação do catálogo';loadImage(bgUrl).then(function(im){if(selectedProduct!==item)return;
  if(!im.exportSafe){$('#backgroundFileName').textContent='Envie a foto de fundo manualmente';status('Essa foto de aplicação não pode ser usada automaticamente (o servidor de origem não libera para exportação) — envie manualmente abaixo',false);return}
  state.background=trimBackgroundMargins(im);state.bgZoom.feed=1;state.bgZoom.story=1;$('#backgroundZoomFeed').value='100';$('#backgroundZoomStory').value='100';$('#backgroundZoomFeedOut').value='100%';$('#backgroundZoomStoryOut').value='100%';if(item.preferredLayout){state.autoLayout=item.preferredLayout;drawAll();status('Produto e foto de aplicação carregados',false)}else analyze()
 }).catch(function(){if(selectedProduct!==item)return;$('#backgroundFileName').textContent='Envie a foto de fundo manualmente';status('Produto carregado; a foto de aplicação não abriu',false)})}else{$('#backgroundFileName').textContent='Clique ou arraste uma imagem'}
 var urls=itemImageUrls(item,CATALOG_PRODUCT_WIDTH);if(!urls.length){status('Dados preenchidos; envie a foto do produto',false);return}status(bgUrl?'Carregando produto e foto de aplicação…':'Carregando e recortando a foto do catálogo…',true);$('#productFileName').textContent='Foto do catálogo · '+(codes[0]?codes[0].code:'produto')+' · clique para alterar';
 loadExportSafeImage(urls).then(function(im){if(selectedProduct!==item)return;
  state.product=im;$('#productFileName').textContent='Foto do catálogo carregada · clique para alterar';$('#removeWhite').checked=true;updateProduct()
 }).catch(function(){if(selectedProduct!==item)return;var localHint=location.protocol==='file:'?' Abra pelo arquivo “Abrir Calendario.cmd” para ativar o recorte automático.':'';status('Dados preenchidos; não foi possível carregar a foto automaticamente.'+localHint,false);$('#productFileName').textContent='Foto visível, mas o recorte automático precisa do lançador'})
}
// resultados que começam pelo termo buscado (no nome ou em algum código) vêm antes dos que só
// contêm o termo em outro ponto — ex.: buscar "aspirador" mostra "Aspirador de pó..." antes de
// "Escova para aspirador"
function productMatchRank(item,q,qc){
 if(q&&normalizeText(item.name||'').indexOf(q)===0)return 0;
 if(qc&&catalogCodes(item).some(function(v){return normalizeCode(v.code).indexOf(qc)===0}))return 0;
 return 1;
}
function matchingProducts(query){var q=normalizeText(query.trim()),qc=normalizeCode(query);var results=catalog.filter(function(item){var codeHit=qc&&catalogCodes(item).some(function(v){return normalizeCode(v.code).includes(qc)});return!q||normalizeText(item.name).includes(q)||codeHit}).sort(function(a,b){return productMatchRank(a,q,qc)-productMatchRank(b,q,qc)});return q?results:results.slice(0,10)}
function renderCatalogResults(){
 var query=$('#catalogSearch').value,matches=matchingProducts(query),box=$('#catalogResults');
 catalogFocus=Math.min(catalogFocus,Math.max(0,matches.length-1));
 if(catalogLoading){$('#catalogStatus').textContent='Carregando catálogo…';box.innerHTML='<div class="pe-catalog-empty"><strong>Carregando catálogo…</strong>Buscando os produtos disponíveis.</div>';return}
 $('#catalogStatus').textContent=catalog.length?(query?matches.length+' produto'+(matches.length===1?' encontrado':'s encontrados'):catalog.length.toLocaleString('pt-BR')+' produtos disponíveis'):'Nenhum produto cadastrado nesta marca';
 if(!catalog.length){box.innerHTML='<div class="pe-catalog-empty"><strong>O catálogo ainda está vazio</strong>Cadastre produtos em Configurações no calendário ou continue sem catálogo.</div>';return}
 if(!matches.length){box.innerHTML='<div class="pe-catalog-empty"><strong>Nenhum produto encontrado</strong>Tente buscar apenas uma parte do nome ou os números do código.</div>';return}
 box.innerHTML=matches.map(function(item,index){var hasImage=!!itemThumbnailUrls(item).length;return'<button type="button" class="pe-catalog-item'+(index===catalogFocus?' is-focused':'')+'" data-catalog-index="'+index+'" role="option" aria-selected="'+(index===catalogFocus)+'">'+(hasImage?'<img alt="" loading="lazy" decoding="async">':'<span class="pe-selected-thumb">＋</span>')+'<span><strong>'+escapeHtml(item.name)+'</strong><small>'+escapeHtml(catalogCodes(item).map(function(v){return v.code}).join(' · '))+'</small></span><span>›</span></button>'}).join('');
 $$('#catalogResults [data-catalog-index]').forEach(function(btn){
  var item=matches[Number(btn.dataset.catalogIndex)];
  btn.addEventListener('click',function(){chooseCatalogProduct(item)});
  var img=btn.querySelector('img');if(img)setImgWithFallback(img,itemThumbnailUrls(item))
 })
}
// carrega o catálogo desta marca via CatalogProvider (ver catalog-provider.js) — nunca lê
// JSON nem localStorage diretamente aqui, só consome a Promise; assim, se a origem do
// catálogo mudar no futuro (API própria, scraping agendado, etc.), só CatalogProvider muda
function loadCatalog(){
 catalog=[];catalogFocus=0;catalogLoading=true;renderCatalogResults();
 if(typeof CatalogProvider==='undefined'){catalogLoading=false;renderCatalogResults();return}
 CatalogProvider.load(CATALOG_SLUG).then(function(result){
  catalog=result.items;catalogFocus=0;catalogLoading=false;renderCatalogResults();
  if(result.source==='cache')status('Catálogo carregado da cópia local (sem conexão com o servidor)',false)
 })
}
function status(message,busy){var el=$('#editorStatus');el.classList.toggle('is-busy',!!busy);el.querySelector('span:last-child').textContent=message}
// carrega uma imagem e marca em im.exportSafe se ela pode ser desenhada no canvas sem
// "contaminar" a exportação (toBlob/toDataURL). Mesma origem e data: URI são sempre seguras;
// uma origem externa só é segura se o servidor permitir CORS (daí o XHR como blob funcionar —
// nesse caso os bytes já vieram pra cá, então a imagem final é local pro navegador). Quando o
// servidor de origem não manda CORS (caso do endpoint de fotos usado pelo catálogo da VONDER,
// ver data/catalog-vonder.json), a única forma de exibir a imagem é via <img src> direto — o
// que funciona pra pré-visualização, mas deixa qualquer canvas que a desenhar permanentemente
// impedido de exportar (é uma trava do próprio navegador, não tem como contornar sem o
// servidor de origem cooperar). Por isso quem chama loadImage() para desenhar em canvas
// (chooseCatalogProduct) precisa checar im.exportSafe ANTES de desenhar, e não depois.
function loadImage(src){return new Promise(function(resolve,reject){
 function direct(safe){var im=new Image();im.onload=function(){im.exportSafe=safe;resolve(im)};im.onerror=reject;im.src=src}
 if(/^data:/.test(src)){direct(true);return}
 var sameOrigin=true;try{sameOrigin=new URL(src,location.href).origin===location.origin}catch(e){}
 if(sameOrigin){direct(true);return}
 try{var xhr=new XMLHttpRequest();xhr.open('GET',src,true);xhr.responseType='blob';xhr.onload=function(){if(!xhr.response||(xhr.status&&xhr.status>=400)){direct(false);return}var u=URL.createObjectURL(xhr.response),im=new Image();im.onload=function(){URL.revokeObjectURL(u);im.exportSafe=true;resolve(im)};im.onerror=function(){URL.revokeObjectURL(u);direct(false)};im.src=u};xhr.onerror=function(){direct(false)};xhr.send()}catch(e){direct(false)}
})}
function loadExportSafeImage(urls){return new Promise(function(resolve,reject){
 var list=(urls||[]).filter(Boolean),local=list.filter(function(url){return /^http:\/\/127\.0\.0\.1:8765\//.test(url)}),others=list.filter(function(url){return local.indexOf(url)<0}),round=0;
 // O lançador inicia o auxiliar de imagens e abre o calendário em seguida. Em máquinas
 // mais lentas, o editor podia pedir a foto durante essa pequena janela de inicialização:
 // a miniatura externa aparecia, mas o canvas desistia na primeira conexão recusada. Tenta
 // novamente apenas o endereço local (barato e seguro para exportação) antes dos fallbacks.
 function tryList(candidates){return new Promise(function(ok,fail){var index=0;function next(){if(index>=candidates.length){fail(new Error('Nenhuma origem exportável'));return}loadImage(candidates[index++]).then(function(im){if(im.exportSafe)ok(im);else next()}).catch(next)}next()})}
 function tryLocal(){
  if(!local.length||round>=5)return tryList(others);
  return tryList(local).catch(function(){var delay=[250,500,900,1400,2200][round++];return new Promise(function(done){setTimeout(done,delay)}).then(tryLocal)})
 }
 tryLocal().then(resolve,reject)
})}
function trimBackgroundMargins(im){var c=document.createElement('canvas');c.width=im.width;c.height=im.height;var ctx=c.getContext('2d');ctx.drawImage(im,0,0);var pixels=ctx.getImageData(0,0,c.width,c.height).data,minX=c.width,minY=c.height,maxX=-1,maxY=-1;for(var y=0;y<c.height;y++)for(var x=0;x<c.width;x++){var i=(y*c.width+x)*4;if(pixels[i+3]>8&&(pixels[i]<245||pixels[i+1]<245||pixels[i+2]<245)){if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y}}if(maxX<minX||maxY<minY)return im;var cropW=maxX-minX+1,cropH=maxY-minY+1;if(cropW>=c.width*.98&&cropH>=c.height*.98)return im;var inset=3;minX=Math.min(maxX,minX+inset);minY=Math.min(maxY,minY+inset);maxX=Math.max(minX,maxX-inset);maxY=Math.max(minY,maxY-inset);cropW=maxX-minX+1;cropH=maxY-minY+1;var out=document.createElement('canvas');out.width=cropW;out.height=cropH;out.getContext('2d').drawImage(c,minX,minY,cropW,cropH,0,0,cropW,cropH);return out}
function drawPlaceholder(ctx,t){
 var g=ctx.createLinearGradient(0,0,t.w,t.h);g.addColorStop(0,'#202427');g.addColorStop(.48,'#5a5f5d');g.addColorStop(1,'#1d201f');ctx.fillStyle=g;ctx.fillRect(0,0,t.w,t.h);
 ctx.save();ctx.globalAlpha=.13;ctx.fillStyle='#fff';for(var i=0;i<8;i++){ctx.fillRect(i*170-120,t.h*.62,100,t.h*.38)}ctx.restore()
}
// limita o deslocamento de arraste (bgDx/bgDy) pra imagem desenhada com largura/altura w×h
// nunca deixar de cobrir o quadro w0×h0 — sem isso, arrastar no zoom mínimo (onde a imagem só
// encosta nas bordas, sem sobra) expõe canvas vazio/transparente pra fora da arte. Uma margem
// mínima de folga (COVER_PAN_MARGIN) garante que sempre sobre um pouco de espaço pra arrastar
// nos dois eixos, mesmo quando a proporção da imagem bate quase exata com a do quadro — do
// contrário o eixo "exato" fica travado em 0 (folga zero) e o outro quase sem espaço.
var COVER_PAN_MARGIN=1.06;
function clampOffset(d,size,frameSize){var slack=Math.max(0,(size-frameSize)/2);return Math.max(-slack,Math.min(slack,d))}
// zoom nunca pode ir abaixo de 1 (o necessário pra cobrir 100% do frame): a imagem de fundo
// sempre cobre o quadro inteiro, nunca aparece fundo auxiliar/blur, e o arraste (clampOffset)
// atua só sobre essa imagem real, nunca sobre uma camada de preenchimento separada.
function drawCover(ctx,img,t,format){
 var cover=Math.max(t.w/img.width,t.h/img.height)*COVER_PAN_MARGIN,p=state.format[format],zoom=Math.max(1,state.bgZoom[format]);
 ctx.save();ctx.beginPath();ctx.rect(0,0,t.w,t.h);ctx.clip();
 var s=cover*zoom,w=img.width*s,h=img.height*s,dx=clampOffset(p.bgDx,w,t.w),dy=clampOffset(p.bgDy,h,t.h),x=(t.w-w)/2+dx,y=(t.h-h)/2+dy;ctx.drawImage(img,x,y,w,h);
 ctx.restore()
}
function roundRect(ctx,x,y,w,h,r){r=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath()}
function splitName(raw){
 raw=String(raw||'').trim();var lines=raw.split(/\r?\n/).map(function(v){return v.trim()}).filter(Boolean);if(lines.length>1)return{title:lines[0],sub:lines.slice(1).join(' ')};
 var clean=raw.replace(/\s+/g,' '),digit=clean.search(/\d/),desc=clean.toLowerCase().search(/\scom\s+(proteção|protecao|revestimento|acabamento)/),range=clean.match(/\b\d+\s*(?:a|x)\s*\d+\s*(?:mm|cm|m|ml|l|kg|g|pol)\b/i),cut=range&&clean.slice(range.index+range[0].length).trim()?range.index+range[0].length:-1;if(cut<0&&digit>3&&clean.slice(0,digit).trim().length<=38)cut=digit;if(desc>4&&(cut<0||desc<cut))cut=desc;if(cut>0)return{title:clean.slice(0,cut).replace(/[,\s]+$/,''),sub:clean.slice(cut).trim()};if(clean.length<=28)return{title:clean,sub:''};var words=clean.split(' '),title='',i=0;
 for(;i<words.length;i++){var next=(title+' '+words[i]).trim();if(next.length>30&&title)break;title=next}return{title:title,sub:words.slice(i).join(' ')}
}
function font(size){return '700 italic '+size+'px "Swiss721Editor","Arial Narrow",Impact,sans-serif'}
function fitFont(ctx,text,max,size,min){ctx.font=font(size);while(size>min&&ctx.measureText(text).width>max){size-=2;ctx.font=font(size)}return size}
function layout(){return $('#layoutMode').value==='auto'?state.autoLayout:$('#layoutMode').value}
// mesma ideia do clampOffset da imagem de fundo, mas pra posição absoluta (não deslocamento a
// partir do centro): mantém a caixa do selo/produto sempre dentro do frame, deslizando de
// encostada-na-borda-esquerda/topo (0) até encostada-na-borda-direita/baixo (frame-size); se a
// caixa for maior que o frame (fora do uso normal), ainda assim nunca deixa ela sair de vez
function clampBoxPos(pos,size,frame){var lo=Math.min(0,frame-size),hi=Math.max(0,frame-size);return Math.max(lo,Math.min(hi,pos))}
function scaled(box,format){var s=state.overlayScale,p=state.format[format],t=templates[format],cx=box[0]+box[2]/2,cy=box[1]+box[3]/2,w=box[2]*s,h=box[3]*s,x=clampBoxPos(cx-w/2+p.overlayDx,w,t.w),y=clampBoxPos(cy-h/2+p.overlayDy,h,t.h);return[x,y,w,h]}
function contain(ctx,img,box){
 var s=Math.min(box[2]/img.width,box[3]/img.height),w=img.width*s,h=img.height*s;ctx.drawImage(img,box[0]+(box[2]-w)/2,box[1]+(box[3]-h)/2,w,h)
}
function drawProduct(ctx,box){
 var im=state.productDrawable;if(!im)return;if(state.productHasCircle){contain(ctx,im,box);return}
 var cx=box[0]+box[2]/2,cy=box[1]+box[3]/2,r=Math.min(box[2],box[3])*.48;ctx.save();ctx.fillStyle='#F6BE00';ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fill();ctx.shadowColor='rgba(0,0,0,.38)';ctx.shadowBlur=18;ctx.shadowOffsetY=12;contain(ctx,im,[box[0]+box[2]*.08,box[1]+box[3]*.05,box[2]*.84,box[3]*.84]);ctx.restore()
}
function drawDualCode(ctx,t,y,label,code){
 var h=42;roundRect(ctx,t.codeX,y,t.codeW,h,22);ctx.fillStyle='#fff';ctx.fill();label=(label||'').toUpperCase();code=code||'';var size=29,labelFont='',codeFont='',labelW=0,codeW=0;
 do{labelFont='700 italic '+size+'px "Swiss721Editor","Arial Narrow",Impact,sans-serif';codeFont='400 italic '+size+'px "Swiss721Editor","Arial Narrow",Arial,sans-serif';ctx.font=labelFont;labelW=ctx.measureText(label).width;ctx.font=codeFont;codeW=ctx.measureText(code).width;size--}while(size>20&&labelW+codeW+48>t.codeW-38);
 var x=t.codeX+20;ctx.fillStyle='#080808';ctx.textBaseline='middle';ctx.textAlign='left';ctx.font=labelFont;ctx.fillText(label,x,y+h/2+1);x+=labelW+16;ctx.font='700 18px Arial,sans-serif';ctx.fillText('•',x,y+h/2);x+=20;ctx.font=codeFont;ctx.fillText(code,x,y+h/2+1)
}
function drawFooter(ctx,t){
 var txt=splitName($('#productName').value),code=($('#productCode').value||'').trim(),dual=$('#codeCount').value==='2';ctx.fillStyle=state.footerColor||'#FFBE00';ctx.fillRect(0,t.footerY,t.w,t.footerH);
 ctx.fillStyle='#050505';ctx.textBaseline='top';ctx.textAlign='left';ctx.font=font(fitFont(ctx,txt.title.toUpperCase(),t.titleMax,48,28));ctx.fillText(txt.title.toUpperCase(),t.textX,t.titleY);
 if(txt.sub){ctx.font=font(fitFont(ctx,txt.sub.toUpperCase(),t.titleMax,30,20));ctx.fillText(txt.sub.toUpperCase(),t.textX,t.subY)}
 if(dual){var firstY=t.dualCodeY;drawDualCode(ctx,t,firstY,$('#codeVariant1').value,code);drawDualCode(ctx,t,firstY+49,$('#codeVariant2').value,($('#productCode2').value||'').trim())}
 else{roundRect(ctx,t.codeX,t.codeY,t.codeW,t.codeH,25);ctx.fillStyle='#fff';ctx.fill();ctx.fillStyle='#080808';ctx.textBaseline='middle';ctx.textAlign='left';ctx.font=font(30);ctx.fillText('CÓD.:',t.codeX+45,t.codeY+t.codeH/2+1);ctx.font='400 italic 30px "Swiss721Editor","Arial Narrow",Arial,sans-serif';ctx.fillText(code,t.codeX+137,t.codeY+t.codeH/2+1)}
}
function draw(format){
 var c=canvases[format],ctx=c.getContext('2d'),t=templates[format],pos=positions[format][layout()];ctx.clearRect(0,0,t.w,t.h);
 var activePreset=EDITORIA_PRESETS[state.editoriaName];
 if(activePreset&&typeof activePreset.renderer==='function'){
  lastProductBox[format]=null;lastBadgeBox[format]=null;
  activePreset.renderer({format:format,canvas:c,ctx:ctx,t:t,state:state,item:selectedProduct,productName:$('#productName').value,brandVariant:$('#brandVariant')?$('#brandVariant').value:'vonder',helpers:{drawCover:drawCover,drawPlaceholder:drawPlaceholder,contain:contain,roundRect:roundRect,font:font,fitFont:fitFont}});return
 }
 if(state.background)drawCover(ctx,state.background,t,format);else drawPlaceholder(ctx,t);
 var productBox=scaled(pos.product,format),badgeBox=scaled(pos.badge,format);lastProductBox[format]=productBox;lastBadgeBox[format]=badgeBox;
 // mesmo clipping do frame aplicado na imagem de fundo (drawCover), agora também no selo e no
 // produto recortado: mesmo com a posição já limitada por clampBoxPos, sombra/blur desses
 // desenhos poderiam sujar pixels perto da borda do frame — o clip garante que nada deles
 // apareça fora da área final de exportação
 ctx.save();ctx.beginPath();ctx.rect(0,0,t.w,t.h);ctx.clip();
 drawProduct(ctx,productBox);var badge=format==='feed'?state.badgeFeed:state.badgeStory;if(badge)ctx.drawImage(badge,badgeBox[0],badgeBox[1],badgeBox[2],badgeBox[3]);
 ctx.restore();
 drawFooter(ctx,t)
}function drawAll(){draw('feed');draw('story')}
function regionScore(img,rect){
 var c=document.createElement('canvas');c.width=120;c.height=120;var x=c.getContext('2d');x.drawImage(img,rect[0]*img.width,rect[1]*img.height,rect[2]*img.width,rect[3]*img.height,0,0,120,120);
 var d=x.getImageData(0,0,120,120).data,total=0,count=0;for(var y=1;y<119;y+=3)for(var q=1;q<119;q+=3){var i=(y*120+q)*4,j=i+4,k=i+480;total+=Math.abs(d[i]-d[j])+Math.abs(d[i+1]-d[j+1])+Math.abs(d[i+2]-d[j+2])+Math.abs(d[i]-d[k])+Math.abs(d[i+1]-d[k+1])+Math.abs(d[i+2]-d[k+2]);count++}return total/count
}
function analyze(){
 if(!state.background){state.autoLayout='left';drawAll();return}var candidates={left:[.02,.04,.8,.43],stacked:[.01,.03,.5,.48],right:[.5,.16,.49,.54]},best='left',score=Infinity;
 Object.keys(candidates).forEach(function(k){var s=regionScore(state.background,candidates[k]);if(s<score){score=s;best=k}});state.autoLayout=best;drawAll();status('Composição automática: '+({left:'esquerda',stacked:'superior',right:'direita'}[best]),false)
}
function fileImage(file){return new Promise(function(resolve,reject){var u=URL.createObjectURL(file),im=new Image();im.onload=function(){URL.revokeObjectURL(u);resolve(im)};im.onerror=function(){URL.revokeObjectURL(u);reject(new Error('Imagem inválida'))};im.src=u})}
function removeWhite(im){
 var max=900,s=Math.min(1,max/Math.max(im.width,im.height)),c=document.createElement('canvas');c.width=Math.round(im.width*s);c.height=Math.round(im.height*s);var x=c.getContext('2d');x.drawImage(im,0,0,c.width,c.height);var data=x.getImageData(0,0,c.width,c.height),d=data.data,w=c.width,h=c.height,corners=[[0,0],[w-1,0],[0,h-1],[w-1,h-1]],avg=[0,0,0];
 corners.forEach(function(p){var i=(p[1]*w+p[0])*4;avg[0]+=d[i]/4;avg[1]+=d[i+1]/4;avg[2]+=d[i+2]/4});var seen=new Uint8Array(w*h),queue=new Int32Array(w*h),head=0,tail=0;
 function isBackground(px,tolerance,spreadLimit){var i=px*4,dist=Math.sqrt((d[i]-avg[0])**2+(d[i+1]-avg[1])**2+(d[i+2]-avg[2])**2),spread=Math.max(d[i],d[i+1],d[i+2])-Math.min(d[i],d[i+1],d[i+2]);return d[i+3]>0&&dist<=tolerance&&spread<=spreadLimit}
 function add(px){if(px<0||px>=w*h||seen[px])return;seen[px]=1;queue[tail++]=px}for(var xx=0;xx<w;xx++){add(xx);add((h-1)*w+xx)}for(var yy=0;yy<h;yy++){add(yy*w);add(yy*w+w-1)}
 while(head<tail){var p=queue[head++];if(!isBackground(p,78,62))continue;d[p*4+3]=0;var px=p%w,py=(p/w)|0;if(px)add(p-1);if(px<w-1)add(p+1);if(py)add(p-w);if(py<h-1)add(p+w)}
 // A primeira passagem alcança somente o fundo ligado às bordas. Esta segunda encontra
 // ilhas internas da mesma cor, como vãos de alças, cabos e estruturas vazadas.
 // Os limites preservam letras claras pequenas e grandes áreas de produtos brancos.
 var innerSeen=new Uint8Array(w*h),minArea=Math.max(24,Math.round(w*h*.00025)),maxArea=Math.round(w*h*.08);
 for(var start=0;start<w*h;start++){
  if(innerSeen[start])continue;innerSeen[start]=1;if(d[start*4+3]===0||!isBackground(start,78,62))continue;
  head=0;tail=0;queue[tail++]=start;var members=[],minX=w,maxX=0,minY=h,maxY=0;
  while(head<tail){var q=queue[head++],qx=q%w,qy=(q/w)|0;members.push(q);if(qx<minX)minX=qx;if(qx>maxX)maxX=qx;if(qy<minY)minY=qy;if(qy>maxY)maxY=qy;
   var neighbors=[qx?q-1:-1,qx<w-1?q+1:-1,qy?q-w:-1,qy<h-1?q+w:-1];for(var n=0;n<4;n++){var next=neighbors[n];if(next<0||innerSeen[next])continue;innerSeen[next]=1;if(isBackground(next,78,62))queue[tail++]=next}
  }
  if(members.length>=minArea&&members.length<=maxArea&&(maxX-minX)>=3&&(maxY-minY)>=3)for(var m=0;m<members.length;m++)d[members[m]*4+3]=0
 }
 x.putImageData(data,0,0);return c
}
function updateProduct(){
 if(!state.product){state.productDrawable=state.productHasCircle?state.productDrawable:null;drawAll();return}status('Preparando o produto…',true);setTimeout(function(){try{state.productDrawable=$('#removeWhite').checked?removeWhite(state.product):state.product;status('Produto pronto',false)}catch(e){state.productDrawable=state.product;status('Produto carregado sem recorte automático',false)}state.productHasCircle=false;drawAll()},30)
}
function setupDrop(dropSel,inputSel,nameSel,handler){
 var drop=$(dropSel),input=$(inputSel),name=$(nameSel);input.addEventListener('change',function(){if(input.files[0])handler(input.files[0],name)});['dragenter','dragover'].forEach(function(e){drop.addEventListener(e,function(ev){ev.preventDefault();drop.classList.add('is-dragging')})});['dragleave','drop'].forEach(function(e){drop.addEventListener(e,function(ev){ev.preventDefault();drop.classList.remove('is-dragging')})});drop.addEventListener('drop',function(ev){var f=ev.dataTransfer.files[0];if(f)handler(f,name)})
}
function rankedLayouts(){
 var rects={left:[.02,.04,.8,.43],stacked:[.01,.03,.5,.48],right:[.5,.16,.49,.54]};if(!state.background)return['left','stacked','right'];return Object.keys(rects).map(function(layout){return{layout:layout,score:regionScore(state.background,rects[layout])}}).sort(function(a,b){return a.score-b.score}).map(function(x){return x.layout})
}
function compositionPresets(){var layouts=rankedLayouts();return{balanced:{layout:layouts[0],feed:1,story:1,scale:1,label:'Equilibrada'},product:{layout:layouts[1]||layouts[0],feed:1.08,story:1.4,scale:1.14,label:'Produto em destaque'},full:{layout:layouts[2]||layouts[0],feed:1,story:1.8,scale:1.05,label:'Preenchimento total'}}}
function syncCompositionControls(){var feed=Math.round(state.bgZoom.feed*100),story=Math.round(state.bgZoom.story*100),scale=Math.round(state.overlayScale*100);$('#backgroundZoomFeed').value=feed;$('#backgroundZoomFeedOut').value=feed+'%';$('#backgroundZoomStory').value=story;$('#backgroundZoomStoryOut').value=story+'%';$('#overlayScale').value=scale;$('#overlayScaleOut').value=scale+'%'}
function applyComposition(key){var preset=compositionPresets()[key];if(!preset)return;$('#layoutMode').value=preset.layout;state.autoLayout=preset.layout;state.bgZoom.feed=preset.feed;state.bgZoom.story=preset.story;state.overlayScale=preset.scale;state.format.feed={bgDx:0,bgDy:0,overlayDx:0,overlayDy:0};state.format.story={bgDx:0,bgDy:0,overlayDx:0,overlayDy:0};syncCompositionControls();$$('[data-composition]').forEach(function(button){button.classList.toggle('is-active',button.dataset.composition===key)});drawAll();status('Composição aplicada: '+preset.label,false)}
function generateCompositions(){var box=$('#compositionOptions');box.hidden=false;$$('[data-composition]').forEach(function(button){button.classList.remove('is-active')});status('Três sugestões prontas para escolher',false)}
function safePart(value){return((value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/gi,'_').replace(/^_|_$/g,'').toUpperCase()||'PRODUTO')}
function exportBaseName(){var title=splitName($('#productName').value||'produto').title,codes=[normalizeCode($('#productCode').value)];if($('#codeCount').value==='2')codes.push(normalizeCode($('#productCode2').value));codes=codes.filter(Boolean);return safePart(title)+(codes.length?'_'+codes.join('_'):'')}
function exportFileName(format){return exportBaseName()+'_'+format.toUpperCase()+'.jpg'}
function canvasBlob(format){return new Promise(function(resolve,reject){canvases[format].toBlob(function(blob){if(blob)resolve(blob);else reject(new Error('Falha ao gerar '+format))},'image/jpeg',.94)})}
function triggerBlob(blob,name){var a=document.createElement('a'),u=URL.createObjectURL(blob);a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(u)},1200)}
function download(format){var name=exportFileName(format);status('Gerando '+name+'…',true);canvasBlob(format).then(function(blob){triggerBlob(blob,name);status(name+' baixado',false)}).catch(function(){status('Não foi possível gerar '+name,false)})}
var ZIP_CRC_TABLE=(function(){var table=[];for(var n=0;n<256;n++){var c=n;for(var k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;table[n]=c>>>0}return table})();
function zipCrc(bytes){var crc=0xffffffff;for(var i=0;i<bytes.length;i++)crc=ZIP_CRC_TABLE[(crc^bytes[i])&255]^(crc>>>8);return(crc^0xffffffff)>>>0}
function zipHeader(size){var bytes=new Uint8Array(size),view=new DataView(bytes.buffer);return{bytes:bytes,u16:function(offset,value){view.setUint16(offset,value,true)},u32:function(offset,value){view.setUint32(offset,value>>>0,true)}}}
function zipDate(){var d=new Date(),year=Math.max(1980,d.getFullYear());return{time:(d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1),date:((year-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate()}}
function makeZip(files){var encoder=new TextEncoder(),stamp=zipDate(),locals=[],centrals=[],offset=0;files.forEach(function(file){var name=encoder.encode(file.name),data=file.data,crc=zipCrc(data),local=zipHeader(30);local.u32(0,0x04034b50);local.u16(4,20);local.u16(6,0x800);local.u16(8,0);local.u16(10,stamp.time);local.u16(12,stamp.date);local.u32(14,crc);local.u32(18,data.length);local.u32(22,data.length);local.u16(26,name.length);local.u16(28,0);locals.push(local.bytes,name,data);var central=zipHeader(46);central.u32(0,0x02014b50);central.u16(4,20);central.u16(6,20);central.u16(8,0x800);central.u16(10,0);central.u16(12,stamp.time);central.u16(14,stamp.date);central.u32(16,crc);central.u32(20,data.length);central.u32(24,data.length);central.u16(28,name.length);central.u16(30,0);central.u16(32,0);central.u16(34,0);central.u16(36,0);central.u32(38,0);central.u32(42,offset);centrals.push(central.bytes,name);offset+=30+name.length+data.length});var centralSize=centrals.reduce(function(total,part){return total+part.length},0),end=zipHeader(22);end.u32(0,0x06054b50);end.u16(4,0);end.u16(6,0);end.u16(8,files.length);end.u16(10,files.length);end.u32(12,centralSize);end.u32(16,offset);end.u16(20,0);return new Blob(locals.concat(centrals,[end.bytes]),{type:'application/zip'})}
function downloadZip(){var base=exportBaseName();status('Montando pacote ZIP…',true);Promise.all([canvasBlob('feed'),canvasBlob('story')]).then(function(blobs){return Promise.all(blobs.map(function(blob){return blob.arrayBuffer()}))}).then(function(buffers){var zip=makeZip([{name:base+'_FEED.jpg',data:new Uint8Array(buffers[0])},{name:base+'_STORY.jpg',data:new Uint8Array(buffers[1])}]);triggerBlob(zip,base+'_FEED_STORY.zip');status('Pacote ZIP baixado',false)}).catch(function(){status('Não foi possível gerar o pacote ZIP',false)})}
setupDrop('#backgroundDrop','#backgroundFile','#backgroundFileName',function(file,name){name.textContent=file.name;status('Analisando a foto…',true);fileImage(file).then(function(im){state.background=im;state.format.feed={bgDx:0,bgDy:0,overlayDx:0,overlayDy:0};state.format.story={bgDx:0,bgDy:0,overlayDx:0,overlayDy:0};analyze()}).catch(function(){status('Não foi possível abrir a foto',false)})});
setupDrop('#productDrop','#productFile','#productFileName',function(file,name){setProductFilePreviewFromFile(file);fileImage(file).then(function(im){state.product=im;updateProduct()}).catch(function(){status('Não foi possível abrir o produto',false)})});
['#productName','#productCode','#productCode2','#codeVariant1','#codeVariant2','#brandVariant'].forEach(function(s){var el=$(s);if(el)el.addEventListener('input',drawAll)});function syncCodeFields(){var dual=$('#codeCount').value==='2';$('#codeVariantField1').hidden=!dual;$('#codeRow1').classList.toggle('is-dual',dual);$('#codeRow2').hidden=!dual;$('#productCodeLabel').textContent=dual?'Código 1':'Código';drawAll()}$('#codeCount').addEventListener('change',syncCodeFields);syncCodeFields();$('#layoutMode').addEventListener('change',drawAll);$('#removeWhite').addEventListener('change',updateProduct);
['feed','story'].forEach(function(format){var cap=format[0].toUpperCase()+format.slice(1),input=$('#backgroundZoom'+cap),output=$('#backgroundZoom'+cap+'Out');input.addEventListener('input',function(){state.bgZoom[format]=this.value/100;output.value=this.value+'%';draw(format)})});$('#overlayScale').addEventListener('input',function(){state.overlayScale=this.value/100;$('#overlayScaleOut').value=this.value+'%';drawAll()});
if($('#brandBadgeColor'))$('#brandBadgeColor').addEventListener('input',function(){state.brandBadgeColor=this.value;drawAll()});
$('#autoCompose').addEventListener('click',analyze);$('#generateCompositions').addEventListener('click',generateCompositions);$$('[data-composition]').forEach(function(button){button.addEventListener('click',function(){applyComposition(button.dataset.composition)})});$('#resetPosition').addEventListener('click',function(){state.format.feed={bgDx:0,bgDy:0,overlayDx:0,overlayDy:0};state.format.story={bgDx:0,bgDy:0,overlayDx:0,overlayDy:0};drawAll();status('Posições centralizadas',false)});
function setMoveMode(mode){$('#moveTarget').value=mode;$$('[data-move-mode]').forEach(function(x){x.classList.toggle('is-active',x.dataset.moveMode===mode)})}
function boxHit(box,px,py){return box&&px>=box[0]&&px<=box[0]+box[2]&&py>=box[1]&&py<=box[1]+box[3]}
function unionBox(a,b){if(!a)return b;if(!b)return a;var x=Math.min(a[0],b[0]),y=Math.min(a[1],b[1]);return[x,y,Math.max(a[0]+a[2],b[0]+b[2])-x,Math.max(a[1]+a[3],b[1]+b[3])-y]}
function flashMoveTarget(format,cap,hit,canvasRect,box){
 var el=$('#moveFlash'+cap);if(!el)return;
 var scale=canvasRect.width/canvases[format].width,x=0,y=0,w=canvasRect.width,h=canvasRect.height;
 if(hit&&box){x=box[0]*scale;y=box[1]*scale;w=box[2]*scale;h=box[3]*scale}
 el.style.left=x+'px';el.style.top=y+'px';el.style.width=w+'px';el.style.height=h+'px';
 el.querySelector('span').textContent=hit?'Destaque selecionado':'Fundo selecionado';
 el.classList.toggle('is-background',!hit);
 el.classList.remove('is-firing');void el.offsetWidth;el.classList.add('is-firing')
}
$$('[data-move-mode]').forEach(function(b){b.addEventListener('click',function(){setMoveMode(b.dataset.moveMode)})});$('#moveTarget').addEventListener('change',function(){setMoveMode($('#moveTarget').value)});
Object.keys(canvases).forEach(function(format){
 var c=canvases[format],cap=format[0].toUpperCase()+format.slice(1),zoomInput=$('#backgroundZoom'+cap),zoomOut=$('#backgroundZoom'+cap+'Out'),drag=null;
 c.addEventListener('pointerdown',function(e){drag={x:e.clientX,y:e.clientY};c.setPointerCapture(e.pointerId)});
 c.addEventListener('pointermove',function(e){if(!drag)return;var scale=c.width/c.getBoundingClientRect().width,dx=(e.clientX-drag.x)*scale,dy=(e.clientY-drag.y)*scale;drag={x:e.clientX,y:e.clientY};if($('#moveTarget').value==='background'){state.format[format].bgDx+=dx;state.format[format].bgDy+=dy}else{state.format[format].overlayDx+=dx;state.format[format].overlayDy+=dy}drawAll()});
 ['pointerup','pointercancel'].forEach(function(ev){c.addEventListener(ev,function(){drag=null})});
 c.addEventListener('dblclick',function(e){
  var rect=c.getBoundingClientRect(),scaleX=c.width/rect.width,scaleY=c.height/rect.height,px=(e.clientX-rect.left)*scaleX,py=(e.clientY-rect.top)*scaleY,destaqueBox=unionBox(lastProductBox[format],lastBadgeBox[format]),hit=boxHit(destaqueBox,px,py);
  setMoveMode(hit?'overlay':'background');status(hit?'Arraste para mover o destaque':'Arraste para mover o fundo',false);
  flashMoveTarget(format,cap,hit,rect,destaqueBox)
 });
 c.addEventListener('wheel',function(e){
  if(!zoomInput)return;e.preventDefault();
  var min=Number(zoomInput.min)||80,max=Number(zoomInput.max)||180,pct=Math.max(min,Math.min(max,Math.round(state.bgZoom[format]*100)+(e.deltaY<0?5:-5)));
  state.bgZoom[format]=pct/100;zoomInput.value=pct;if(zoomOut)zoomOut.value=pct+'%';draw(format)
 },{passive:false});
});
$('#downloadFeed').onclick=function(){download('feed')};$('#downloadStory').onclick=function(){download('story')};$('#downloadBoth').onclick=downloadZip;$$('[data-download]').forEach(function(b){b.onclick=function(){download(b.dataset.download)}});
$('#catalogSearch').addEventListener('input',function(){catalogFocus=0;renderCatalogResults()});
$('#catalogSearch').addEventListener('keydown',function(ev){var matches=matchingProducts(this.value);if(ev.key==='ArrowDown'&&matches.length){catalogFocus=Math.min(matches.length-1,catalogFocus+1);renderCatalogResults();ev.preventDefault()}else if(ev.key==='ArrowUp'&&matches.length){catalogFocus=Math.max(0,catalogFocus-1);renderCatalogResults();ev.preventDefault()}else if(ev.key==='Enter'&&matches.length){chooseCatalogProduct(matches[catalogFocus]||matches[0]);ev.preventDefault()}});
$('#manualProduct').addEventListener('click',chooseManualProduct);$('#changeProduct').addEventListener('click',function(){goToStep('choose')});
$('#changeEditoriaChoose').addEventListener('click',function(){goToStep('editoria')});$('#changeEditoriaEdit').addEventListener('click',function(){goToStep('editoria')});
setFlow('editoria');renderEditoriaGrid();loadCatalog();refreshEditoriasFromServer();
var embedded=window.POST_EDITOR_ASSETS||{};loadImage(embedded.product||'post-editor-assets/demo-product.png').then(function(im){if(!selectedProduct&&!state.product&&$('#editorWorkspace').hidden)state.productDrawable=im;drawAll();try{canvases.feed.toDataURL('image/jpeg',.1);document.body.dataset.exportReady='true';status('Editor pronto',false)}catch(e){document.body.dataset.exportReady='false';status('Prévia pronta; exportação bloqueada pelo navegador',false)}}).catch(function(){drawAll();status('Editor aberto; alguns elementos não carregaram',false)});
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(drawAll);else drawAll();
window.PostEditor={redraw:drawAll,state:state,chooseProduct:chooseCatalogProduct,getCatalog:function(){return catalog.slice()},makeZip:makeZip,exportBaseName:exportBaseName};
})();





