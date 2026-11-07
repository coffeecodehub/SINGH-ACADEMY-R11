/** Bounded thumbnail work. Overloaded/timed-out queued jobs fall back to the
 * authorized original; they are never cached as broken/empty photos. */
export function createImageWorkQueue({parallel=2,maxQueued=12,waitMs=2000}={}){
 let active=0;const waiting=[];
 const start=job=>{
  if(job.timer)clearTimeout(job.timer);active++;
  Promise.resolve().then(job.work).then(job.resolve,job.reject).finally(()=>{
   active--;const next=waiting.shift();if(next)start(next);
  });
 };
 return {
  run(work){return new Promise((resolve,reject)=>{
   const job={work,resolve,reject,timer:null};
   if(active<parallel){start(job);return;}
   if(waiting.length>=maxQueued){resolve(null);return;}
   job.timer=setTimeout(()=>{const index=waiting.indexOf(job);if(index>=0){waiting.splice(index,1);resolve(null);}},waitMs);
   waiting.push(job);
  });},
  stats:()=>({active,queued:waiting.length})
 };
}
