/** Only stale code-chunk failures may auto-reload. Never replays a payment request. */
export function recoverableChunkError(error:{name?:string;message?:string}){
 return error?.name==='ChunkLoadError'||/Loading chunk [\w-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed/i.test(error?.message||'');
}
export function allowChunkReload(storage:Pick<Storage,'getItem'|'setItem'>,key:string,now=Date.now()){
 try{const last=Number(storage.getItem(key)||0);if(last&&now-last<600000)return false;storage.setItem(key,String(now));return true;}catch{return false;}
}
