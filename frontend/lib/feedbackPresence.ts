export const FEEDBACK_EXIT_MS=180;
let currentPresentationScope:string|null=null;
export const markFeedbackPresentationScope=(scope:string)=>{currentPresentationScope=scope;};
export const feedbackPresentationScope=()=>currentPresentationScope;
export type FeedbackPresentation<T>={value:T|null;key:string;scope:string;leaving:boolean};
/** Retain presentation only. Decisions and business actions never wait for this state. */
export function reconcileFeedbackPresentation<T>(state:FeedbackPresentation<T>,value:T|null,key:string,scope:string):FeedbackPresentation<T>{
 if(state.scope!==scope)return {value,key,scope,leaving:false};
 if(!state.value)return state.value===value&&state.key===key&&!state.leaving?state:{value,key,scope,leaving:false};
 if(value&&state.key===key)return state.value===value&&!state.leaving?state:{value,key,scope,leaving:false};
 return state.leaving?state:{...state,leaving:true};
}
export function canAnimateFeedbackExit(){
 return typeof window!=='undefined'&&!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches&&typeof CSS!=='undefined'&&CSS.supports('transition-behavior','allow-discrete')&&CSS.supports('overlay','auto');
}
