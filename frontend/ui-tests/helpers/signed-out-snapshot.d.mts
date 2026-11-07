/** Types for TEST-ONLY guest DOM observations; no authentication data included. */
export type SignedOutSnapshot = {
  href:string;
  readyState:DocumentReadyState;
  timeOrigin:number;
  totalHeaders:number;
  headers:Array<{ready:boolean;signInLinks:number}>;
  loginForms:Array<{emails:number;passwords:number;submitButtons:number}>;
  logoutButtons:number;
  userChips:number;
};
export type SignedOutObservationOptions = {origin:string;expectedPath?:'/'|'/login'|'either'};
export function readSignedOutSnapshot():SignedOutSnapshot;
export function signedOutSnapshotState(snapshot:SignedOutSnapshot,options:SignedOutObservationOptions):string;
export function createSignedOutStability(options:SignedOutObservationOptions):(
  snapshot:SignedOutSnapshot,
  navigation?:{pendingDocuments?:number;navigationEpoch?:number}
)=>string;
