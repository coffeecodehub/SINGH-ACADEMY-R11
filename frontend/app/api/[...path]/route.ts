import {proxyApi} from '../../../lib/server/apiProxy.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const revalidate=0;
const handler=(request:Request)=>proxyApi(request);
export {handler as GET,handler as HEAD,handler as POST,handler as PUT,handler as PATCH,handler as DELETE,handler as OPTIONS};
