import {proxyApi} from './apiProxy.mjs';
import {publicSiteOrigin} from '../siteMetadata';
import {websiteConfig} from '../websiteConfig';
const summaryFields={
 '/content/landing':['sections','team','reviews'],
 '/video-reviews':['items'],
 '/page-sections/landing':['blocks']
} as const;
type PublicSummaryPath=keyof typeof summaryFields;
type PrefetchOptions={env?:Record<string,string|undefined>;fetcher?:typeof fetch};
const reservedEdgeHeaders=new Set(['accept','content-type','cookie','authorization','proxy-authorization','origin','referer','sec-fetch-site','x-sa-portal','x-sa-csrf','idempotency-key','range','if-range','if-none-match','if-modified-since','stripe-signature','paypal-auth-algo','paypal-cert-url','paypal-transmission-id','paypal-transmission-sig','paypal-transmission-time','x-sa-network','x-sa-network-signature']);
/** Only already-public display settings are bootstrapped. No session, price,
 * enrollment or account response enters a shared server/browser cache. */
async function readPublicContent(path:string,incoming:Headers,{env=process.env,fetcher=fetch}:PrefetchOptions={}){
 if(path!=='/content/site'&&!Object.prototype.hasOwnProperty.call(summaryFields,path))return null;
 const origin=publicSiteOrigin(env.PUBLIC_SITE_URL)||((env.NODE_ENV==='development'||env.API_PROXY_ALLOW_LOCAL_TEST_ONLY==='true')?'http://localhost:3000':undefined);
 if(!origin)return null;
 try{
  const headers=new Headers({'Accept':'application/json','X-SA-Portal':'student'});
  // Preserve the existing verified network proof without copying cookies,
  // authorization or a client-supplied proxy attestation into this public read.
  const edgeHeader=env.SA_PROXY_CLIENT_IP_HEADER;
  if(edgeHeader&&reservedEdgeHeaders.has(edgeHeader.toLowerCase()))return null;
  if(edgeHeader&&/^[-a-z0-9]+$/i.test(edgeHeader)){
   const ip=incoming.get(edgeHeader);if(ip)headers.set(edgeHeader,ip);
  }
  const response=await proxyApi(new Request(origin+'/api'+path,{headers,signal:AbortSignal.timeout(800)}),{env,fetcher});
  if(!response.ok)return null;
  const value=await response.json();
  return value?.success===true?value:null;
 }catch{return null;}
}
export async function prefetchWebsiteContent(incoming:Headers,options:PrefetchOptions={}){
 const value=await readPublicContent('/content/site',incoming,options);
 if(!value?.content||typeof value.content!=='object'||Array.isArray(value.content))return null;
 return websiteConfig(value.content.websiteContent);
}
/** Fixed anonymous public summaries only. The response is request-local and
 * excludes unused metadata; the existing client cache still owns refreshes. */
export async function prefetchPublicContent(path:PublicSummaryPath,incoming:Headers,options:PrefetchOptions={}):Promise<Record<string,any[]>|null>{
 if(!Object.prototype.hasOwnProperty.call(summaryFields,path))return null;
 const value=await readPublicContent(path,incoming,options),fields=summaryFields[path];
 if(!value||fields.some(field=>!Array.isArray(value[field])))return null;
 return Object.fromEntries(fields.map(field=>[field,value[field]]));
}
/** Keep async public reads above page loading boundaries. Only the overwritten
 * middleware pathname selects this fixed public bundle; no private URL is used. */
export async function prefetchPublicPageContent(page:string|null,incoming:Headers,options:PrefetchOptions={}):Promise<Record<string,Record<string,any[]>>>{
 const paths:PublicSummaryPath[]=page==='/'?['/content/landing','/video-reviews','/page-sections/landing']:page==='/video-reviews'?['/video-reviews']:[];
 const items=await Promise.all(paths.map(async path=>({path,value:await prefetchPublicContent(path,incoming,options)})));
 return Object.fromEntries(items.flatMap(({path,value})=>value?[[path,value]]:[]));
}
