(() => {
  'use strict';
  const section = document.querySelector('[data-geraina-showcase]');
  if (!section) return;
  const deck = section.querySelector('[data-showcase-deck]');
  const stage = section.querySelector('[data-showcase-stage]');
  const deviceTabs = [...section.querySelectorAll('[data-showcase-device]')];
  const featureTabs = [...section.querySelectorAll('[data-showcase-feature]')];
  const dialog = section.querySelector('dialog');
  const dialogImage = dialog.querySelector('img');
  const dialogTitle = dialog.querySelector('h3');
  const dialogClose = dialog.querySelector('[data-viewer-close]');
  const previous = section.querySelector('[data-slide-previous]');
  const next = section.querySelector('[data-slide-next]');
  const status = section.querySelector('[data-showcase-status]');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const features = ['pos','products','inventory','reports'];
  let entries = [], device = 'phone', feature = 'pos', scene = null, renderId = 0;
  let active = 0, opener = null, oldOverflow = '', viewerItems = [], viewerId = 0;
  const announce = text => { status.textContent = text; };
  const listFor = selected => features.map(id => entries.find(item => item.device === selected && item.featureId === id));
  const element = (tag,className) => {const node=document.createElement(tag);if(className)node.className=className;return node;};
  const icon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M8 8l-5-5m13 5 5-5M8 16l-5 5m13-5 5 5"/></svg>';

  async function showViewer(index) {
    const request = ++viewerId;
    active = (index + viewerItems.length) % viewerItems.length;
    const item = viewerItems[active], image = new Image();image.src = item.screenSrc || item.src;
    try {await image.decode();} catch {if(request===viewerId)dialogTitle.textContent='Gambar belum dapat dimuat. Pilih tampilan lain atau tutup gambar.';return;}
    if(request!==viewerId || !dialog.open)return;
    dialogTitle.textContent = `${item.headline} · ${item.deviceLabel}`;
    dialog.dataset.device = item.device;
    dialogImage.alt = item.alt;dialogImage.src = image.src;
    if(!reduced.matches)dialogImage.animate([{opacity:0,transform:'translateX(12px)'},{opacity:1,transform:'translateX(0)'}],{duration:240,easing:'ease-out'});
  }
  function openViewer(index,button,list) {
    opener=button;viewerItems=list;oldOverflow=document.body.style.overflow;
    document.body.style.overflow='hidden';dialog.showModal();dialogClose.focus();showViewer(index);
  }
  function screenshot(item) {
    const image=new Image();image.src=item.screenSrc || item.src;image.alt=item.alt;
    image.width=item.screenWidth || item.width;image.height=item.screenHeight || item.height;
    image.decoding='async';image.draggable=false;return image;
  }
  function framedImage(item,image) {
    if(item.device==='desktop'){
      const laptop=element('span','gshow-laptop'),lid=element('span','gshow-laptop-lid'),base=element('span','gshow-laptop-base');
      base.setAttribute('aria-hidden','true');lid.append(image);laptop.append(lid,base);return laptop;
    }
    const frame=element('span',item.device==='phone'?'gshow-slide-phone':'gshow-slide-tablet');frame.append(image);return frame;
  }
  function updateControls() {
    for(const tab of deviceTabs){const selected=tab.dataset.showcaseDevice===device;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;}
    for(const tab of featureTabs){const selected=tab.dataset.showcaseFeature===feature;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;}
    deck.dataset.device=device;deck.setAttribute('aria-labelledby',`gshow-tab-${device} gshow-feature-${feature}`);
  }
  async function render(direction=1,animate=true) {
    if(!entries.length)return;
    const request=++renderId,list=listFor(device),index=features.indexOf(feature),item=list[index];
    updateControls();deck.setAttribute('aria-busy','true');
    const image=screenshot(item);
    try{await image.decode();}catch{
      if(request!==renderId)return;
      const message=element('p','gshow-load-error');message.setAttribute('role','alert');message.textContent='Gambar belum dapat dimuat. Pilih fitur lain untuk mencoba kembali.';
      stage.replaceChildren(message);scene=null;deck.setAttribute('aria-busy','false');announce('');return;
    }
    if(request!==renderId)return;
    const incoming=element('div','gshow-scene'),button=element('button','gshow-scene-button');
    incoming.dataset.feature=item.featureId;incoming.dataset.device=item.device;
    button.type='button';button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-label',`Perbesar: ${item.headline} — ${item.deviceLabel}`);
    const enlarge=element('span','gshow-scene-enlarge');enlarge.setAttribute('aria-hidden','true');enlarge.innerHTML=icon+' Perbesar tampilan';
    button.append(framedImage(item,image),enlarge);button.addEventListener('click',()=>openViewer(index,button,list));incoming.append(button);
    const outgoing=scene;
    if(outgoing)outgoing.getAnimations().forEach(animation=>animation.cancel());
    scene=incoming;stage.replaceChildren(...(outgoing?[outgoing]:[]),incoming);
    if(outgoing){outgoing.inert=true;outgoing.setAttribute('aria-hidden','true');}
    section.querySelector('[data-slide-title]').textContent=item.headline;
    section.querySelector('[data-slide-description]').textContent=item.description;
    section.querySelector('[data-slide-label]').textContent=`${item.deviceLabel} / ${featureTabs[index].textContent.trim().replace(/^\d+\s*/,'')}`;
    const counter=section.querySelector('[data-slide-count]');counter.textContent=`0${index+1} / 04`;counter.setAttribute('aria-label',`Gambar ${index+1} dari 4`);
    if(outgoing && animate && !reduced.matches){
      const settings={duration:380,easing:'cubic-bezier(.2,.7,.2,1)'};
      const enter=incoming.animate([{opacity:0,transform:`translateX(${direction*35}px)`},{opacity:1,transform:'translateX(0)'}],settings);
      const leave=outgoing.animate([{opacity:1,transform:'translateX(0)'},{opacity:0,transform:`translateX(${-direction*35}px)`}],settings);
      await Promise.allSettled([enter.finished,leave.finished]);
    }
    if(request!==renderId)return;
    if(outgoing)outgoing.remove();
    deck.setAttribute('aria-busy','false');announce(`${item.deviceLabel}: ${item.headline}. Gambar ${index+1} dari 4.`);
  }
  function selectDevice(tab,focus=false) {device=tab.dataset.showcaseDevice;render(1);if(focus)tab.focus();}
  function selectFeature(tab,focus=false) {const old=features.indexOf(feature);feature=tab.dataset.showcaseFeature;render(features.indexOf(feature)>=old?1:-1);if(focus)tab.focus();}
  function tabNavigation(tabs,select) {
    for(const tab of tabs){tab.addEventListener('click',()=>select(tab));tab.addEventListener('keydown',event=>{
      const index=tabs.indexOf(tab),target=event.key==='Home'?0:event.key==='End'?tabs.length-1:event.key==='ArrowRight'?(index+1)%tabs.length:event.key==='ArrowLeft'?(index-1+tabs.length)%tabs.length:-1;
      if(target<0)return;event.preventDefault();select(tabs[target],true);
    });}
  }
  tabNavigation(deviceTabs,selectDevice);tabNavigation(featureTabs,selectFeature);
  function step(direction) {feature=features[(features.indexOf(feature)+direction+features.length)%features.length];render(direction);}
  previous.addEventListener('click',()=>step(-1));next.addEventListener('click',()=>step(1));
  deck.addEventListener('keydown',event=>{if(event.target!==deck)return;if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();step(event.key==='ArrowRight'?1:-1);}});
  let touch=null;
  stage.addEventListener('pointerdown',event=>{if(event.pointerType==='touch'||event.pointerType==='pen')touch={x:event.clientX,y:event.clientY};});
  stage.addEventListener('pointerup',event=>{if(!touch)return;const dx=event.clientX-touch.x,dy=event.clientY-touch.y;touch=null;if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.5)step(dx<0?1:-1);});
  stage.addEventListener('pointercancel',()=>{touch=null;});
  dialogClose.addEventListener('click',()=>dialog.close());
  dialog.querySelector('[data-viewer-previous]').addEventListener('click',()=>showViewer(active-1));
  dialog.querySelector('[data-viewer-next]').addEventListener('click',()=>showViewer(active+1));
  dialog.addEventListener('keydown',event=>{if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();showViewer(active+(event.key==='ArrowRight'?1:-1));}});
  dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();});
  dialog.addEventListener('close',()=>{viewerId++;dialogImage.getAnimations().forEach(animation=>animation.cancel());dialogImage.removeAttribute('src');document.body.style.overflow=oldOverflow;opener?.focus({preventScroll:true});});
  const featureButtons=[...document.querySelectorAll('[data-geraina-feature-image]')];
  const featureItems=featureButtons.map(button=>({src:button.dataset.featureSrc,headline:button.dataset.featureTitle,alt:button.querySelector('img').alt,device:'feature',deviceLabel:'Geraina'}));
  featureButtons.forEach((button,index)=>button.addEventListener('click',()=>openViewer(index,button,featureItems)));
  fetch('/product-media/geraina-showcase.json').then(response=>{if(!response.ok)throw Error('Media unavailable');return response.json();}).then(manifest=>{
    if(!Array.isArray(manifest)||manifest.length!==12)throw Error('Invalid showcase');
    for(const name of ['phone','tablet','desktop'])for(const id of features){
      const matches=manifest.filter(item=>item.device===name&&item.featureId===id);
      if(matches.length!==1||!matches[0].screenSrc?.startsWith('/product-media/geraina/screens/'))throw Error('Incomplete showcase');
    }
    entries=manifest;previous.disabled=next.disabled=false;render(1,false);
  }).catch(()=>{
    const message=element('p','gshow-load-error');message.setAttribute('role','status');message.textContent='Galeri belum dapat dimuat. Muat ulang halaman untuk mencoba kembali.';
    stage.replaceChildren(message);previous.disabled=next.disabled=true;
  });
})();
