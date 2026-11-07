'use client';
import {createContext,useContext,useEffect,useState,useMemo,useSyncExternalStore,type ReactNode} from 'react';
import {useAuth} from './auth/AuthProvider';
import {getPublicSiteContent,siteContentSnapshot} from '../lib/publicSiteContent';
import {invalidatePublicApi,publicApiScope,subscribePublicApi} from '../lib/api';
import {websiteConfig} from '../lib/websiteConfig';
import {useHydrated} from '../lib/useHydrated';
export type WebsiteConfig={text:Record<string,string>;images:{key:string;src:string;url:string;fileId?:string|null;position?:string;imageFit?:'cover'|'contain';originalUrl?:string;originalFileId?:string|null;imageEdit?:any}[]};
const empty:WebsiteConfig={text:{},images:[]};
const Context=createContext<WebsiteConfig>(empty);
const InitialContext=createContext<WebsiteConfig>(empty);
const serverSnapshot=()=>null;
/** No visible wrapper. Empty configuration is the exact retained public copy and original imagery. */
export function WebsiteContentProvider({children,initialConfig=empty}:{children:ReactNode;initialConfig?:WebsiteConfig}){const{user,ready}=useAuth();
 const[initial]=useState(initialConfig);
 const cached=useSyncExternalStore(subscribePublicApi,siteContentSnapshot,serverSnapshot),scope=publicApiScope('/content/site');
 const[value,setValue]=useState<{scope:string;config:WebsiteConfig}>({scope,config:initial});
 const config=useMemo(()=>cached?websiteConfig(cached.websiteContent):value.scope===scope?value.config:empty,[cached,value,scope]);
 useEffect(()=>{let active=true;const refresh=()=>getPublicSiteContent().then(content=>{if(active)setValue({scope,config:websiteConfig(content.websiteContent)})}).catch(()=>{});refresh();const changed=(event:Event)=>{invalidatePublicApi(event);refresh();};const focus=()=>{if(document.visibilityState==='visible')refresh();};window.addEventListener('sa-website-content',changed);window.addEventListener('focus',focus);return()=>{active=false;window.removeEventListener('sa-website-content',changed);window.removeEventListener('focus',focus);};},[ready,user?.id,scope]);return <Context.Provider value={config}><InitialContext.Provider value={initial}>{children}</InitialContext.Provider></Context.Provider>;}
export function useWebsiteContent(){const value=useContext(Context),initial=useContext(InitialContext),hydrated=useHydrated();return hydrated?value:initial;}
export function websiteText(config:WebsiteConfig,key:string,fallback:string):string{return typeof config.text?.[key]==='string'?config.text[key]:fallback;}
