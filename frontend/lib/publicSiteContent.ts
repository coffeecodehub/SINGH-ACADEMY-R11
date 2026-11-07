import {apiFetch,invalidatePublicApi,publicApiSnapshot} from './api';
export type PublicSiteContent={membershipPlans?:any[];footerSocial?:Record<string,string>;websiteContent?:any;};
/** Uses the same account-bound catalog cache; never a second global settings cache. */
export async function getPublicSiteContent(force=false):Promise<PublicSiteContent>{if(force)invalidatePublicApi();const d=await apiFetch('/content/site');if(!d.content||typeof d.content!=='object'||Array.isArray(d.content))throw new Error('The Academy settings response was incomplete. Please retry.');return d.content;}
export function siteContentSnapshot():PublicSiteContent|null{return publicApiSnapshot('/content/site')?.content||null;}
export function invalidatePublicSiteContent(){invalidatePublicApi();}
