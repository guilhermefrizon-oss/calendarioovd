(function(){
"use strict";
function $(id){return document.getElementById(id)}
function esc(value){return String(value==null?"":value).replace(/[&<>"']/g,function(c){return({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[c]})}
function clean(value){return String(value==null?"":value).replace(/\r\n/g,"\n").split("\n").map(function(line){return line.trim().replace(/[ \t]{2,}/g," ")}).join("\n").trim()}
function normalize(value){return String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"")}
function safeFile(value){return normalize(value).replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||"cartao"}
function activeBrand(){
  var portal=window.PortalBrand||{};
  var list=portal.list||[];
  return list.find(function(item){return item.id===portal.activeId})||list[0]||{id:"default",name:"VONDER",shortName:"VD",photo:"icons/icon_vonder.jpg"}
}
var brand=activeBrand();var embeddedAssets=window.BusinessCardAssets||{logos:{}};
var BRAND_TEMPLATES={
  "default":{label:"Institucional VONDER",source:"Identidade exclusiva VONDER",accent:"#F6BE00",ink:"#171717",style:"diagonal"},
  "ferramentas-gerais":{label:"FG Genérico 94 × 54 mm",source:"Illustrator .ai fornecido",accent:"#135844",ink:"#56565a",style:"fg"},
  "osten-ferragens":{label:"Institucional OSTEN",source:"Identidade exclusiva OSTEN",accent:"#ED8B00",ink:"#252525",style:"sidebar"},
  "dismatal":{label:"Institucional DISMATAL",source:"Identidade exclusiva DISMATAL",accent:"#FFED00",ink:"#181818",style:"stripe"},
  "toolmix":{label:"Institucional TOOLMIX",source:"Identidade exclusiva TOOLMIX",accent:"#F26522",ink:"#272727",style:"corner"},
  "dwt":{label:"Institucional DWT",source:"Identidade exclusiva DWT",accent:"#285C4D",secondary:"#AB2328",ink:"#262626",style:"split"},
  "nove54":{label:"Institucional NOVE54",source:"Identidade exclusiva NOVE54",accent:"#BD1D1D",ink:"#191919",style:"rail"},
  "grupo-ovd":{label:"Institucional GRUPO OVD",source:"Identidade exclusiva GRUPO OVD",accent:"#A6A6A6",secondary:"#F6BE00",ink:"#202020",style:"group"}
};
var template=BRAND_TEMPLATES[brand.id]||{label:"Institucional "+brand.name,source:"Identidade exclusiva da marca",accent:"#4b5563",ink:"#202124",style:"corner"};
var STORAGE_KEY="business_card_generator_v1__"+brand.id;
var state={records:[],activeId:null};
var canvas=$("cardCanvas"),ctx=canvas.getContext("2d"),W=canvas.width,H=canvas.height,renderToken=0;
var images={};
var fields={name:$("fieldName"),role:$("fieldRole"),address:$("fieldAddress"),phone:$("fieldPhone"),email:$("fieldEmail"),website:$("fieldWebsite")};

function uid(){return"bc_"+Date.now().toString(36)+Math.random().toString(36).slice(2,7)}
function recordFrom(obj){
  return{id:uid(),name:clean(obj.name),role:clean(obj.role),address:clean(obj.address),phone:clean(obj.phone),email:clean(obj.email),website:clean(obj.website),selected:true,reviewed:false,approved:false,issues:[]}
}
function save(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state.records))}catch(e){}}
function load(){
  try{var parsed=JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]");if(Array.isArray(parsed))state.records=parsed}catch(e){}
  if(state.records.length){state.activeId=state.records[0].id;showWorkspace()}
}
function current(){return state.records.find(function(item){return item.id===state.activeId})||null}
function showWorkspace(){
  $("importPanel").hidden=true;$("workspace").hidden=false;$("exportBar").hidden=false;
  renderAll()
}
function toast(message){
  var el=$("toast");el.textContent=message;el.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(function(){el.hidden=true},3200)
}
function updateFlow(){
  var any=state.records.length>0;
  var reviewed=any&&state.records.some(function(r){return r.reviewed});
  var approved=any&&state.records.some(function(r){return r.approved});
  document.querySelectorAll(".bc-flow-step").forEach(function(el){
    var step=el.getAttribute("data-step"),complete=(step==="import"&&any)||(step==="edit"&&reviewed)||(step==="review"&&approved);
    var active=(!any&&step==="import")||(any&&!reviewed&&step==="edit")||(reviewed&&!approved&&step==="review")||(approved&&step==="export");
    el.classList.toggle("is-complete",complete);el.classList.toggle("is-active",active)
  })
}
function renderAll(){
  renderRecords();renderEditor();renderStats();updateFlow();renderCanvas(current())
}
function renderRecords(){
  var list=$("recordsList");$("recordsTitle").textContent=state.records.length+" "+(state.records.length===1?"cartão":"cartões");
  list.innerHTML=state.records.map(function(r,index){
    var cls="bc-record"+(r.id===state.activeId?" is-active":"")+(r.reviewed?" is-reviewed":"")+(r.approved?" is-approved":"");
    return'<button type="button" class="'+cls+'" data-record="'+r.id+'"><input type="checkbox" data-select="'+r.id+'" '+(r.selected?"checked":"")+' aria-label="Selecionar cartão '+(index+1)+'"><span><strong>'+(esc(r.name)||"Cartão sem nome")+'</strong><small>'+esc(r.role||"Cargo não informado")+'</small></span><i class="bc-record-status" title="'+(r.approved?"Aprovado":r.reviewed?"Revisado":"Pendente")+'"></i></button>'
  }).join("");
  list.querySelectorAll("[data-record]").forEach(function(button){button.addEventListener("click",function(ev){if(ev.target.matches("[data-select]"))return;state.activeId=button.getAttribute("data-record");renderAll()})});
  list.querySelectorAll("[data-select]").forEach(function(check){check.addEventListener("change",function(){var r=state.records.find(function(item){return item.id===check.getAttribute("data-select")});if(r){r.selected=check.checked;save();renderRecords();renderStats()}})});
}
function renderEditor(){
  var r=current();Object.keys(fields).forEach(function(key){fields[key].disabled=!r;fields[key].value=r?r[key]||"":""});
  $("editorTitle").textContent=r?(r.name||"Cartão sem nome"):"Selecione um cartão";
  var approve=$("approveCurrent");approve.disabled=!r||!r.reviewed||hasBlocking(r);approve.checked=!!(r&&r.approved);
  renderIssues(r)
}
function renderIssues(r){
  var empty=$("reviewEmpty"),list=$("issuesList");
  if(!r||!r.reviewed){empty.hidden=false;list.hidden=true;empty.querySelector("p").textContent="Execute a revisão antes de aprovar o cartão para exportação.";return}
  empty.hidden=true;list.hidden=false;
  if(!r.issues.length)list.innerHTML='<div class="bc-issue is-ok"><span>✓</span><span>Nenhum problema encontrado. Faça a leitura final da arte e aprove o cartão.</span></div>';
  else list.innerHTML=r.issues.map(function(i){return'<div class="bc-issue '+(i.level==="ok"?"is-ok":"")+'"><span>'+(i.blocking?"!":"•")+'</span><span>'+esc(i.message)+'</span></div>'}).join("")
}
function renderStats(){
  var selected=state.records.filter(function(r){return r.selected}).length;
  var approved=state.records.filter(function(r){return r.approved}).length;
  $("selectionCount").textContent=selected+" selecionado"+(selected===1?"":"s");
  $("selectAll").checked=state.records.length>0&&selected===state.records.length;
  $("selectAll").indeterminate=selected>0&&selected<state.records.length;
  $("approvedCount").textContent=approved+" de "+state.records.length+" aprovados";
  $("exportCurrent").disabled=!current()||!current().approved;
  $("exportSelected").disabled=!selected;
  $("exportAll").disabled=!state.records.length
}
function hasBlocking(r){return !!(r&&r.issues&&r.issues.some(function(i){return i.blocking}))}
function reviewRecord(r){
  Object.keys(fields).forEach(function(key){r[key]=clean(r[key])});
  var issues=[];
  if(!r.name)issues.push({blocking:true,message:"Nome completo não informado."});
  if(!r.role)issues.push({blocking:true,message:"Cargo não informado."});
  if(!r.phone)issues.push({blocking:true,message:"Celular não informado."});
  if(!r.email)issues.push({blocking:true,message:"E-mail não informado."});
  if(r.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email))issues.push({blocking:true,message:"Confira o formato do e-mail."});
  var digits=(r.phone||"").replace(/\D/g,"");
  if(r.phone&&digits.length<10)issues.push({blocking:true,message:"O celular parece estar incompleto."});
  if(r.website&&!/[.]/.test(r.website))issues.push({blocking:false,message:"Confira o endereço do site: não foi encontrado um domínio completo."});
  var scan=(r.name+" "+r.role+" "+r.address).toLowerCase();
  var common=[[/\btecnico\b/,"“técnico”"],[/\bantonio\b/,"“Antônio”"],[/\bsao\b/,"“São”"],[/\bluis\b/,"“Luís”"],[/\bendereco\b/,"“endereço”"],[/\bgerencia\b/,"“gerência”"]];
  common.forEach(function(rule){if(rule[0].test(scan))issues.push({blocking:false,message:"Possível ajuste de acentuação: confira "+rule[1]+"."})});
  if(/[ ]{2,}/.test(r.name+" "+r.role+" "+r.phone))issues.push({blocking:false,message:"Há espaços duplicados; a limpeza automática foi aplicada."});
  r.reviewed=true;r.approved=false;r.issues=issues;save();renderAll();
  toast(issues.length?issues.length+" ponto"+(issues.length===1?"":"s")+" para conferir.":"Revisão concluída sem alertas.")
}
function fieldChanged(ev){
  var r=current();if(!r)return;
  r[ev.target.name]=ev.target.value;r.reviewed=false;r.approved=false;r.issues=[];save();
  $("saveState").textContent="Alterações salvas localmente";renderRecords();renderStats();updateFlow();renderCanvas(r);renderIssues(r);$("approveCurrent").disabled=true;$("approveCurrent").checked=false
}
function headerIndex(headers,aliases){
  for(var i=0;i<headers.length;i++){var h=normalize(headers[i]);if(aliases.indexOf(h)>=0)return i}return-1
}
function importRows(rows){
  if(!rows||rows.length<2){toast("A planilha não contém linhas de dados.");return}
  var headers=rows[0]||[];
  var map={
    name:headerIndex(headers,["nome","nomecompleto","name"]),
    role:headerIndex(headers,["cargo","funcao","função","role"]),
    address:headerIndex(headers,["endereco","address"]),
    phone:headerIndex(headers,["celular","telefone","fone","phone"]),
    email:headerIndex(headers,["email","correioeletronico"]),
    website:headerIndex(headers,["site","website","url"])
  };
  if(map.name<0){toast("Não encontrei a coluna NOME na planilha.");return}
  var records=rows.slice(1).filter(function(row){return row&&row.some(function(v){return clean(v)!==""})}).map(function(row){
    var obj={};Object.keys(map).forEach(function(key){obj[key]=map[key]>=0?row[map[key]]:""});return recordFrom(obj)
  });
  if(!records.length){toast("Nenhum cartão válido foi encontrado.");return}
  state.records=records;state.activeId=records[0].id;save();showWorkspace();toast(records.length+" cartões carregados da planilha.")
}
async function handleFile(file){
  if(!file)return;
  if(!window.XLSX){toast("Leitor de Excel indisponível.");return}
  try{
    var data=await file.arrayBuffer();var workbook=XLSX.read(data,{type:"array",cellDates:false});
    var sheet=workbook.Sheets[workbook.SheetNames[0]];
    var rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:"",raw:false});
    importRows(rows)
  }catch(e){console.error(e);toast("Não foi possível ler a planilha. Confira o arquivo e tente novamente.")}
}
function loadImage(src){
  if(images[src])return images[src];
  images[src]=new Promise(function(resolve){var img=new Image();img.onload=function(){resolve(img)};img.onerror=function(){resolve(null)};img.src=src});
  return images[src]
}
function hexToRgb(hex){var h=String(hex||"#000000").replace("#","");if(h.length===3)h=h.split("").map(function(c){return c+c}).join("");var n=parseInt(h,16)||0;return{r:(n>>16)&255,g:(n>>8)&255,b:n&255}}
function shade(hex,amount){var c=hexToRgb(hex);function p(v){return Math.max(0,Math.min(255,Math.round(v+(amount>=0?(255-v)*amount:v*amount))))}return"rgb("+p(c.r)+","+p(c.g)+","+p(c.b)+")"}
function fitText(text,maxWidth,startSize,fontWeight){
  var size=startSize;ctx.font=(fontWeight||700)+" "+size+"px Swiss721,Arial Narrow,Arial,sans-serif";
  while(size>24&&ctx.measureText(text).width>maxWidth){size-=2;ctx.font=(fontWeight||700)+" "+size+"px Swiss721,Arial Narrow,Arial,sans-serif"}return size
}
function wrapText(text,maxWidth,maxLines){
  var source=String(text||"").split(/\n/),lines=[];
  source.forEach(function(paragraph){
    var words=paragraph.split(/\s+/),line="";
    words.forEach(function(word){var test=line?line+" "+word:word;if(ctx.measureText(test).width>maxWidth&&line){lines.push(line);line=word}else line=test});
    if(line)lines.push(line)
  });return lines.slice(0,maxLines)
}
function drawCropMarks(){
  var inset=40,gap=11,len=29;ctx.save();ctx.strokeStyle="#111";ctx.lineWidth=2;
  [[0,inset,inset-gap,inset],[W-inset+gap,inset,W,inset],[0,H-inset,inset-gap,H-inset],[W-inset+gap,H-inset,W,H-inset],[inset,0,inset,inset-gap],[W-inset,0,W-inset,inset-gap],[inset,H-inset+gap,inset,H],[W-inset,H-inset+gap,W-inset,H]].forEach(function(a){ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(a[2],a[3]);ctx.stroke()});ctx.restore()
}
function drawContact(r,x,y,width,color){
  ctx.fillStyle=color;ctx.textAlign="left";ctx.font="400 42px Swiss721,Arial Narrow,Arial,sans-serif";
  var address=wrapText(r.address,width,2);address.forEach(function(line,i){ctx.fillText(line,x,y+i*38)});
  ctx.font="700 42px Swiss721,Arial Narrow,Arial,sans-serif";ctx.fillText(r.phone||"",x,y+112);
  ctx.font="400 38px Swiss721,Arial Narrow,Arial,sans-serif";
  var contact=[r.email,r.website].filter(Boolean).join("  |  ");fitText(contact,width,38,400);ctx.fillText(contact,x,y+164)
}
// posição (px), tamanho de fonte (px) e cor abaixo replicam exatamente o arquivo de impressão
// (business-card-assets/source/fg-business-card.ai / .pdf, card 94×54mm a 20px/mm): Nome 11.5pt,
// Cargo 8.5pt e Endereço/Celular/E-mail·Site 7pt, todos na cor #4c4c4c (K 70,2%, sem CMY). Esses
// valores são fixos — não usam fitText/auto-encolhe — porque esse é o padrão gráfico aprovado
// para impressão e não pode variar conforme o texto digitado.
var FG_GRAY="#4c4c4c",FG_RIGHT=1757.21,FG_LEFT=117.78,FG_LINE=66.82;
async function drawFg(r,token){
  var bg=await loadImage(embeddedAssets.fgTemplate||"business-card-assets/fg-template-600.png");if(token!==renderToken)return;
  ctx.fillStyle="#fff";ctx.fillRect(0,0,W,H);if(bg)ctx.drawImage(bg,0,0,W,H);
  ctx.fillStyle="#fff";ctx.fillRect(W*.79,H*.305,W*.19,H*.255);ctx.fillRect(W*.055,H*.65,W*.72,H*.29);
  ctx.fillStyle=FG_GRAY;ctx.textAlign="right";
  ctx.font="700 81.14px Swiss721,Arial Narrow,Arial,sans-serif";ctx.fillText(r.name||"Nome",FG_RIGHT,426.37);
  ctx.font="400 59.97px Swiss721,Arial Narrow,Arial,sans-serif";ctx.fillText(r.role||"Cargo",FG_RIGHT,504.85);
  ctx.textAlign="left";ctx.font="400 49.39px Swiss721,Arial Narrow,Arial,sans-serif";
  var addressLines=wrapText(r.address,W-FG_LEFT*2,2);
  addressLines.forEach(function(line,i){ctx.fillText(line,FG_LEFT,776.36+i*FG_LINE)});
  // Celular e E-mail/Site têm âncoras fixas no original. Nunca descem quando o endereço quebra.
  ctx.fillText(r.phone||"",FG_LEFT,908.38);
  var contact=[r.email,r.website].filter(Boolean).join(" | ");
  ctx.fillText(contact,FG_LEFT,975.20);
  drawCropMarks()
}
function drawDecor(style,accent,secondary){
  ctx.fillStyle="#fff";ctx.fillRect(0,0,W,H);
  if(style==="diagonal"){ctx.fillStyle=accent;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(W*.48,0);ctx.lineTo(W*.31,H);ctx.lineTo(0,H);ctx.closePath();ctx.fill();ctx.fillStyle="#171717";ctx.fillRect(0,H*.78,W,H*.22)}
  else if(style==="sidebar"){ctx.fillStyle=accent;ctx.fillRect(0,0,W*.34,H);ctx.fillStyle=shade(accent,-.22);ctx.beginPath();ctx.moveTo(W*.34,0);ctx.lineTo(W*.46,0);ctx.lineTo(W*.35,H);ctx.lineTo(W*.24,H);ctx.closePath();ctx.fill()}
  else if(style==="stripe"){ctx.fillStyle=accent;ctx.fillRect(0,0,W,H*.31);ctx.fillStyle="#1c1c1c";ctx.fillRect(0,H*.31,W,H*.055);ctx.fillStyle=accent;ctx.beginPath();ctx.moveTo(W*.70,H);ctx.lineTo(W,H*.62);ctx.lineTo(W,H);ctx.closePath();ctx.fill()}
  else if(style==="corner"){ctx.fillStyle=accent;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(W*.62,0);ctx.lineTo(W*.45,H*.36);ctx.lineTo(0,H*.36);ctx.closePath();ctx.fill();ctx.fillStyle=shade(accent,-.28);ctx.beginPath();ctx.moveTo(W*.75,H);ctx.lineTo(W,H*.70);ctx.lineTo(W,H);ctx.closePath();ctx.fill()}
  else if(style==="split"){ctx.fillStyle=accent;ctx.fillRect(0,0,W,H*.29);ctx.fillStyle=secondary||"#AB2328";ctx.fillRect(0,H*.29,W,H*.035);ctx.fillRect(W*.94,0,W*.06,H)}
  else if(style==="rail"){ctx.fillStyle="#202124";ctx.fillRect(0,0,W*.30,H);ctx.fillStyle=accent;ctx.fillRect(W*.30,0,W*.045,H);ctx.beginPath();ctx.moveTo(W*.76,H);ctx.lineTo(W,H*.72);ctx.lineTo(W,H);ctx.closePath();ctx.fill()}
  else{ctx.fillStyle=accent;ctx.fillRect(0,0,W,H*.25);ctx.fillStyle=secondary||"#e4e4e4";ctx.fillRect(0,H*.25,W,H*.035);ctx.fillStyle="#f1f1f1";ctx.beginPath();ctx.arc(W*.87,H*.80,W*.30,0,Math.PI*2);ctx.fill()}
}
async function drawGeneric(r,token){
  drawDecor(template.style,template.accent,template.secondary);
  var logoSource=(embeddedAssets.logos&&embeddedAssets.logos[brand.id])||brand.photo;var img=logoSource?await loadImage(logoSource):null;if(token!==renderToken)return;
  var lightHeader=template.style==="stripe"||template.style==="group";var logoX=90,logoY=70,logoW=320,logoH=145;
  ctx.save();ctx.fillStyle=lightHeader?"#fff":"rgba(255,255,255,.95)";ctx.beginPath();ctx.roundRect(logoX,logoY,logoW,logoH,18);ctx.fill();
  if(img){var ratio=Math.min((logoW-34)/img.width,(logoH-26)/img.height),iw=img.width*ratio,ih=img.height*ratio;ctx.drawImage(img,logoX+(logoW-iw)/2,logoY+(logoH-ih)/2,iw,ih)}
  else{ctx.fillStyle=template.ink;ctx.textAlign="center";ctx.font="700 64px Arial";ctx.fillText(brand.shortName||brand.name,logoX+logoW/2,logoY+93)}ctx.restore();
  var left=(template.style==="sidebar"||template.style==="rail")?W*.42:W*.51;
  ctx.textAlign="left";ctx.fillStyle=template.ink;var max=W-left-100,size=fitText(r.name||"Nome",max,78,700);ctx.font="700 "+size+"px Swiss721,Arial Narrow,Arial,sans-serif";ctx.fillText(r.name||"Nome",left,H*.39);
  size=fitText(r.role||"Cargo",max,44,400);ctx.font="400 "+size+"px Swiss721,Arial Narrow,Arial,sans-serif";ctx.fillStyle=shade(template.ink,.25);ctx.fillText(r.role||"Cargo",left,H*.47);
  drawContact(r,left,H*.62,max,template.ink);drawCropMarks()
}
async function renderCanvas(r,targetCanvas){
  if(targetCanvas&&targetCanvas!==canvas){var oldCanvas=canvas,oldCtx=ctx;canvas=targetCanvas;ctx=canvas.getContext("2d");W=canvas.width;H=canvas.height;var localToken=++renderToken;if(template.style==="fg")await drawFg(r||recordFrom({}),localToken);else await drawGeneric(r||recordFrom({}),localToken);canvas=oldCanvas;ctx=oldCtx;W=oldCanvas.width;H=oldCanvas.height;return}
  var token=++renderToken;r=r||recordFrom({name:"Nome",role:"Cargo"});if(template.style==="fg")await drawFg(r,token);else await drawGeneric(r,token)
}
function validateExport(records){
  if(!records.length){toast("Nenhum cartão foi selecionado.");return false}
  var pending=records.filter(function(r){return !r.approved});
  if(pending.length){toast("Revise e aprove "+pending.length+" "+(pending.length===1?"cartão":"cartões")+" antes de exportar.");return false}return true
}
async function cardPdfDoc(record){
  var jsPDF=window.jspdf.jsPDF,doc=new jsPDF({orientation:"landscape",unit:"mm",format:[94,54],compress:true});
  var scratch=document.createElement("canvas");scratch.width=1880;scratch.height=1080;
  await renderCanvas(record,scratch);doc.addImage(scratch.toDataURL("image/jpeg",.96),"JPEG",0,0,94,54,undefined,"FAST");
  return doc
}
function triggerBlob(blob,name){var a=document.createElement("a"),u=URL.createObjectURL(blob);a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(u)},1200)}
var ZIP_CRC_TABLE=(function(){var table=[];for(var n=0;n<256;n++){var c=n;for(var k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;table[n]=c>>>0}return table})();
function zipCrc(bytes){var crc=0xffffffff;for(var i=0;i<bytes.length;i++)crc=ZIP_CRC_TABLE[(crc^bytes[i])&255]^(crc>>>8);return(crc^0xffffffff)>>>0}
function zipHeader(size){var bytes=new Uint8Array(size),view=new DataView(bytes.buffer);return{bytes:bytes,u16:function(offset,value){view.setUint16(offset,value,true)},u32:function(offset,value){view.setUint32(offset,value>>>0,true)}}}
function zipDate(){var d=new Date(),year=Math.max(1980,d.getFullYear());return{time:(d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1),date:((year-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate()}}
function makeZip(files){var encoder=new TextEncoder(),stamp=zipDate(),locals=[],centrals=[],offset=0;files.forEach(function(file){var name=encoder.encode(file.name),data=file.data,crc=zipCrc(data),local=zipHeader(30);local.u32(0,0x04034b50);local.u16(4,20);local.u16(6,0x800);local.u16(8,0);local.u16(10,stamp.time);local.u16(12,stamp.date);local.u32(14,crc);local.u32(18,data.length);local.u32(22,data.length);local.u16(26,name.length);local.u16(28,0);locals.push(local.bytes,name,data);var central=zipHeader(46);central.u32(0,0x02014b50);central.u16(4,20);central.u16(6,20);central.u16(8,0x800);central.u16(10,0);central.u16(12,stamp.time);central.u16(14,stamp.date);central.u32(16,crc);central.u32(20,data.length);central.u32(24,data.length);central.u16(28,name.length);central.u16(30,0);central.u16(32,0);central.u16(34,0);central.u16(36,0);central.u32(38,0);central.u32(42,offset);centrals.push(central.bytes,name);offset+=30+name.length+data.length});var centralSize=centrals.reduce(function(total,part){return total+part.length},0),end=zipHeader(22);end.u32(0,0x06054b50);end.u16(4,0);end.u16(6,0);end.u16(8,files.length);end.u16(10,files.length);end.u32(12,centralSize);end.u32(16,offset);end.u16(20,0);return new Blob(locals.concat(centrals,[end.bytes]),{type:"application/zip"})}
function uniqueFileName(base,used){var name=base,n=2;while(used[name]){name=base+"-"+n;n++}used[name]=true;return name}
async function exportPdf(records,label){
  if(!validateExport(records))return;
  if(!window.jspdf||!window.jspdf.jsPDF){toast("Gerador de PDF indisponível.");return}
  if(records.length===1){
    toast("Preparando cartão…");
    var doc=await cardPdfDoc(records[0]);
    doc.save(safeFile(records[0].name)+".pdf");toast("PDF gerado com sucesso.");return
  }
  // cada cartão vira um PDF individual (nome = nome completo da pessoa), não mais páginas de
  // um único PDF — assim cada arquivo pode ir separado pra gráfica/participante; agrupamos
  // tudo num ZIP só pra facilitar o download em lote
  toast("Preparando "+records.length+" cartões em PDFs individuais…");
  var used={},files=[];
  for(var i=0;i<records.length;i++){
    var recordDoc=await cardPdfDoc(records[i]);
    var name=uniqueFileName(safeFile(records[i].name),used);
    files.push({name:name+".pdf",data:new Uint8Array(recordDoc.output("arraybuffer"))})
  }
  var zip=makeZip(files),zipName=safeFile(brand.name)+"-"+label+"-"+records.length+"-cartoes";
  triggerBlob(zip,zipName+".zip");toast("ZIP com "+records.length+" PDFs gerado com sucesso.")
}
function addManual(){
  var r=recordFrom({name:"Novo cartão",role:"Cargo",address:"Endereço",phone:"",email:"",website:""});state.records.push(r);state.activeId=r.id;save();showWorkspace()
}
function loadDemo(){
  var demo=[{name:"Mariana Alves",role:"Supervisora de Vendas Externas",address:"Av. Antônio Gazzola, 1001 | Jardim Corazza\nItu | SP | CEP 13301-245",phone:"(11) 99999-0000",email:"mariana.alves@empresa.com.br",website:"www.empresa.com.br"},{name:"Lucas Ribeiro",role:"Especialista de Produtos",address:"Rua Voluntários da Pátria, 3223 | São Geraldo\nPorto Alegre | RS | CEP 90230-011",phone:"(51) 98888-0000",email:"lucas.ribeiro@empresa.com.br",website:"www.empresa.com.br"}];
  state.records=demo.map(recordFrom);state.activeId=state.records[0].id;save();showWorkspace()
}
function init(){
  $("brandName").textContent=brand.name;$("brandDot").textContent=brand.shortName||brand.name.slice(0,3).toUpperCase();$("miniBrand").textContent=brand.shortName||brand.name.slice(0,3).toUpperCase();
  $("spreadsheetFile").addEventListener("change",function(){handleFile(this.files[0]);this.value=""});$("replaceFile").addEventListener("click",function(){$("spreadsheetFile").click()});$("addRecord").addEventListener("click",addManual);
  Object.keys(fields).forEach(function(key){fields[key].addEventListener("input",fieldChanged)});
  $("reviewCurrent").addEventListener("click",function(){var r=current();if(r)reviewRecord(r)});
  $("approveCurrent").addEventListener("change",function(){var r=current();if(!r)return;if(this.checked&&(!r.reviewed||hasBlocking(r))){this.checked=false;return}r.approved=this.checked;save();renderRecords();renderStats();updateFlow()});
  $("selectAll").addEventListener("change",function(){var value=this.checked;state.records.forEach(function(r){r.selected=value});save();renderRecords();renderStats()});
  $("exportCurrent").addEventListener("click",function(){var r=current();exportPdf(r?[r]:[],"individual")});
  $("exportSelected").addEventListener("click",function(){exportPdf(state.records.filter(function(r){return r.selected}),"selecionados")});
  $("exportAll").addEventListener("click",function(){exportPdf(state.records,"lote-completo")});
  load();if(!state.records.length)renderCanvas(null);else renderAll()
}
window.BusinessCardGenerator={loadDemo:loadDemo,importRows:importRows,exportPdf:exportPdf,getState:function(){return state}};
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init()
})();