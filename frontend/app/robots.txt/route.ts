import {robotsText} from '../../lib/publicMetadata';
export const dynamic='force-dynamic';
export function GET(){return new Response(robotsText(),{headers:{'Content-Type':'text/plain; charset=utf-8'}});}
