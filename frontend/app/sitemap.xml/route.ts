import {sitemapXml} from '../../lib/publicMetadata';
export const dynamic='force-dynamic';
export function GET(){return new Response(sitemapXml(),{headers:{'Content-Type':'application/xml; charset=utf-8'}});}
