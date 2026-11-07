import type {NextConfig} from 'next';

// Browser requests must remain same-origin; provider/database secrets belong only to the backend.
if(process.env.NODE_ENV==='production'&&process.env.NEXT_PUBLIC_API_URL&&process.env.NEXT_PUBLIC_API_URL!=='/api')throw new Error('Set NEXT_PUBLIC_API_URL=/api and API_PROXY_TARGET to the HTTPS backend origin. Do not put localhost or the backend domain in NEXT_PUBLIC_API_URL.');
const nextConfig:NextConfig={
 // Fixed test-only build location; no arbitrary filesystem path from env.
 distDir:process.env.SA_UI_FIXTURE_BUILD==='true'?'.next-ui-tests':'.next',
 typescript:process.env.SA_UI_FIXTURE_BUILD==='true'?{tsconfigPath:'tsconfig.ui.json'}:{},
 // UI fixtures use next start; deployed builds keep the standalone artifact.
 output:process.env.SA_UI_FIXTURE_BUILD==='true'?undefined:'standalone',poweredByHeader:false,compress:true,reactStrictMode:true,
 // Preserve the exact incoming origin for cookie-bound document redirects.
 // Next 15's middleware URL normalizer rewrites loopback IPs to localhost,
 // splitting host-only cookies when the browser actually opened 127.0.0.1.
 // Keep this enabled in both dev and production; auth still validates every
 // protected page and all return destinations are application-relative paths.
 skipMiddlewareUrlNormalize:true,
 devIndicators:false,productionBrowserSourceMaps:false,
 // Images are served by the local responsive-image component. No remote fetch proxy is needed.
 images:{unoptimized:true},
 // /api is handled by the streaming Route Handler; the upstream origin is read at runtime.
 async headers(){return [
  {source:'/:path*',headers:[
   {key:'X-Content-Type-Options',value:'nosniff'},
   {key:'X-Frame-Options',value:'DENY'},
   {key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},
   {key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=()'}
  ]},
  {source:'/optimized/:path*',headers:[{key:'Cache-Control',value:'public, max-age=31536000, immutable'}]}
 ];}
};
export default nextConfig;
