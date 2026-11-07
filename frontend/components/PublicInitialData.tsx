'use client';
import {createContext,useContext,useEffect,useRef,useState,useSyncExternalStore,type ReactNode} from 'react';
import {usePathname} from 'next/navigation';
import {publicApiScope,subscribePublicApi} from '../lib/api';
export type PublicInitialData=Record<string,Record<string,any[]>>;
const empty:PublicInitialData={},Context=createContext<PublicInitialData>(empty);
const documentScope=()=>publicApiScope('/content/site');
/** Late first mounts may use this document's public snapshot. Navigation,
 * account boundaries and CMS saves permanently retire it, including on Back. */
export function PublicInitialDataProvider({initialData,children}:{initialData:PublicInitialData;children:ReactNode}){
 const pathname=usePathname()||'/',scope=useSyncExternalStore(subscribePublicApi,documentScope,documentScope);
 const [initial]=useState(()=>({data:initialData,pathname,scope})),[invalidated,setInvalidated]=useState(false),departed=useRef(false);
 if(pathname!==initial.pathname||scope!==initial.scope)departed.current=true;
 useEffect(()=>{const changed=()=>setInvalidated(true);window.addEventListener('sa-website-content',changed);return()=>window.removeEventListener('sa-website-content',changed);},[]);
 return <Context.Provider value={!departed.current&&!invalidated?initial.data:empty}>{children}</Context.Provider>;
}
export function usePublicInitialArray(path:string,field:string):any[]|null{
 const value=useContext(Context)[path]?.[field];
 return Array.isArray(value)?value:null;
}
