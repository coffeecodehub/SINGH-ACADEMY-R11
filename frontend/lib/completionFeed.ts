/** A per-account, per-document batch watcher. It never writes learning progress.
 * Only visible/online documents poll. Success and error retries are bounded. */
type Options={load:(ids:string[],signal:AbortSignal)=>Promise<any[]>;visible:()=>boolean;schedule?:(fn:()=>void,ms:number)=>any;cancel?:(timer:any)=>void};
type Listener=(item:any,error:string)=>void;
export function createCompletionFeed({load,visible,schedule=setTimeout,cancel=clearTimeout}:Options){
 const entries=new Map<string,{item:any;listeners:Set<Listener>}>();let timer:any=null,controller:AbortController|null=null,stopped=false,generation=0,failures=0;
 const notify=(entry:{item:any;listeners:Set<Listener>},error='')=>entry.listeners.forEach(listener=>listener(entry.item,error));
 function plan(ms:number){if(timer!==null)cancel(timer);timer=null;if(!stopped&&entries.size&&visible())timer=schedule(()=>{timer=null;void tick();},ms);}
 async function tick(){
  if(stopped||controller||!entries.size||!visible())return;
  const active=new AbortController();controller=active;const ticket=generation;
  try{
   const ids=[...entries.keys()];
   for(let start=0;start<ids.length;start+=100){
    const batch=ids.slice(start,start+100),items=await load(batch,active.signal);
    if(stopped||ticket!==generation||active.signal.aborted)return;
    if(!Array.isArray(items))throw new Error('Incomplete status response');
    const requested=new Set(batch);for(const item of items){const id=String(item?._id||'');if(!requested.has(id))continue;const entry=entries.get(id);if(entry){const changed=JSON.stringify(entry.item)!==JSON.stringify(item);entry.item=item;if(changed||failures)notify(entry);}}
   }
   failures=0;
  }catch(error:any){if(!stopped&&ticket===generation&&!active.signal.aborted){failures++;entries.forEach(entry=>notify(entry,'Status update delayed. Retrying automatically.'));}}
  finally{if(controller===active)controller=null;if(!stopped&&ticket===generation){const pending=[...entries.values()].some(entry=>entry.item?.status==='pending');plan(failures?Math.min(30000,3000*2**Math.min(failures,4)):pending?3000:15000);}}
 }
 return {
  subscribe(id:string,item:any,listener:Listener){let entry=entries.get(id);if(!entry){entry={item,listeners:new Set()};entries.set(id,entry);}entry.listeners.add(listener);listener(entry.item,'');if(!controller&&timer===null)plan(0);return()=>{const current=entries.get(id);current?.listeners.delete(listener);if(current&&!current.listeners.size)entries.delete(id);if(!entries.size){generation++;controller?.abort();controller=null;if(timer!==null)cancel(timer);timer=null;}};},
  wake(){if(!visible()){if(timer!==null)cancel(timer);timer=null;return;}if(!controller)plan(0);},
  dispose(){stopped=true;generation++;controller?.abort();controller=null;if(timer!==null)cancel(timer);timer=null;entries.clear();},
  tick,
  get size(){return entries.size;}
 };
}
