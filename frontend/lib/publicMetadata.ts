import {publicSiteOrigin} from './siteMetadata';
// Ordinary route handlers avoid Next's metadata loader embedding Windows paths
// containing an apostrophe into generated JavaScript string literals.
const privatePaths=['/api/','/admin','/super-admin','/checkout','/billing','/learn/','/login','/register','/reset-password','/forgot-password','/verify-otp','/connection','/certificates/'];
export function robotsText(origin=publicSiteOrigin()):string {
 return ['User-agent: *','Allow: /',...privatePaths.map(path=>'Disallow: '+path),...(origin?['Sitemap: '+origin+'/sitemap.xml']:[]),''].join('\n');
}
const xml=(value:string)=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
export function sitemapXml(origin=publicSiteOrigin()):string {
 const entries=origin?['/','/video-reviews','/terms','/privacy'].map(path=>`<url><loc>${xml(origin+path)}</loc><changefreq>${path==='/'||path==='/video-reviews'?'weekly':'yearly'}</changefreq><priority>${path==='/'?'1':'0.3'}</priority></url>`).join(''):'';
 return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</urlset>`;
}
