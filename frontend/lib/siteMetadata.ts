/** Set the reviewed public origin in production; never invent a canonical host. */
export function publicSiteOrigin(value=process.env.PUBLIC_SITE_URL):string|undefined {
  if(!value)return undefined;
  try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash)return undefined;return u.origin;}catch{return undefined;}
}
export const SITE_TITLE='Singh Academy | Negotiation, Mediation & Cross-Cultural Learning';
export const SITE_DESCRIPTION='Learn negotiation, mediation, leadership and cross-cultural dispute resolution with Dr. Sukhsimranjit Singh and Singh Academy.';
