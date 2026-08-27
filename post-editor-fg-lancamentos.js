(function(global){
  'use strict';

  function setTitleFont(ctx,size){
    ctx.font='700 italic '+size+'px "Swiss721Editor","Arial Narrow",Impact,sans-serif';
    if('letterSpacing' in ctx)ctx.letterSpacing=Math.round(size*-.02)+'px'
  }
  function wrapLines(ctx,text,maxWidth,maxLines){
    var words=String(text||'PRODUTO').replace(/\s+/g,' ').trim().toUpperCase().split(' '),lines=[],line='';
    words.forEach(function(word){
      var test=(line+' '+word).trim();
      if(line&&ctx.measureText(test).width>maxWidth&&lines.length<maxLines-1){lines.push(line);line=word}else line=test
    });
    if(line)lines.push(line);return lines.slice(0,maxLines)
  }
  function fitTitle(ctx,text,maxWidth,maxLines,start,min){
    var size=start,lines=[];
    do{
      setTitleFont(ctx,size);lines=wrapLines(ctx,text,maxWidth,maxLines);
      if(lines.length<=maxLines&&lines.every(function(line){return ctx.measureText(line).width<=maxWidth}))break;
      size-=2
    }while(size>min);
    return{size:size,lines:lines}
  }
  function drawReferenceScene(ctx,img,t,isStory,topY,greenY){
    var sy=Math.round(img.height*(228/1350)),sh=Math.round(img.height*((1252-228)/1350)),sw=img.width,zoneH=greenY-topY;
    if(!isStory){ctx.drawImage(img,0,sy,sw,sh,0,topY,t.w,zoneH);return}
    var cover=Math.max(t.w/sw,zoneH/sh),bw=sw*cover,bh=sh*cover;
    ctx.save();ctx.filter='blur(28px) brightness(.68)';ctx.drawImage(img,0,sy,sw,sh,(t.w-bw)/2,topY+(zoneH-bh)/2,bw,bh);ctx.restore();
    var fit=Math.min(t.w/sw,zoneH/sh),w=sw*fit,h=sh*fit;ctx.drawImage(img,0,sy,sw,sh,(t.w-w)/2,topY+(zoneH-h)/2,w,h)
  }
  function renderer(api){
    var ctx=api.ctx,t=api.t,state=api.state,isStory=api.format==='story',topY=isStory?314:228,greenY=isStory?1699:t.h-98,footerTop=t.h-173;
    ctx.fillStyle='#252a29';ctx.fillRect(0,0,t.w,t.h);
    var isReference=!!(api.item&&api.item.referenceArtwork&&state.background&&/fg-lancamentos/i.test(state.background.src||''));
    if(isReference)drawReferenceScene(ctx,state.background,t,isStory,topY,greenY);
    else if(state.background)api.helpers.drawCover(ctx,state.background,t,api.format);
    else api.helpers.drawPlaceholder(ctx,t);

    var titleRight=1029,titleLeft=isStory?413:396,titleFit=fitTitle(ctx,api.productName,titleRight-titleLeft,2,58,16),lineH=titleFit.size*1.09,titleY,lineY;
    var badgeColor=state.brandBadgeColor||'#fbc400';
    var brand=api.brandVariant==='vonder-plus'?state.customAssets.brandPlus:state.customAssets.brandVonder;
    if(isStory){
      if(state.customAssets.headerGradient)ctx.drawImage(state.customAssets.headerGradient,0,0,t.w,430);
      else{ctx.fillStyle='#000';ctx.fillRect(0,0,t.w,314)}
      ctx.fillStyle=badgeColor;ctx.fillRect(68,0,302,314);
      if(brand){
        if(api.brandVariant==='vonder-plus')ctx.drawImage(brand,86,172,263,115);
        else ctx.drawImage(brand,84,193,274,77)
      }
      lineY=311;titleY=Math.max(92,lineY-titleFit.lines.length*lineH-8)
    }else{
      // o header achatado (header-vonder.png/header-vonder-plus.png) traz o fundo preto
      // gradiente + o retângulo amarelo + a logo, tudo cozido numa imagem só. Pra cor do
      // retângulo virar configurável, desenhamos ele por cima com a cor escolhida (mesmas
      // coordenadas do retângulo original, medidas em pixel na imagem) e depois a logo
      // isolada (mesmo arquivo já usado no Story), igual ao Story já faz — sem imagem achatada
      var header=api.brandVariant==='vonder-plus'?state.customAssets.headerPlus:state.customAssets.headerVonder;
      if(header)ctx.drawImage(header,0,0,t.w,377);else{ctx.fillStyle='#000';ctx.fillRect(0,0,t.w,228)}
      ctx.fillStyle=badgeColor;ctx.fillRect(48,0,223,179);
      if(brand){
        if(api.brandVariant==='vonder-plus')ctx.drawImage(brand,64,83,192,84);
        else ctx.drawImage(brand,58,102,202,57)
      }
      titleY=55;lineY=Math.min(249,titleY+titleFit.lines.length*lineH+11)
    }

    ctx.fillStyle='#fff';ctx.textAlign='right';ctx.textBaseline='top';setTitleFont(ctx,titleFit.size);
    titleFit.lines.forEach(function(line,index){ctx.fillText(line,titleRight,titleY+index*lineH)});
    if('letterSpacing' in ctx)ctx.letterSpacing='0px';
    ctx.fillRect(titleLeft,lineY,titleRight-titleLeft,3);

    if(isStory){
      ctx.fillStyle='#005746';ctx.fillRect(0,greenY,t.w,t.h-greenY);
      if(state.customAssets.footerBadge)ctx.drawImage(state.customAssets.footerBadge,65,1612,385,132);
      if(state.customAssets.footerFg)ctx.drawImage(state.customAssets.footerFg,875,1545,135,196)
    }else if(state.customAssets.footer)ctx.drawImage(state.customAssets.footer,0,footerTop,t.w,173);
    else{ctx.fillStyle='#005746';ctx.fillRect(0,greenY,t.w,t.h-greenY)}
  }

  global.POST_EDITOR_CUSTOM_PRESETS=global.POST_EDITOR_CUSTOM_PRESETS||{};
  global.POST_EDITOR_CUSTOM_PRESETS['__ferramentas-gerais']=Object.assign({},global.POST_EDITOR_CUSTOM_PRESETS['__ferramentas-gerais']||{}, {
    'Lançamentos':{
      footerColor:'#005746',
      supportsBrandVariant:true,
      supportsCodes:false,
      supportsProductCutout:false,
      assetSources:{
        headerVonder:'post-editor-assets/fg-lancamentos/header-vonder.png',
        headerPlus:'post-editor-assets/fg-lancamentos/header-vonder-plus.png',
        headerGradient:'post-editor-assets/fg-lancamentos/header-gradient.png',
        brandVonder:'post-editor-assets/fg-lancamentos/brand-vonder.png',
        brandPlus:'post-editor-assets/fg-lancamentos/brand-vonder-plus.png',
        footer:'post-editor-assets/fg-lancamentos/footer-lancamentos.png',
        footerBadge:'post-editor-assets/fg-lancamentos/footer-badge.png',
        footerFg:'post-editor-assets/fg-lancamentos/footer-fg.png'
      },
      renderer:renderer
    }
  });
})(window);



