import React, {useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
const h = React.createElement;
const labels = {
  'id-ID': {title:'Lihat aplikasi lebih dekat',intro:'Tampilan aplikasi dengan data contoh.',previous:'Sebelumnya',next:'Berikutnya',close:'Tutup',open:'Perbesar',play:'Putar video',failed:'Media tidak tersedia.',gallery:'Galeri media produk'},
  'en-US': {title:'See the app up close',intro:'Application screens with sample data.',previous:'Previous',next:'Next',close:'Close',open:'Enlarge',play:'Play video',failed:'Media unavailable.',gallery:'Product media gallery'}
};
export function selectMedia(media, product, locale, failed=[]) {
  if (!Array.isArray(media)) return [];
  return media.filter(x=>x && x.productId===product && x.status==='published' && x.locale===locale && ['image','video'].includes(x.type) && typeof x.src==='string' && x.src.trim() && (x.type!=='video' || (typeof x.poster==='string' && x.poster.trim())) && x.id && !failed.includes(x.id))
    .sort((a,b)=>(a.type==='video'?0:1)-(b.type==='video'?0:1)||(Number(a.order)||0)-(Number(b.order)||0));
}
export function ProductMediaGallery({product, media, locale = 'id-ID', productName}) {
 const t=labels[locale] || labels['id-ID'];
 const [failed,setFailed]=useState([]),[activeId,setActiveId]=useState(null),[error,setError]=useState(false);
 const dialog=useRef(null),opener=useRef(null),rail=useRef(null),closeButton=useRef(null);
 const items=selectMedia(media,product,locale,failed),activeIndex=items.findIndex(item=>item.id===activeId),active=items[activeIndex];
 useEffect(()=>{if(activeId!==null && active && dialog.current && !dialog.current.open){dialog.current.showModal();closeButton.current?.focus()}},[activeId,active]);
 const close=()=>{setActiveId(null);setError(false);opener.current?.focus()};
 const show=(item,e)=>{opener.current=e.currentTarget;setError(false);setActiveId(item.id)};
 const shift=n=>{if(activeIndex<0||items.length<2)return;setError(false);setActiveId(items[(activeIndex+n+items.length)%items.length].id)};
 const dismissFailed=id=>{if(id===activeId && dialog.current?.open)dialog.current.close();setFailed(previous=>previous.includes(id)?previous:[...previous,id])};
 const scroll=n=>rail.current?.scrollBy({left:n*rail.current.clientWidth*.8,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
 if(!items.length) return null;
 return h('section',{className:'pm-gallery','aria-label':`${t.gallery}: ${productName||product}`},h('div',{className:'shell'},
  h('div',{className:'pm-heading'},h('div',null,h('p',{className:'pm-eyebrow'},productName||product.toUpperCase()),h('h2',null,t.title),h('p',null,t.intro)),items.length>1&&h('div',{className:'pm-controls'},h('button',{type:'button','aria-label':t.previous,onClick:()=>scroll(-1)},'←'),h('button',{type:'button','aria-label':t.next,onClick:()=>scroll(1)},'→'))),
  h('div',{className:'pm-rail',ref:rail,tabIndex:0,'aria-label':t.gallery,onKeyDown:e=>{if(e.target!==e.currentTarget)return;if(e.key==='ArrowRight'){e.preventDefault();scroll(1)}if(e.key==='ArrowLeft'){e.preventDefault();scroll(-1)}}},items.map(item=>h('article',{className:'pm-card',key:item.id},h('button',{className:'pm-image',type:'button',onClick:e=>show(item,e),'aria-label':`${item.type==='video'?t.play:t.open}: ${item.headline}`},h('img',{src:item.type==='video'?item.poster:item.src,alt:item.alt||'',loading:'lazy',decoding:'async',onError:()=>dismissFailed(item.id)}),item.type==='video'&&h('span',{className:'pm-play','aria-hidden':true},'▶')),h('div',{className:'pm-caption'},h('h3',null,item.headline),h('p',null,item.description))))),
  h('dialog',{ref:dialog,className:'pm-dialog','aria-label':active?.headline||t.gallery,onClose:close,onKeyDown:e=>{if(e.key==='ArrowRight'&&items.length>1){e.preventDefault();shift(1)}if(e.key==='ArrowLeft'&&items.length>1){e.preventDefault();shift(-1)}}},active&&h(React.Fragment,null,h('div',{className:'pm-dialog-controls'},items.length>1&&h('button',{type:'button',onClick:()=>shift(-1),'aria-label':t.previous},'←'),items.length>1&&h('button',{type:'button',onClick:()=>shift(1),'aria-label':t.next},'→'),h('button',{type:'button',ref:closeButton,onClick:()=>dialog.current.close(),'aria-label':t.close},'×')),error?h('p',{role:'alert'},t.failed):active.type==='video'?h('video',{key:active.id,src:active.src,poster:active.poster,controls:true,autoPlay:true,playsInline:true,preload:'metadata',onError:()=>setError(true)}):h('img',{src:active.src,alt:active.alt||'',onError:()=>dismissFailed(active.id)}),h('p',null,active.headline)))
 ));
}
document.querySelectorAll('[data-product-media]').forEach(async element=>{try{const product=element.dataset.productMedia;if(!/^[a-z0-9-]+$/.test(product))return;const response=await fetch(`/product-media/${product}.json`);if(!response.ok)return;const media=await response.json();createRoot(element).render(h(ProductMediaGallery,{product,productName:element.dataset.productName,media,locale:element.lang||'id-ID'}));}catch{/* An unavailable manifest leaves the page unchanged. */}});
