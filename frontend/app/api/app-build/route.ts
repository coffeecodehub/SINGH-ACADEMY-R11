import metadata from '../../../package.json';
export const runtime='nodejs';
export const dynamic='force-dynamic';
/** Public release metadata only. No environment values, credentials or account data. */
export function GET(){return Response.json({success:true,frontendVersion:metadata.version,pageAccess:'public-landing-protected-pages-v6010'},{headers:{'Cache-Control':'private, no-store','CDN-Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
