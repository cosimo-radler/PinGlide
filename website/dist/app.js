'use strict';
if('scrollRestoration' in history)history.scrollRestoration='manual';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const studies = window.ELSEWHERE_COLLECTION.map(study=>({...study}));
// A fresh order for each page load, shared by the hero and the full gallery.
for(let index=studies.length-1;index>0;index--){
  const other=Math.floor(Math.random()*(index+1));
  [studies[index],studies[other]]=[studies[other],studies[index]];
}
// Keep one original Elsewhere poster in the opening triptych.
if(!studies.slice(0,3).some(study=>study.branded)){
  const posterIndex=studies.findIndex(study=>study.branded);
  [studies[0],studies[posterIndex]]=[studies[posterIndex],studies[0]];
}
try {
  const lastHero=sessionStorage.getItem('elsewhere-last-hero');
  if(studies[1].image===lastHero)[studies[1],studies[3]]=[studies[3],studies[1]];
  sessionStorage.setItem('elsewhere-last-hero',studies[1].image);
} catch { /* Shuffling still works when browser storage is unavailable. */ }
const media=window.ELSEWHERE_MEDIA||{};
const heroSizes=['(max-width:600px) 40vw, 26vw','(max-width:600px) 77vw, (max-width:900px) 54vw, 44vw','(max-width:600px) 40vw, 26vw'];
function mediaFor(study,still=false){
  const original=(still||reducedMotion.matches||navigator.connection?.saveData)&&study.poster?study.poster:study.image;
  return media[original]||{src:original};
}
function setStudyImage(image,study,{sizes='100vw',still=false,thumbnail=false,priority='auto',lazy=false}={}){
  const asset=mediaFor(study,still);
  image.decoding='async';image.fetchPriority=priority;image.loading=lazy?'lazy':'eager';
  image.sizes=sizes;
  const srcset=thumbnail?'':asset.srcset||'';
  if(image.srcset!==srcset)image.srcset=srcset;
  const src=thumbnail?(asset.thumb||asset.src):asset.src;
  if(image.getAttribute('src')!==src)image.src=src;
  image.alt=study.alt;
}
function updateHeroImages(){
  document.querySelectorAll('.image-card').forEach((card,index)=>{
    const study=studies[Number(card.dataset.open??index)],image=card.querySelector('img');
    setStudyImage(image,study,{sizes:heroSizes[index],still:true,priority:index===1?'high':'auto'});
    image.style.objectPosition=study.position||'center';
    card.setAttribute('aria-label',`Explore: ${study.alt}`);
  });
}
updateHeroImages();
const entrance = document.querySelector('.entrance');
const skipIntro = document.querySelector('#skip-intro');
const introAnimations = [];
document.addEventListener('pointerdown',()=>document.body.classList.remove('keyboard-navigation'));
document.addEventListener('keydown',event=>{if(event.key==='Tab')document.body.classList.add('keyboard-navigation');});
const INTRO_HOLD = 0;
const INTRO_SPEED = .6;
let entranceTimer;
let entranceRun = 0;
let entranceActive = false;
function animate(element, frames, options) {
  const animation = element.animate(frames, {fill:'both',...options,duration:options.duration*INTRO_SPEED,delay:(options.delay||0)*INTRO_SPEED});
  introAnimations.push(animation);
  return animation;
}
function finishEntrance() {
  entranceRun++;
  entranceActive = false;
  clearTimeout(entranceTimer);
  document.body.classList.remove('is-entering','intro-settling');
  entrance.hidden = true;
  skipIntro.hidden = true;
  introAnimations.splice(0).forEach(animation => animation.cancel());
  document.querySelector('.entrance-frames').replaceChildren();
  scheduleScrollScene();
}
async function playEntrance() {
  finishEntrance();
  if (reducedMotion.matches||navigator.connection?.saveData) return;
  try {
    if(sessionStorage.getItem('elsewhere-intro-seen'))return;
    sessionStorage.setItem('elsewhere-intro-seen','1');
  } catch { /* A short entrance still works without storage. */ }
  const run = entranceRun;
  entranceActive = true;
  window.scrollTo({top:0,behavior:'instant'});
  entrance.hidden = false;
  skipIntro.hidden = false;
  document.body.classList.add('is-entering');
  // Always release the page, even if a font, image or animation fails.
  entranceTimer = setTimeout(finishEntrance, 2400);
  const ready = Promise.allSettled([document.fonts.ready,...[...document.querySelectorAll('.image-card img')].map(image=>image.decode())]);
  await Promise.race([ready,new Promise(resolve=>setTimeout(resolve,300))]);
  if (run !== entranceRun) return;
  try {
    const width=innerWidth, height=innerHeight;
    const cards=[...document.querySelectorAll('.image-card')];
    const startPoints=[[-width*.65,height*.38,0],[width*.5,height*.95,0],[width*1.3,height*.38,0]];
    const cardBounds=cards.map(card=>card.querySelector('.image-wrap').getBoundingClientRect());
    cards.forEach((card,index)=>{
      const bounds=cardBounds[index];
      const w=bounds.width, h=bounds.height;
      const frame=document.createElement('div'); frame.className='entrance-frame';
      frame.style.width=`${w}px`; frame.style.height=`${h}px`;
      const img=card.querySelector('img').cloneNode(); img.alt=''; frame.append(img);
      document.querySelector('.entrance-frames').append(frame);
      const finalX=bounds.left,finalY=bounds.top;
      const [startX,startY]=startPoints[index];
      // Arrive once at the real card bounds; hold there until the intro clears.
      animate(frame,[
        {transform:`translate3d(${startX}px,${startY}px,-550px) rotateY(${index===0?18:index===2?-18:0}deg) scale(.75)`,opacity:0},
        {transform:`translate3d(${finalX}px,${finalY}px,0) rotateY(0deg) scale(1)`,opacity:1}
      ],{duration:1400,delay:index*75,easing:'cubic-bezier(.22,1,.36,1)'});
    });
    animate(document.querySelector('.entrance-name'),[
      {opacity:0,transform:'translateY(12px) scale(1.04)',offset:0,easing:'cubic-bezier(.22,1,.36,1)'},
      {opacity:1,transform:'translateY(0) scale(1)',offset:540/(1800+INTRO_HOLD)},
      {opacity:1,transform:'translateY(0) scale(1)',offset:(1260+INTRO_HOLD)/(1800+INTRO_HOLD),easing:'cubic-bezier(.22,1,.36,1)'},
      {opacity:0,transform:'translateY(-12px) scale(.98)',offset:1}
    ],{duration:1800+INTRO_HOLD,delay:120,easing:'linear'});
    animate(document.querySelector('.entrance-name>span'),[{transform:'rotate(-100deg)'},{transform:'rotate(80deg)'}],{duration:2100+INTRO_HOLD,easing:'cubic-bezier(.22,1,.36,1)'});
    animate(document.querySelector('.entrance-curtain'),[{opacity:1},{opacity:0}],{duration:1200,delay:1350+INTRO_HOLD,easing:'cubic-bezier(.76,0,.24,1)'});
    document.body.classList.add('intro-settling');
    for (const [selector,delay] of [['.site-header',1950],['.gallery-bottom',2350]]) {
      animate(document.querySelector(selector),[{opacity:0,transform:'translateY(15px)'},{opacity:1,transform:'translateY(0)'}],{duration:700,delay:delay+INTRO_HOLD,easing:'cubic-bezier(.16,1,.3,1)'});
    }
    animate(skipIntro,[{opacity:1},{opacity:0}],{duration:350,delay:2350+INTRO_HOLD});
    clearTimeout(entranceTimer);
    entranceTimer=setTimeout(finishEntrance,(3150+INTRO_HOLD)*INTRO_SPEED);
  } catch(error) { finishEntrance(); }
}
skipIntro.addEventListener('click',()=>{finishEntrance();document.querySelector('.main-card').focus({preventScroll:true});});
// Scroll intent releases the entrance immediately, including on touch screens.
window.addEventListener('wheel',event=>{if(entranceActive&&event.deltaY&&!event.ctrlKey)finishEntrance();},{passive:true});
window.addEventListener('touchmove',()=>{if(entranceActive)finishEntrance();},{passive:true});
window.addEventListener('scroll',()=>{if(entranceActive&&window.scrollY>0)finishEntrance();},{passive:true});
window.addEventListener('resize',()=>{if(entranceActive)finishEntrance();});
reducedMotion.addEventListener('change',()=>{if(reducedMotion.matches)finishEntrance();updateHeroImages();if(gallery.open)void showStudy(current);});
document.addEventListener('keydown',event=>{
  if(!entranceActive||event.ctrlKey||event.metaKey||event.altKey)return;
  const interactive=event.target.isContentEditable||['INPUT','TEXTAREA','SELECT','BUTTON','A'].includes(event.target.tagName);
  if(['Escape','Tab'].includes(event.key)||(!interactive&&['ArrowDown','PageDown','End',' '].includes(event.key)))finishEntrance();
});

// Extension-inspired gallery with the website’s simplified controls.
const gallery=document.querySelector('#gallery-dialog');
const shadow=document.querySelector('#gallery-mount').attachShadow({mode:'open'});
shadow.innerHTML=window.ELSEWHERE_GALLERY_TEMPLATE;
const overlay=Object.fromEntries(['backdrop','image','previous','next','close','toast','capture','continue','open'].map(name=>[name,shadow.querySelector(`.${name}`)]));
overlay.image.setAttribute('aria-label','Open preview artwork');
let boardReady=false;
function ensureGalleryBoard(){
  if(boardReady)return;
  boardReady=true;
  const board=document.querySelector('.pin-board');
  for(let column=0;column<5;column++){
    const lane=document.createElement('div');lane.className='pin-column';lane.style.setProperty('--column',column);
    studies.filter((_,index)=>index%5===column).forEach((study,index)=>{
      const image=document.createElement('img');
      setStudyImage(image,study,{still:true,thumbnail:true,priority:'low',lazy:true});image.alt='';
      image.style.aspectRatio=[.78,1,.68,.88][(index+column)%4];
      lane.append(image);
    });
    board.append(lane);
  }
  shadow.querySelector('.pin-board').append(...[...board.children].map(column=>column.cloneNode(true)));
}
let closeAnimation;
let reversingGallery=false,advancingGallery=false,galleryOpenedAt=0,galleryReturnY=0;
function keepCurrentImageInHero(){
  document.querySelectorAll('.image-card').forEach((card,position)=>{
    const index=(current+position-1+studies.length)%studies.length;
    const study=studies[index],image=card.querySelector('img');
    setStudyImage(image,study,{sizes:heroSizes[position],still:true,priority:position===1?'high':'auto'});
    image.alt=study.alt;image.style.objectPosition=study.position||'center';
    card.dataset.open=String(index);card.setAttribute('aria-label',`Explore: ${study.alt}`);
  });
  scrollImage.dataset.open=String(current);
  sceneDirty=true;
}
function reverseGallery(delta){
  if(!gallery.open||closeAnimation)return;
  keepCurrentImageInHero();
  reversingGallery=true;
  scrollConsumed=true;
  const end=sequence.offsetTop+sequence.offsetHeight-innerHeight;
  // Put the underlying scroll image exactly where the dialog image is before release.
  window.scrollTo({top:end,behavior:'instant'});
  renderScrollScene();
  gallery.close();
  window.scrollTo({top:Math.max(sequence.offsetTop,end+delta),behavior:'instant'});
  renderScrollScene();
}
function advanceGallery(delta=innerHeight*.45){
  if(!gallery.open||closeAnimation)return;
  keepCurrentImageInHero();updateCaptureDemo(current);
  rememberGalleryControls();
  advancingGallery=true;scrollConsumed=true;
  const end=Math.max(galleryReturnY,sequence.offsetTop+sequence.offsetHeight-innerHeight);
  window.scrollTo({top:end,behavior:'instant'});renderScrollScene();
  gallery.close();
  window.scrollTo({top:end+Math.min(Math.max(delta,60),innerHeight*.65),behavior:reducedMotion.matches?'instant':'smooth'});
}
function galleryImageSize(width,height){
  const mobile=innerWidth<=700;
  const scale=Math.min(1,(mobile?innerWidth-28:Math.min(innerWidth-160,1500))/width,(innerHeight-(mobile?196:158))/height);
  return {width:width*scale,height:height*scale};
}
function sizeGalleryImage(width,height){
  const size=galleryImageSize(width,height);
  overlay.image.style.width=`${size.width}px`;overlay.image.style.height=`${size.height}px`;
}
function closeGallery(){
  if(!gallery.open||closeAnimation)return;
  rememberGalleryControls();
  if(reducedMotion.matches){gallery.close();return;}
  closeAnimation=overlay.backdrop.animate([{opacity:1},{opacity:0}],{duration:240,easing:'ease-out',fill:'forwards'});
  closeAnimation.finished.then(()=>{gallery.close();closeAnimation.cancel();closeAnimation=null;});
}

let current=1, opener=null, toastTimer, renderToken=0;
const decodedImages=new Map();
function prepareImage(study){
  const asset=mediaFor(study);
  const size=galleryImageSize(asset.width||800,asset.height||1000);
  const key=`${asset.src}:${Math.ceil(size.width)}`;
  if(decodedImages.has(key))return decodedImages.get(key);
  const image=new Image();
  setStudyImage(image,study,{sizes:`${Math.ceil(size.width)}px`});
  const ready=image.decode().then(()=>image).catch(error=>{decodedImages.delete(key);throw error;});
  decodedImages.set(key,ready);
  // Bound decoded gallery memory, especially for animated artwork on phones.
  if(decodedImages.size>5)decodedImages.delete(decodedImages.keys().next().value);
  return ready;
}
function showToast(message) {
  clearTimeout(toastTimer);
  overlay.toast.textContent=message;
  overlay.toast.classList.add('visible');
  toastTimer=setTimeout(()=>overlay.toast.classList.remove('visible'),3000);
}
async function showStudy(index,direction=0) {
  if(index<0){showToast('Start of collection');return;}
  if(index>=studies.length){showToast('End of collection');return;}
  current=index;
  const token=++renderToken;
  const study=studies[current];
  overlay.image.classList.remove('arriving');
  const seamless=direction===0&&overlay.backdrop.classList.contains('from-scroll');
  if(!seamless)overlay.image.classList.add('switching');
  overlay.backdrop.setAttribute('aria-busy','true');
  let preload;
  try { preload=await prepareImage(study); } catch {
    if(token===renderToken){overlay.image.removeAttribute('src');overlay.image.classList.remove('switching');overlay.backdrop.setAttribute('aria-busy','false');showToast('This image could not be loaded. Use → to keep browsing.');}
    return;
  }
  if(token!==renderToken || !gallery.open)return;
  const asset=mediaFor(study);
  sizeGalleryImage(asset.width||preload.naturalWidth,asset.height||preload.naturalHeight);
  overlay.image.src=preload.currentSrc||preload.src;
  overlay.image.title=study.provenance||study.alt;
  overlay.image.alt=study.alt;
  overlay.image.classList.remove('switching');
  overlay.image.style.setProperty('--entry',`${direction*14}px`);
  if(!seamless)overlay.image.classList.add('arriving');
  overlay.backdrop.setAttribute('aria-busy','false');
  syncCaptureUI();
  // Warm only the neighbouring images, not the whole collection.
  if(!navigator.connection?.saveData){
    [current-1,current+1].forEach(index=>{if(studies[index]&&!studies[index].animated)void prepareImage(studies[index]).catch(()=>{});});
  }
}
function openGallery(index,trigger,fromScroll=false) {
  if(gallery.open)return;
  galleryReturnY=window.scrollY;
  galleryFromScroll=fromScroll||(scrollProgress>.05&&galleryReturnY<sequence.offsetTop+sequence.offsetHeight);
  if(galleryFromScroll)scrollConsumed=true;
  finishEntrance();
  ensureGalleryBoard();
  overlay.backdrop.classList.toggle('from-scroll',fromScroll);
  if(fromScroll){
    window.scrollTo({top:sequence.offsetTop+sequence.offsetHeight-innerHeight,behavior:'instant'});
    renderScrollScene();
    const source=centralCard.querySelector('img');
    const asset=mediaFor(studies[index]);
    sizeGalleryImage(asset.width||source.naturalWidth||800,asset.height||source.naturalHeight||1000);
    overlay.image.classList.remove('arriving','switching');
    overlay.image.src=source.currentSrc||source.src;overlay.image.alt=studies[index].alt;
  }
  opener=trigger||document.activeElement;
  gallery.showModal();galleryOpenedAt=performance.now();
  void showStudy(index);
  overlay.backdrop.focus({preventScroll:true});
}
function openOriginal() {
  if(!overlay.image.classList.contains('switching'))window.open(studies[current].sourceUrl||studies[current].image,'_blank','noopener,noreferrer');
}
document.querySelectorAll('[data-study]').forEach(button=>{button.dataset.open=String(studies.findIndex(study=>study.image===button.dataset.study));});
document.querySelectorAll('[data-open]').forEach(button=>button.addEventListener('click',()=>openGallery(Number(button.dataset.open),button)));
overlay.previous.addEventListener('click',()=>void showStudy(current-1,-1));
overlay.next.addEventListener('click',()=>void showStudy(current+1,1));
overlay.close.addEventListener('click',closeGallery);
overlay.continue.addEventListener('click',()=>advanceGallery());
overlay.image.addEventListener('click',openOriginal);
overlay.open.addEventListener('click',openOriginal);
overlay.image.addEventListener('dragstart',event=>event.preventDefault());
overlay.backdrop.addEventListener('click',event=>{if(event.target===overlay.backdrop||event.target.classList.contains('stage'))closeGallery();});
overlay.backdrop.addEventListener('wheel',event=>{
  if(event.ctrlKey)return;
  event.preventDefault();
  if(event.deltaY<0&&Math.abs(event.deltaY)>Math.abs(event.deltaX)){
    const unit=event.deltaMode===1?16:event.deltaMode===2?innerHeight:1;
    reverseGallery(event.deltaY*unit);
  }else if(event.deltaY>0&&Math.abs(event.deltaY)>Math.abs(event.deltaX)&&performance.now()-galleryOpenedAt>650){
    const unit=event.deltaMode===1?16:event.deltaMode===2?innerHeight:1;advanceGallery(event.deltaY*unit);
  }
},{passive:false});
let verticalTouch;
overlay.backdrop.addEventListener('touchstart',event=>{
  if(event.touches.length===1)verticalTouch={x:event.touches[0].clientX,y:event.touches[0].clientY};
},{passive:true});
overlay.backdrop.addEventListener('touchmove',event=>{
  if(!verticalTouch||event.touches.length!==1)return;
  const dx=event.touches[0].clientX-verticalTouch.x,dy=event.touches[0].clientY-verticalTouch.y;
  if(dy>20&&dy>Math.abs(dx)*1.3){event.preventDefault();touchStart=null;verticalTouch=null;reverseGallery(-dy);}
  else if(dy< -20&&-dy>Math.abs(dx)*1.3){event.preventDefault();touchStart=null;verticalTouch=null;advanceGallery(-dy);}
},{passive:false});
overlay.backdrop.addEventListener('touchend',()=>{verticalTouch=null;},{passive:true});
gallery.addEventListener('close',()=>{
  renderToken++;clearTimeout(toastTimer);overlay.toast.classList.remove('visible');
  overlay.backdrop.classList.remove('from-scroll');
  updateCaptureDemo(current);
  if(!advancingGallery&&!reversingGallery)rememberGalleryControls();
  if(advancingGallery){
    advancingGallery=false;centralCard.focus({preventScroll:true});
  }else if(reversingGallery){
    reversingGallery=false;centralCard.focus({preventScroll:true});
  }else if(galleryFromScroll){
    window.scrollTo({top:document.querySelector('#idea').offsetTop,behavior:'instant'});
    document.querySelector('#idea-title').setAttribute('tabindex','-1');
    document.querySelector('#idea-title').focus({preventScroll:true});
  }else opener?.focus({preventScroll:true});
  galleryFromScroll=false;scheduleScrollScene();
});
gallery.addEventListener('keydown',event=>{
  if(event.altKey||event.ctrlKey||event.metaKey)return;
  const target=event.composedPath()[0];
  if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();void showStudy(current+(event.key==='ArrowLeft'?-1:1),event.key==='ArrowLeft'?-1:1);}
  if((event.key==='Enter'||event.key===' ')&&target.tagName!=='BUTTON'){event.preventDefault();if(!event.repeat)openOriginal();}
  if(event.key.toLowerCase()==='m'){event.preventDefault();if(!event.repeat)captureCurrent();}
  if(event.key==='ArrowDown'||event.key==='PageDown'){event.preventDefault();advanceGallery();}
  if(event.key==='ArrowUp'||event.key==='PageUp'||event.key==='Home'){event.preventDefault();reverseGallery(event.key==='Home'?-sequence.offsetHeight:event.key==='PageUp'?-innerHeight:-100);}
  if(event.key==='Escape'){event.preventDefault();closeGallery();}
});
const install=document.querySelector('#install-dialog');
document.querySelectorAll('.install-trigger').forEach(button=>button.addEventListener('click',()=>{finishEntrance();install.showModal();}));
document.querySelector('#close-install').addEventListener('click',()=>install.close());
install.addEventListener('click',event=>{const r=install.getBoundingClientRect();if(event.target===install&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom))install.close();});
document.addEventListener('keydown',event=>{
  if(entranceActive||gallery.open||install.open||captureDialog.open||event.altKey||event.ctrlKey||event.metaKey)return;
  if(!['ArrowLeft','ArrowRight'].includes(event.key)||['INPUT','TEXTAREA','SELECT','BUTTON','A'].includes(document.activeElement.tagName)||document.activeElement.isContentEditable)return;
  const bounds=document.querySelector('#experience').getBoundingClientRect();
  if(bounds.top<innerHeight&&bounds.bottom>0){event.preventDefault();openGallery(Number(centralCard.dataset.open),document.querySelector('.try-button'));}
});
let touchStart;
overlay.image.addEventListener('touchstart',event=>{touchStart={x:event.changedTouches[0].clientX,y:event.changedTouches[0].clientY};},{passive:true});
overlay.image.addEventListener('touchend',event=>{if(!touchStart)return;const dx=event.changedTouches[0].clientX-touchStart.x,dy=event.changedTouches[0].clientY-touchStart.y;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)){event.preventDefault();void showStudy(current+(dx<0?1:-1),dx<0?1:-1);}touchStart=null;},{passive:false});
// Capture is a local, working collection. Only known collection IDs are persisted.
const captureDialog=document.querySelector('#capture-dialog');
const captureStatus=document.querySelector('#capture-status');
const captureKey='elsewhere-capture-v1';
let captured=[],captureStatusTimer,captureStorage=true;
let captureGridKey='';
let demoStudyIndex=studies.findIndex(study=>study.image==='assets/elsewhere-capture.jpg');
try{
  const saved=JSON.parse(localStorage.getItem(captureKey)||'[]');
  if(Array.isArray(saved))captured=[...new Set(saved)].filter(id=>studies.some(study=>study.image===id));
}catch{captureStorage=false;}
function captureNotice(message){
  clearTimeout(captureStatusTimer);captureStatus.textContent=message;captureStatus.classList.add('visible');
  captureStatusTimer=setTimeout(()=>captureStatus.classList.remove('visible'),2600);
}
function persistCapture(){
  try{localStorage.setItem(captureKey,JSON.stringify(captured));captureStorage=true;}catch{captureStorage=false;}
}
function syncCaptureUI(){
  document.querySelectorAll('.capture-count').forEach(count=>{count.textContent=String(captured.length);count.hidden=captured.length===0&&count.closest('.capture-link')!==null;});
  const isSaved=captured.includes(studies[current]?.image);
  overlay.capture.dataset.saved=String(isSaved);
  overlay.capture.innerHTML=isSaved?'Captured <span aria-hidden="true">✓</span>':'Capture <kbd>M</kbd>';
  const grid=document.querySelector('#capture-grid');
  document.querySelector('#capture-empty').hidden=captured.length>0;
  const nextGridKey=JSON.stringify(captured);
  if(nextGridKey!==captureGridKey){
  captureGridKey=nextGridKey;grid.replaceChildren();
  captured.forEach(id=>{
    const study=studies.find(study=>study.image===id);
    const card=document.createElement('article');card.className='captured-card';
    const link=document.createElement('a');link.href=study.sourceUrl||study.image;link.target='_blank';link.rel='noopener noreferrer';link.title='Open original image';
    const image=document.createElement('img');setStudyImage(image,study,{still:true,sizes:'(max-width:600px) 40vw, 240px',lazy:true});link.append(image);
    const remove=document.createElement('button');remove.className='remove-capture';remove.textContent='×';remove.setAttribute('aria-label',`Remove ${study.alt} from Capture`);
    remove.addEventListener('click',()=>{captured=captured.filter(item=>item!==id);persistCapture();syncCaptureUI();});
    card.append(link,remove);grid.append(card);
  });
  }
  const demoSaved=captured.includes(studies[demoStudyIndex].image);
  const captureButton=document.querySelector('#capture-demo-button');
  captureButton.textContent=demoSaved?'✓':'M';captureButton.setAttribute('aria-label',demoSaved?'View Capture':'Capture this image');
  document.querySelector('.walk-main').classList.toggle('is-saved',demoSaved);
  if(!captureStorage){document.querySelector('.collection-note').textContent='Saved for this visit. Browser storage is unavailable.';}
}
function updateCaptureDemo(index){
  demoStudyIndex=index;
  const study=studies[index],image=document.querySelector('#capture-demo-image');
  setStudyImage(image,study,{sizes:heroSizes[1]});
  updateWalkCards();syncCaptureUI();
}
function captureStudy(index,source){
  const study=studies[index];
  if(captured.includes(study.image)){if(gallery.open)showToast('Already in Capture');else captureNotice('Already in Capture');return;}
  captured.unshift(study.image);persistCapture();syncCaptureUI();
  const message=captureStorage?'Saved to Capture':'Captured for this visit';
  if(gallery.open)showToast(message);else captureNotice(message);
  if(!reducedMotion.matches&&source){source.animate([{filter:'brightness(1)',transform:'scale(1)'},{filter:'brightness(1.16)',transform:'scale(.975)'},{filter:'brightness(1)',transform:'scale(1)'}],{duration:440,easing:'ease-out'});}
}
function captureCurrent(){
  if(overlay.backdrop.getAttribute('aria-busy')==='true'){showToast('Let this image finish loading first');return;}
  captureStudy(current,overlay.image);
}
overlay.capture.addEventListener('click',captureCurrent);
document.querySelector('#capture-demo-button').addEventListener('click',()=>{
  if(captured.includes(studies[demoStudyIndex].image)){syncCaptureUI();captureDialog.showModal();}
  else captureStudy(demoStudyIndex,document.querySelector('#capture-demo-image'));
});
document.querySelectorAll('[data-open-capture]').forEach(button=>button.addEventListener('click',()=>{finishEntrance();syncCaptureUI();captureDialog.showModal();}));
document.querySelector('#close-capture').addEventListener('click',()=>captureDialog.close());
captureDialog.addEventListener('click',event=>{const r=captureDialog.getBoundingClientRect();if(event.target===captureDialog&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom))captureDialog.close();});
document.addEventListener('keydown',event=>{
  if(event.key.toLowerCase()!=='m'||event.repeat||event.altKey||event.ctrlKey||event.metaKey||entranceActive||gallery.open||install.open||captureDialog.open)return;
  const target=event.target;if(target.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(target.tagName))return;
  const bounds=document.querySelector('#capture').getBoundingClientRect();
  if(bounds.top<innerHeight*.6&&bounds.bottom>innerHeight*.4){event.preventDefault();captureStudy(demoStudyIndex,document.querySelector('#capture-demo-image'));}
});
syncCaptureUI();

if('IntersectionObserver' in window&&!reducedMotion.matches){
  const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.remove('is-below');observer.unobserve(entry.target);}}),{threshold:.12});
  document.querySelectorAll('.footer-wordmark').forEach(section=>{section.classList.add('reveal-section','is-below');observer.observe(section);});
}
// The sticky hero becomes the real gallery as the page scrolls.
const sequence=document.querySelector('.scroll-sequence');
const hero=document.querySelector('.hero');
const centralCard=document.querySelector('.main-card');
const scrollImage=document.querySelector('.scroll-image');
const scrollGuide=document.querySelector('.scroll-guide');
const heroSource=centralCard.querySelector('img');
const enlargedImage=scrollImage.querySelector('img');
const galleryBottom=document.querySelector('.gallery-bottom');
const sideCards=[...document.querySelectorAll('.side-card')];
const heroBoard=hero.querySelector('.pin-board');
const heroShade=hero.querySelector('.board-shade');
let sceneDirty=true,sceneGeometry,lastHeroProgress=-1,lastSceneScrollY=null;
let scrollProgress=0,scrollConsumed=false,galleryFromScroll=false,scrollFrame=0;
const clamp=value=>Math.max(0,Math.min(1,value));
function scheduleScrollScene(){
  if(!scrollFrame)scrollFrame=requestAnimationFrame(renderScrollScene);
}
function invalidateScene(){sceneDirty=true;scheduleScrollScene();}
function measureScene(){
  // Read geometry together, only after layout changes; scrolling uses cached values.
  const scrollY=window.scrollY;
  const sequenceRect=sequence.getBoundingClientRect();
  const heroRect=hero.getBoundingClientRect();
  const card=centralCard.querySelector('.image-wrap').getBoundingClientRect();
  const walkRect=walkthrough.getBoundingClientRect();
  const stageRect=walkStage.getBoundingClientRect();
  const buttons=walkButtons.map(button=>{
    const r=button.getBoundingClientRect(),old=walkPositions.get(button)||{x:0,y:0};
    return {x:r.left-old.x+r.width/2,y:r.top-old.y-stageRect.top+r.height/2};
  });
  const asset=mediaFor(studies[Number(centralCard.dataset.open)]);
  const target=galleryImageSize(asset.width||heroSource.naturalWidth||800,asset.height||heroSource.naturalHeight||1000);
  sceneGeometry={
    top:sequenceRect.top+scrollY,range:Math.max(1,sequenceRect.height-innerHeight),
    viewportWidth:innerWidth,viewportHeight:innerHeight,
    card:{x:card.left-heroRect.left,y:card.top-heroRect.top,width:card.width,height:card.height},target,
    walkTop:walkRect.top+scrollY,walkHeight:walkRect.height,stageHeight:stageRect.height,buttons
  };
  sceneDirty=false;lastHeroProgress=-1;
  // Size once; the animation below only changes transform and its rounded crop.
  scrollImage.style.width=`${target.width}px`;scrollImage.style.height=`${target.height}px`;
}
function renderScrollScene(){
  scrollFrame=0;
  if(entranceActive)return;
  if(sceneDirty)measureScene();
  const geometry=sceneGeometry,scrollY=window.scrollY;
  const galleryEnd=geometry.top+geometry.range;
  const returningToGallery=lastSceneScrollY!==null&&scrollY<lastSceneScrollY&&lastSceneScrollY>galleryEnd&&scrollY<=galleryEnd+2;
  lastSceneScrollY=scrollY;
  // Crossing the gallery boundary restores the same dialog in either direction.
  // Keep the most recently browsed image when returning from the walkthrough.
  if(returningToGallery&&scrollConsumed&&!gallery.open&&!install.open&&!captureDialog.open&&!reversingGallery&&!advancingGallery){
    current=demoStudyIndex;
    keepCurrentImageInHero();
    openGallery(current,centralCard,true);
    return;
  }
  const raw=clamp((scrollY-geometry.top)/geometry.range);
  scrollProgress=raw;
  if(raw<.95)scrollConsumed=false;
  renderWalkthrough(geometry,scrollY);
  if(raw===lastHeroProgress)return;
  lastHeroProgress=raw;
  const active=raw>.001&&!reducedMotion.matches;
  document.body.classList.toggle('scrolling-in',active);
  scrollImage.hidden=!active;
  const progress=raw*raw*(3-2*raw);
  if(progress>.05)ensureGalleryBoard();
  const boardOpacity=clamp((progress-.12)/.7);
  heroBoard.style.opacity=boardOpacity;heroShade.style.opacity=boardOpacity;
  const fade=1-clamp(progress*2.4);
  galleryBottom.style.opacity=fade;
  galleryBottom.style.pointerEvents=fade<.1?'none':'';
  sideCards.forEach((card,index)=>{
    card.style.opacity=1-clamp(progress*1.65);
    card.style.transform=reducedMotion.matches?'':`translate3d(${(index?1:-1)*progress*geometry.viewportWidth*.3}px,0,0) scale(${1-progress*.12})`;
  });
  scrollGuide.style.opacity=clamp((progress-.3)*2.5);
  if(active){
    const src=heroSource.currentSrc||heroSource.src;
    if(enlargedImage.src!==src)enlargedImage.src=src;
    const {card:bounds,target:{width,height},viewportWidth,viewportHeight}=geometry;
    const targetX=viewportWidth/2,targetY=viewportHeight/2+(viewportWidth<=700?-24:1);
    const lerp=(a,b)=>a+(b-a)*progress;
    const visibleWidth=lerp(bounds.width,width),visibleHeight=lerp(bounds.height,height);
    const scale=Math.max(visibleWidth/width,visibleHeight/height);
    const x=lerp(bounds.x+bounds.width/2,targetX)-width*scale/2;
    const y=lerp(bounds.y+bounds.height/2,targetY)-height*scale/2;
    const cropX=Math.max(0,(width-visibleWidth/scale)/2),cropY=Math.max(0,(height-visibleHeight/scale)/2);
    scrollImage.style.transform=`translate3d(${x}px,${y}px,0) scale(${scale})`;
    scrollImage.style.clipPath=`inset(${cropY}px ${cropX}px round ${(viewportWidth<=600?17:22)/scale}px)`;
    enlargedImage.style.objectPosition=heroSource.style.objectPosition;
  }
  if(raw>=1&&!scrollConsumed&&!gallery.open&&!install.open&&!captureDialog.open){
    openGallery(Number(centralCard.dataset.open),centralCard,true);
  }
}
window.addEventListener('scroll',scheduleScrollScene,{passive:true});
window.addEventListener('resize',()=>{invalidateScene();if(gallery.open&&overlay.image.naturalWidth)sizeGalleryImage(overlay.image.naturalWidth,overlay.image.naturalHeight);});
heroSource.addEventListener('load',invalidateScene);
document.fonts.ready.then(invalidateScene);
reducedMotion.addEventListener('change',invalidateScene);
document.querySelector('.scroll-trigger').addEventListener('click',()=>{
  window.scrollTo({top:sequence.offsetTop+sequence.offsetHeight-innerHeight,behavior:reducedMotion.matches?'instant':'smooth'});
});
// The controls retain their identity as the gallery becomes its own explanation.
const walkthrough=document.querySelector('.walkthrough');
const walkStage=document.querySelector('.walk-stage');
const walkButtons=[document.querySelector('#walk-previous'),document.querySelector('#walk-next'),document.querySelector('#capture-demo-button'),document.querySelector('#walk-open')];
let handoffRects=null,walkStep=-1;
const walkPositions=new Map();
let walkImagesReady=false;
function rememberGalleryControls(){
  if(!gallery.open)return;
  const rects=[overlay.previous,overlay.next,overlay.capture,overlay.open].map(button=>button.getBoundingClientRect());
  if(rects.some(rect=>!rect.width||!rect.height))return;
  handoffRects=rects.map(r=>({x:r.left+r.width/2,y:r.top+r.height/2}));
}
function updateWalkCards(){
  if(!walkImagesReady)return;
  for(const [id,offset] of [['walk-image-left',-1],['walk-image-right',1]]){
    const study=studies[(demoStudyIndex+offset+studies.length)%studies.length],image=document.getElementById(id);
    setStudyImage(image,study,{sizes:heroSizes[offset<0?0:2]});
  }
  const study=studies[demoStudyIndex];
  document.querySelector('#walk-source').href=study.sourceUrl||study.image;
}
function browseWalk(delta){
  updateCaptureDemo((demoStudyIndex+delta+studies.length)%studies.length);
  if(!reducedMotion.matches)document.querySelector('.walk-cards').animate([{opacity:.65,transform:`translateX(${delta*12}px)`},{opacity:1,transform:'translateX(0)'}],{duration:340,easing:'ease-out'});
}
function openWalkOriginal(){window.open(studies[demoStudyIndex].sourceUrl||studies[demoStudyIndex].image,'_blank','noopener,noreferrer');}
for(const id of ['walk-previous','walk-left'])document.getElementById(id).addEventListener('click',()=>browseWalk(-1));
for(const id of ['walk-next','walk-right'])document.getElementById(id).addEventListener('click',()=>browseWalk(1));
document.querySelector('#walk-open').addEventListener('click',openWalkOriginal);
document.addEventListener('keydown',event=>{
  if(entranceActive||gallery.open||install.open||captureDialog.open||event.altKey||event.ctrlKey||event.metaKey||event.repeat)return;
  if(['INPUT','TEXTAREA','SELECT','BUTTON','A'].includes(event.target.tagName)||event.target.isContentEditable)return;
  const r=walkthrough.getBoundingClientRect();if(r.top>innerHeight*.35||r.bottom<innerHeight*.6)return;
  if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();browseWalk(event.key==='ArrowLeft'?-1:1);}
  if(event.key==='Enter'){event.preventDefault();openWalkOriginal();}
});
function renderWalkthrough(geometry,scrollY){
  const top=geometry.walkTop-scrollY;
  const progress=clamp(-top/Math.max(1,geometry.walkHeight-geometry.viewportHeight));
  const step=progress<.32?0:progress<.66?1:2;
  if(step!==walkStep){
    walkStep=step;walkStage.dataset.step=['browse','capture','open'][step];
    document.querySelector('#idea-title').textContent=['Keep looking.','Keep the good ones.','Follow your curiosity.'][step];
    document.querySelector('#walk-description').textContent=['Pinterest, one image at a time.','Press M. It’s in Capture.','Press Enter to open the original.'][step];
    document.querySelector('#walk-cue').innerHTML=step===2?'Keep exploring <span aria-hidden="true">↓</span>':'Scroll to discover <span aria-hidden="true">↓</span>';
    if(!reducedMotion.matches)document.querySelector('.walk-heading').animate([{opacity:.2,transform:'translateY(10px)'},{opacity:1,transform:'translateY(0)'}],{duration:350,easing:'ease-out'});
  }
  const arrival=clamp(1-top/geometry.viewportHeight);
  const ease=arrival*arrival*(3-2*arrival);
  const stageTop=Math.min(Math.max(top,0),top+geometry.walkHeight-geometry.stageHeight);
  walkButtons.forEach((button,index)=>{
    const old=walkPositions.get(button)||{x:0,y:0};
    let x=0,y=0;
    if(handoffRects&&!reducedMotion.matches&&top>0&&top<geometry.viewportHeight){
      x=(handoffRects[index].x-geometry.buttons[index].x)*(1-ease);
      y=(handoffRects[index].y-(stageTop+geometry.buttons[index].y))*(1-ease);
    }
    if(x!==old.x||y!==old.y){
      button.style.transform=`translate3d(${x}px,${y}px,0)`;walkPositions.set(button,{x,y});
    }
  });
}
function loadWalkImages(){
  if(walkImagesReady)return;
  walkImagesReady=true;updateCaptureDemo(demoStudyIndex);
}
if('IntersectionObserver' in window){
  const observer=new IntersectionObserver(entries=>{
    if(entries.some(entry=>entry.isIntersecting)){loadWalkImages();observer.disconnect();}
  },{rootMargin:'300px'});
  observer.observe(walkthrough);
  const footer=document.querySelector('footer');
  new IntersectionObserver(entries=>footer.classList.toggle('is-visible',entries[0].isIntersecting)).observe(footer);
}else loadWalkImages();
if('ResizeObserver' in window){
  const observer=new ResizeObserver(invalidateScene);
  [hero,centralCard,walkStage,document.querySelector('.walk-heading')].forEach(element=>observer.observe(element));
}
void playEntrance();
