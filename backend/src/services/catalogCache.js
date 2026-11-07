/** Only published CMS content belongs here. NEVER cache sessions, subscriptions,
 * learning, invoices, submissions or certificate status in this shared cache. */
export function createContentCache({limit=128,maxBytes=32*1024*1024,clock=Date.now}={}){
 const values=new Map(),pending=new Map();let generation=0,bytes=0;
 const remove=key=>{const old=values.get(key);if(old)bytes-=old.bytes;values.delete(key);};
 return {
  async get(key,load,ttl=10000,{cacheNull=true}={}){
   const found=values.get(key);if(found&&found.until>clock())return found.value;
   if(found)remove(key);if(pending.has(key))return pending.get(key);
   const ticket=generation;
   const promise=Promise.resolve().then(load).then(value=>{
    const size=Buffer.isBuffer(value)?value.length:Buffer.byteLength(JSON.stringify(value)??'');
    if(ticket===generation&&size<=maxBytes&&(cacheNull||value!==null)){remove(key);while(values.size>=limit||bytes+size>maxBytes)remove(values.keys().next().value);values.set(key,{value,bytes:size,until:clock()+ttl});bytes+=size;}
    return value;
   });
   pending.set(key,promise);try{return await promise;}finally{if(pending.get(key)===promise)pending.delete(key);}
  },
  clear(){generation++;values.clear();pending.clear();bytes=0;},
  stats(){return {entries:values.size,inFlight:pending.size,bytes};}
 };
}
export const catalogCache=createContentCache();
