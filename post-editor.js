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
var state={editoriaName:null,editoriaColor:null,footerColor:'#FFBE00',background:null,product:null,productDrawable:null,productHasCircle:true,badgeFeed:null,badgeStory:null,autoLayout:'left',bgZoom:{feed:1,story:1},overlayScale:1,format:{feed:{bgDx:0,bgDy:0,overlayDx:0,overlayDy:0},story:{bgDx:0,bgDy:0,overlayDx:0,overlayDy:0}}};
var TEST_CATALOG=[{
 name:'Lavadora de alta pressão LAV 1600, 1.600 lbf/pol², 127 V~, VONDER',
 title:'Lavadora de alta pressão',
 subtitle:'LAV 1600, 1.600 lbf/pol², 127 V~',
 code:'68.64.160.001',
 image:(window.POST_EDITOR_ASSETS&&window.POST_EDITOR_ASSETS.lavadora)||'post-editor-assets/lavadora-lav1600-127v.jpg',
 background:(window.POST_EDITOR_ASSETS&&window.POST_EDITOR_ASSETS.lavadoraUsage)||'post-editor-assets/lavadora-lav1600-uso.jpg',
 preferredLayout:'right',
 sourceUrl:'https://www.vonder.com.br/produto/lavadora_de_alta_presso_lav_1600_1600_lbfpol_127_v_vonder/12507'
}];
var catalog=[],selectedProduct=null,catalogFocus=0;
// ============================================================
// EDITORIAS — mesma fonte usada em Configurações → Editorias no Calendário (app.js), lida
// direto da mesma chave de localStorage (cada marca tem sua própria lista, ver BRAND_SUFFIX).
// Cada editoria só é selecionável aqui se tiver um preset registrado em EDITORIA_PRESETS;
// as demais aparecem desabilitadas ("Em breve") até ganharem composição própria.
// ============================================================
var BRAND_SUFFIX=(window.PortalBrand&&window.PortalBrand.suffix)||'';
var CALENDAR_SETTINGS_KEY='calendar_settings_v1'+BRAND_SUFFIX;
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
var EDITORIA_PRESETS=EDITORIA_PRESETS_BY_BRAND[BRAND_SUFFIX]||{};
function escapeHtml(value){return String(value||'').replace(/[&<>\"]/g,function(ch){return{'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[ch]})}
function normalizeText(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()}
function normalizeCode(value){return String(value||'').replace(/\D/g,'')}
function productImageUrl(code){var digits=normalizeCode(code);return digits?'product-image.php?code='+encodeURIComponent(digits):''}
function itemImageUrl(item){var codes=catalogCodes(item);return(item&&(item.imageUrl||item.image||item.photo))||productImageUrl(codes[0]&&codes[0].code)}
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
 syncEditoriaBadges();status('Carregando preset de '+editoria.name+'…',true);
 Promise.all([loadImage(preset.badgeFeed),loadImage(preset.badgeStory)]).then(function(v){state.badgeFeed=v[0];state.badgeStory=v[1];drawAll();status('Preset de '+editoria.name+' carregado',false)}).catch(function(){drawAll();status('Preset de '+editoria.name+' carregado; algumas imagens não abriram',false)});
 setFlow('choose')
}
function updateSelectedSummary(item,manual){
 var thumb=$('#selectedProductThumb');thumb.innerHTML='＋';$('#selectedProductName').textContent=manual?'Produto manual':(item.name||'Produto sem nome');$('#selectedProductCode').textContent=manual?'Sem vínculo com o catálogo':(catalogCodes(item).map(function(v){return v.code}).join(' · ')||'Sem código');
 var url=!manual&&itemImageUrl(item);if(url){var im=document.createElement('img');im.src=url;im.alt='';im.onerror=function(){thumb.textContent='＋'};thumb.innerHTML='';thumb.appendChild(im)}
}
function showEditor(item,manual){updateSelectedSummary(item||{},!!manual);setFlow('edit');setTimeout(function(){drawAll()},0)}
function chooseManualProduct(){
 selectedProduct=null;$('#productName').value='';$('#productCode').value='';$('#productCode2').value='';$('#codeCount').value='1';state.product=null;state.productDrawable=null;state.productHasCircle=false;state.background=null;$('#productFileName').textContent='PNG transparente ou foto em fundo branco';$('#backgroundFileName').textContent='Clique ou arraste uma imagem';syncCodeFields();showEditor({},true);drawAll();status('Preencha os dados e envie as imagens',false)
}
function chooseCatalogProduct(item){
 selectedProduct=item;var codes=catalogCodes(item);$('#productName').value=editorNameFor(item);$('#productCode').value=codes[0]?codes[0].code:'';$('#productCode2').value=codes[1]?codes[1].code:'';$('#codeVariant1').value=(codes[0]&&codes[0].label)||'110 V~';$('#codeVariant2').value=(codes[1]&&codes[1].label)||'220 V~';$('#codeCount').value=codes.length>1?'2':'1';syncCodeFields();
 state.product=null;state.productDrawable=null;state.productHasCircle=false;state.background=null;state.format.feed={bgDx:0,bgDy:0,overlayDx:0,overlayDy:0};state.format.story={bgDx:0,bgDy:0,overlayDx:0,overlayDy:0};showEditor(item,false);drawAll();
 var bgUrl=itemBackgroundUrl(item);if(bgUrl){$('#backgroundFileName').textContent='Foto de aplicação do catálogo';loadImage(bgUrl).then(function(im){if(selectedProduct!==item)return;state.background=trimBackgroundMargins(im);state.bgZoom.feed=1;state.bgZoom.story=1;$('#backgroundZoomFeed').value='100';$('#backgroundZoomStory').value='100';$('#backgroundZoomFeedOut').value='100%';$('#backgroundZoomStoryOut').value='100%';setStoryExtensionForImage(state.background);if(item.preferredLayout){state.autoLayout=item.preferredLayout;drawAll();status('Produto e foto de aplicação carregados',false)}else analyze()}).catch(function(){if(selectedProduct!==item)return;$('#backgroundFileName').textContent='Envie a foto de fundo manualmente';status('Produto carregado; a foto de aplicação não abriu',false)})}else{$('#backgroundFileName').textContent='Clique ou arraste uma imagem'}
 var url=itemImageUrl(item);if(!url){status('Dados preenchidos; envie a foto do produto',false);return}status(bgUrl?'Carregando produto e foto de aplicação…':'Carregando e recortando a foto do catálogo…',true);$('#productFileName').textContent='Foto do catálogo · '+(codes[0]?codes[0].code:'produto');
 loadImage(url).then(function(im){if(selectedProduct!==item)return;state.product=im;$('#removeWhite').checked=true;updateProduct()}).catch(function(){if(selectedProduct!==item)return;status('Dados preenchidos; não foi possível carregar a foto automaticamente',false);$('#productFileName').textContent='Envie a foto do produto manualmente'})
}
function matchingProducts(query){var q=normalizeText(query.trim()),qc=normalizeCode(query);return catalog.filter(function(item){var codeHit=qc&&catalogCodes(item).some(function(v){return normalizeCode(v.code).includes(qc)});return!q||normalizeText(item.name).includes(q)||codeHit}).slice(0,10)}
function renderCatalogResults(){
 var query=$('#catalogSearch').value,matches=matchingProducts(query),box=$('#catalogResults');catalogFocus=Math.min(catalogFocus,Math.max(0,matches.length-1));$('#catalogStatus').textContent=catalog.length?(query?matches.length+' produto'+(matches.length===1?' encontrado':'s encontrados'):catalog.length+' produtos disponíveis'):'Nenhum produto cadastrado nesta marca';
 if(!catalog.length){box.innerHTML='<div class="pe-catalog-empty"><strong>O catálogo ainda está vazio</strong>Cadastre produtos em Configurações no calendário ou continue sem catálogo.</div>';return}
 if(!matches.length){box.innerHTML='<div class="pe-catalog-empty"><strong>Nenhum produto encontrado</strong>Tente buscar apenas uma parte do nome ou os números do código.</div>';return}
 box.innerHTML=matches.map(function(item,index){var image=itemImageUrl(item);return'<button type="button" class="pe-catalog-item'+(index===catalogFocus?' is-focused':'')+'" data-catalog-index="'+index+'" role="option" aria-selected="'+(index===catalogFocus)+'">'+(image?'<img src="'+escapeHtml(image)+'" alt="">':'<span class="pe-selected-thumb">＋</span>')+'<span><strong>'+escapeHtml(item.name)+'</strong><small>'+escapeHtml(catalogCodes(item).map(function(v){return v.code}).join(' · '))+'</small></span><span>›</span></button>'}).join('');
 $$('#catalogResults [data-catalog-index]').forEach(function(btn){btn.addEventListener('click',function(){chooseCatalogProduct(matches[Number(btn.dataset.catalogIndex)])})})
}
function loadCatalog(){
 catalog=TEST_CATALOG.slice();catalogFocus=0;renderCatalogResults()
}
function status(message,busy){var el=$('#editorStatus');el.classList.toggle('is-busy',!!busy);el.querySelector('span:last-child').textContent=message}
function loadImage(src){return new Promise(function(resolve,reject){function direct(){var im=new Image();im.onload=function(){resolve(im)};im.onerror=reject;im.src=src}if(/^data:/.test(src)){direct();return}try{var xhr=new XMLHttpRequest();xhr.open('GET',src,true);xhr.responseType='blob';xhr.onload=function(){if(!xhr.response||(xhr.status&&xhr.status>=400)){direct();return}var u=URL.createObjectURL(xhr.response),im=new Image();im.onload=function(){URL.revokeObjectURL(u);resolve(im)};im.onerror=function(){URL.revokeObjectURL(u);direct()};im.src=u};xhr.onerror=direct;xhr.send()}catch(e){direct()}})}
function trimBackgroundMargins(im){var c=document.createElement('canvas');c.width=im.width;c.height=im.height;var ctx=c.getContext('2d');ctx.drawImage(im,0,0);var pixels=ctx.getImageData(0,0,c.width,c.height).data,minX=c.width,minY=c.height,maxX=-1,maxY=-1;for(var y=0;y<c.height;y++)for(var x=0;x<c.width;x++){var i=(y*c.width+x)*4;if(pixels[i+3]>8&&(pixels[i]<245||pixels[i+1]<245||pixels[i+2]<245)){if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y}}if(maxX<minX||maxY<minY)return im;var cropW=maxX-minX+1,cropH=maxY-minY+1;if(cropW>=c.width*.98&&cropH>=c.height*.98)return im;var inset=3;minX=Math.min(maxX,minX+inset);minY=Math.min(maxY,minY+inset);maxX=Math.max(minX,maxX-inset);maxY=Math.max(minY,maxY-inset);cropW=maxX-minX+1;cropH=maxY-minY+1;var out=document.createElement('canvas');out.width=cropW;out.height=cropH;out.getContext('2d').drawImage(c,minX,minY,cropW,cropH,0,0,cropW,cropH);return out}
function drawPlaceholder(ctx,t){
 var g=ctx.createLinearGradient(0,0,t.w,t.h);g.addColorStop(0,'#202427');g.addColorStop(.48,'#5a5f5d');g.addColorStop(1,'#1d201f');ctx.fillStyle=g;ctx.fillRect(0,0,t.w,t.h);
 ctx.save();ctx.globalAlpha=.13;ctx.fillStyle='#fff';for(var i=0;i<8;i++){ctx.fillRect(i*170-120,t.h*.62,100,t.h*.38)}ctx.restore()
}
function refreshStoryExtendHint(){var hint=$('#storyExtendHint');if(!hint)return;hint.textContent=$('#storyExtend').checked?'Foto inteira com continuação desfocada nas bordas.':'Enquadramento normal, preenchendo o Story com corte.'}
function setStoryExtensionForImage(im){var needsExtension=!!im&&(im.width/im.height)>.68;$('#storyExtend').checked=needsExtension;refreshStoryExtendHint()}
function drawCover(ctx,img,t,format){
 var cover=Math.max(t.w/img.width,t.h/img.height),p=state.format[format],zoom=state.bgZoom[format],extendStory=format==='story'&&$('#storyExtend')&&$('#storyExtend').checked;
 if(extendStory){var back=cover*1.08,bw=img.width*back,bh=img.height*back;ctx.save();ctx.filter='blur(34px) brightness(.72)';ctx.drawImage(img,(t.w-bw)/2,(t.h-bh)/2,bw,bh);ctx.restore();var fit=Math.min(t.w/img.width,t.h/img.height),progress=Math.max(0,Math.min(1,(zoom-1)/.8)),fs=fit+(cover-fit)*progress,fw=img.width*fs,fh=img.height*fs;ctx.drawImage(img,(t.w-fw)/2+p.bgDx,(t.h-fh)/2+p.bgDy,fw,fh);return}
 if(zoom<1){var blurScale=cover*1.08,blurW=img.width*blurScale,blurH=img.height*blurScale;ctx.save();ctx.filter='blur(28px) brightness(.82)';ctx.drawImage(img,(t.w-blurW)/2+p.bgDx,(t.h-blurH)/2+p.bgDy,blurW,blurH);ctx.restore()}
 var s=cover*zoom,w=img.width*s,h=img.height*s,x=(t.w-w)/2+p.bgDx,y=(t.h-h)/2+p.bgDy;ctx.drawImage(img,x,y,w,h)
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
function scaled(box,format){var s=state.overlayScale,p=state.format[format],cx=box[0]+box[2]/2,cy=box[1]+box[3]/2;return[cx-box[2]*s/2+p.overlayDx,cy-box[3]*s/2+p.overlayDy,box[2]*s,box[3]*s]}
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
 if(state.background)drawCover(ctx,state.background,t,format);else drawPlaceholder(ctx,t);
 var productBox=scaled(pos.product,format),badgeBox=scaled(pos.badge,format);drawProduct(ctx,productBox);var badge=format==='feed'?state.badgeFeed:state.badgeStory;if(badge)ctx.drawImage(badge,badgeBox[0],badgeBox[1],badgeBox[2],badgeBox[3]);drawFooter(ctx,t)
}
function drawAll(){draw('feed');draw('story')}
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
function applyComposition(key){var preset=compositionPresets()[key];if(!preset)return;$('#layoutMode').value=preset.layout;state.autoLayout=preset.layout;state.bgZoom.feed=preset.feed;state.bgZoom.story=preset.story;state.overlayScale=preset.scale;state.format.feed={bgDx:0,bgDy:0,overlayDx:0,overlayDy:0};state.format.story={bgDx:0,bgDy:0,overlayDx:0,overlayDy:0};if(key==='full')$('#storyExtend').checked=true;syncCompositionControls();refreshStoryExtendHint();$$('[data-composition]').forEach(function(button){button.classList.toggle('is-active',button.dataset.composition===key)});drawAll();status('Composição aplicada: '+preset.label,false)}
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
setupDrop('#backgroundDrop','#backgroundFile','#backgroundFileName',function(file,name){name.textContent=file.name;status('Analisando a foto…',true);fileImage(file).then(function(im){state.background=im;state.format.feed={bgDx:0,bgDy:0,overlayDx:0,overlayDy:0};state.format.story={bgDx:0,bgDy:0,overlayDx:0,overlayDy:0};setStoryExtensionForImage(state.background);analyze()}).catch(function(){status('Não foi possível abrir a foto',false)})});
setupDrop('#productDrop','#productFile','#productFileName',function(file,name){name.textContent=file.name;fileImage(file).then(function(im){state.product=im;updateProduct()}).catch(function(){status('Não foi possível abrir o produto',false)})});
['#productName','#productCode','#productCode2','#codeVariant1','#codeVariant2'].forEach(function(s){$(s).addEventListener('input',drawAll)});function syncCodeFields(){var dual=$('#codeCount').value==='2';$('#codeVariantField1').hidden=!dual;$('#codeRow1').classList.toggle('is-dual',dual);$('#codeRow2').hidden=!dual;$('#productCodeLabel').textContent=dual?'Código 1':'Código';drawAll()}$('#codeCount').addEventListener('change',syncCodeFields);syncCodeFields();$('#layoutMode').addEventListener('change',drawAll);$('#removeWhite').addEventListener('change',updateProduct);
['feed','story'].forEach(function(format){var cap=format[0].toUpperCase()+format.slice(1),input=$('#backgroundZoom'+cap),output=$('#backgroundZoom'+cap+'Out');input.addEventListener('input',function(){state.bgZoom[format]=this.value/100;output.value=this.value+'%';draw(format)})});$('#storyExtend').addEventListener('change',function(){refreshStoryExtendHint();draw('story');status(this.checked?'Bordas do Story completadas':'Story usando enquadramento com corte',false)});refreshStoryExtendHint();$('#overlayScale').addEventListener('input',function(){state.overlayScale=this.value/100;$('#overlayScaleOut').value=this.value+'%';drawAll()});
$('#autoCompose').addEventListener('click',analyze);$('#generateCompositions').addEventListener('click',generateCompositions);$$('[data-composition]').forEach(function(button){button.addEventListener('click',function(){applyComposition(button.dataset.composition)})});$('#resetPosition').addEventListener('click',function(){state.format.feed={bgDx:0,bgDy:0,overlayDx:0,overlayDy:0};state.format.story={bgDx:0,bgDy:0,overlayDx:0,overlayDy:0};drawAll();status('Posições centralizadas',false)});
$$('[data-move-mode]').forEach(function(b){b.addEventListener('click',function(){$$('[data-move-mode]').forEach(function(x){x.classList.remove('is-active')});b.classList.add('is-active');$('#moveTarget').value=b.dataset.moveMode})});$('#moveTarget').addEventListener('change',function(){$$('[data-move-mode]').forEach(function(x){x.classList.toggle('is-active',x.dataset.moveMode===$('#moveTarget').value)})});
Object.keys(canvases).forEach(function(format){var c=canvases[format],drag=null;c.addEventListener('pointerdown',function(e){drag={x:e.clientX,y:e.clientY};c.setPointerCapture(e.pointerId)});c.addEventListener('pointermove',function(e){if(!drag)return;var scale=c.width/c.getBoundingClientRect().width,dx=(e.clientX-drag.x)*scale,dy=(e.clientY-drag.y)*scale;drag={x:e.clientX,y:e.clientY};if($('#moveTarget').value==='background'){state.format[format].bgDx+=dx;state.format[format].bgDy+=dy}else{state.format[format].overlayDx+=dx;state.format[format].overlayDy+=dy}drawAll()});['pointerup','pointercancel'].forEach(function(ev){c.addEventListener(ev,function(){drag=null})})});
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
