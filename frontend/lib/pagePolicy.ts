/** The landing page is public. Destination pages require a real session.
 * Auth, reconnect, legal consent and certificate verification are explicit exceptions. */
export function pagePortal(path:string):'student'|'client_admin'|'super_admin'{return /^\/super-admin(?:\/|$)/.test(path)?'super_admin':/^\/admin(?:\/|$)/.test(path)?'client_admin':'student';}
export function publicPage(path:string){return ['/','/video-reviews','/robots.txt','/sitemap.xml','/connection','/login','/register','/forgot-password','/reset-password','/verify-otp','/admin/login','/super-admin/login','/terms','/privacy'].includes(path.replace(/\/$/,'')||'/')||/^\/certificates\/verify\/[a-f0-9]{48}\/?$/.test(path);}
export function loginDestination(path:string,search=''){const portal=pagePortal(path),login=portal==='student'?'/login':portal==='client_admin'?'/admin/login':'/super-admin/login';return login+'?next='+encodeURIComponent(path+search);}
