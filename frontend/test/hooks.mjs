/** Deterministic hook fixture for executing actual component callbacks, not a React/Next browser. */
export function hookHarness(){
 const slots=[],effects=[],timers=new Map();let cursor=0,renderFn=()=>null,tree,mounted=true,queued=false,counter=0;
 const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
 const schedule=()=>{if(!mounted||queued)return;queued=true;queueMicrotask(()=>{queued=false;if(mounted)render();});};
 const React={useState(initial){const i=cursor++;if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial};return[slots[i].value,next=>{const v=typeof next==='function'?next(slots[i].value):next;if(!Object.is(v,slots[i].value)){slots[i].value=v;schedule();}}];},useRef(value){const i=cursor++;if(!slots[i])slots[i]={current:value};return slots[i];},useEffect(fn,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps)){const cleanup=slots[i]?.cleanup;slots[i]={deps};effects.push(()=>{cleanup?.();slots[i].cleanup=fn();});}},useMemo(fn,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps))slots[i]={deps,value:fn()};return slots[i].value;},useCallback(fn,deps){return React.useMemo(()=>fn,deps);}};
 function render(){cursor=0;tree=renderFn();while(effects.length)effects.shift()();}
 const jsx=(type,props,key)=>({type,props,key});
 return {React,jsx,jsxs:jsx,globals:{setTimeout:(fn,ms)=>{timers.set(++counter,{fn,ms});return counter;},clearTimeout:id=>timers.delete(id),setInterval:(fn,ms)=>{timers.set(++counter,{fn,ms,repeat:true});return counter;},clearInterval:id=>timers.delete(id)},timers,mount(fn){renderFn=fn;render();},render,async settle(){for(let i=0;i<20;i++)await Promise.resolve();},get tree(){return tree;},run(ms){for(const[id,t]of [...timers])if(t.ms===ms){if(!t.repeat)timers.delete(id);t.fn();}},cleanup(){mounted=false;for(const s of slots)s?.cleanup?.();timers.clear();}};
}
