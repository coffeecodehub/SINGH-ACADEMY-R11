export type FeedbackVariant='success'|'error'|'warning'|'info'|'confirm';
export type FeedbackOptions={title?:string;message:string;variant?:FeedbackVariant;confirmLabel?:string;cancelLabel?:string;signal?:AbortSignal};
export type FeedbackPromptOptions=FeedbackOptions&{inputLabel?:string;defaultValue?:string;placeholder?:string;required?:boolean;maxLength?:number};
export type FeedbackRequest={id:number;scope:string;kind:'alert'|'confirm'|'prompt';options:FeedbackPromptOptions};
type Pending=FeedbackRequest&{finish:(value:boolean|string|null)=>void;detach:()=>void};

/** A queue of user decisions, never business actions. Cancellation always fails closed. */
export function createFeedbackController(){
 let sequence=0,scope='',renderedScope='',connected=false;
 const listeners=new Set<()=>void>(),queue:Pending[]=[];
 const emit=()=>listeners.forEach(listener=>listener());
 function cancelAll(){const pending=queue.splice(0);for(const item of pending){item.detach();item.finish(item.kind==='confirm'?false:null);}emit();}
 function request(kind:FeedbackRequest['kind'],options:FeedbackPromptOptions):Promise<boolean|string|null>{
  if(!connected||scope!==renderedScope||options.signal?.aborted)return Promise.resolve(kind==='confirm'?false:null);
  // A repeated click on the same decision cannot authorize a second mutation.
  if(queue.some(item=>item.kind===kind&&item.options.title===options.title&&item.options.message===options.message))return Promise.resolve(kind==='confirm'?false:null);
  return new Promise(resolve=>{
   const item:Pending={id:++sequence,scope,kind,options,finish:resolve,detach:()=>{}};
   const abort=()=>{const index=queue.indexOf(item);if(index<0)return;queue.splice(index,1);item.detach();resolve(kind==='confirm'?false:null);emit();};
   if(options.signal){options.signal.addEventListener('abort',abort,{once:true});item.detach=()=>options.signal?.removeEventListener('abort',abort);}
   queue.push(item);emit();
  });
 }
 return {
  subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};},
  getSnapshot:():FeedbackRequest|null=>queue[0]||null,
  markScope(nextScope:string){renderedScope=nextScope;},
  connect(nextScope:string){if(connected&&scope!==nextScope)cancelAll();scope=nextScope;renderedScope=nextScope;connected=true;return()=>{connected=false;cancelAll();};},
  cancelAll,
  resolve(id:number,value:boolean|string|null){const item=queue[0];if(!item||item.id!==id)return;queue.shift();item.detach();item.finish(item.scope===renderedScope?value:item.kind==='confirm'?false:null);emit();},
  confirm:(options:FeedbackOptions)=>request('confirm',options).then(value=>value===true),
  prompt:(options:FeedbackPromptOptions)=>request('prompt',options).then(value=>typeof value==='string'?value:null),
  alert:(options:FeedbackOptions)=>request('alert',options).then(()=>{}),
 };
}
export const feedback=createFeedbackController();
