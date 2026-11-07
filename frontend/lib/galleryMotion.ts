/** Original-size carousel cards rest between smooth single-card steps. Visual
 * repeat cycles make the final-to-first step seamless without accessible clones. */
export function bindGalleryMotion(viewport:HTMLElement,{window:win=window,document:doc=document,intervalMs=3000,transitionMs=600}:{window?:Window;document?:Document;intervalMs?:number;transitionMs?:number}={}){
 let frame=0,last:number|null=null,position=viewport.scrollLeft,observed=position,wait=0;
 let hovered=false,focused=false,dragging=false,visible=true,stopped=false;
 let cycle:{start:number;length:number;step:number}|null=null,transition:{from:number;to:number;elapsed:number}|null=null;
 const wrap=(value:number)=>cycle?cycle.start+((value-cycle.start)%cycle.length+cycle.length)%cycle.length:value;
 const measure=()=>{
  const previous=cycle,relative=previous?(position-previous.start)/previous.step:null;
  const first=viewport.querySelector?.<HTMLElement>('[data-gallery-original-start]'),next=viewport.querySelector?.<HTMLElement>('[data-gallery-after-start]');
  const adjacent=first?.nextElementSibling as HTMLElement|null,step=first&&adjacent?adjacent.offsetLeft-first.offsetLeft:viewport.clientWidth;
  cycle=first&&next&&next.offsetLeft>first.offsetLeft&&step>0&&viewport.clientWidth>0&&viewport.scrollWidth>viewport.clientWidth?{start:first.offsetLeft,length:next.offsetLeft-first.offsetLeft,step}:null;
  position=cycle?wrap(relative===null?viewport.scrollLeft:cycle.start+relative*cycle.step):viewport.scrollLeft;
  if(cycle)viewport.scrollLeft=position;
  observed=viewport.scrollLeft;last=null;wait=0;transition=null;
 };
 measure();
 const media=win.matchMedia?.('(prefers-reduced-motion: reduce)');let reduced=media?.matches===true;
 const enter=(event:Event)=>{if((event as PointerEvent).pointerType==='touch')return;hovered=true;last=null;};
 const leave=()=>{hovered=false;last=null;};
 // Touch may focus the scroll region. Only keyboard focus should keep it paused
 // after the pointer is released; pointer inspection has its own hold state.
 const focus=()=>{focused=!dragging;last=null;};
 const blur=(event:FocusEvent)=>{focused=!!event.relatedTarget&&viewport.contains(event.relatedTarget as Node);last=null;};
 const hold=()=>{dragging=true;focused=false;last=null;},release=()=>{dragging=false;last=null;};
 const visibility=()=>{last=null;};
 const preference=(event:MediaQueryListEvent)=>{reduced=event.matches;last=null;};
 const observer=typeof IntersectionObserver==='undefined'?null:new IntersectionObserver(entries=>{visible=entries.some(entry=>entry.isIntersecting);last=null;},{rootMargin:'100px'});
 observer?.observe(viewport);
 const sizeObserver=typeof ResizeObserver==='undefined'?null:new ResizeObserver(measure);sizeObserver?.observe(viewport);
 const tick=(at:number)=>{
  if(stopped)return;
  const moving=!hovered&&!focused&&!dragging&&!reduced&&visible&&doc.visibilityState!=='hidden';
  if(cycle){
   // Adopt a real swipe/keyboard scroll, retaining fractional animation progress
   // on engines that round scrollLeft to whole pixels.
   if(Math.abs(viewport.scrollLeft-observed)>.5){position=wrap(viewport.scrollLeft);transition=null;wait=0;viewport.scrollLeft=position;}
   if(moving&&last!==null){
    const elapsed=Math.min(Math.max(at-last,0),64);
    if(transition){
     transition.elapsed+=elapsed;const progress=Math.min(1,transition.elapsed/Math.max(1,transitionMs)),eased=progress*progress*(3-2*progress);
     position=transition.from+(transition.to-transition.from)*eased;
     if(progress===1){position=wrap(transition.to);transition=null;wait=0;}
    }else if((wait+=elapsed)>=Math.max(0,intervalMs)){
     const offset=(wrap(position)-cycle.start)/cycle.step,next=Math.floor(offset+.001)+1;
     transition={from:position,to:cycle.start+next*cycle.step,elapsed:0};wait=0;
    }
   }
   if(Math.abs(viewport.scrollLeft-position)>.001)viewport.scrollLeft=position;
   observed=viewport.scrollLeft;
  }
  last=moving?at:null;frame=win.requestAnimationFrame(tick);
 };
 viewport.addEventListener('pointerenter',enter);viewport.addEventListener('pointerleave',leave);
 viewport.addEventListener('focusin',focus);viewport.addEventListener('focusout',blur);
 viewport.addEventListener('pointerdown',hold);win.addEventListener('pointerup',release);win.addEventListener('pointercancel',release);
 doc.addEventListener('visibilitychange',visibility);win.addEventListener('resize',measure);
 if(media?.addEventListener)media.addEventListener('change',preference);else media?.addListener?.(preference);
 frame=win.requestAnimationFrame(tick);
 return()=>{stopped=true;win.cancelAnimationFrame(frame);observer?.disconnect();sizeObserver?.disconnect();viewport.removeEventListener('pointerenter',enter);viewport.removeEventListener('pointerleave',leave);viewport.removeEventListener('focusin',focus);viewport.removeEventListener('focusout',blur);viewport.removeEventListener('pointerdown',hold);win.removeEventListener('pointerup',release);win.removeEventListener('pointercancel',release);doc.removeEventListener('visibilitychange',visibility);win.removeEventListener('resize',measure);if(media?.removeEventListener)media.removeEventListener('change',preference);else media?.removeListener?.(preference);};
}
