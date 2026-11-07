import {NextRequest,NextResponse} from 'next/server';
import {pageSession,SNAPSHOT_HEADER} from './lib/server/pageSession';
/** Fresh document nonces. HTML is never shared-cached; immutable images/JS are cached separately. */
export async function middleware(request:NextRequest){
 const nonce=btoa(crypto.randomUUID()),dev=process.env.NODE_ENV!=='production';
 let apiOrigin='';
 try{apiOrigin=new URL(process.env.NEXT_PUBLIC_API_URL||'').origin;}catch{}
 if(apiOrigin==='null')apiOrigin='';
 // Next's development chunk loader can emit same-origin scripts without the
 // document nonce. strict-dynamic ignores 'self' and blocks those lazy chunks.
 // Keep nonce-only script trust in production; dev also needs eval for HMR.
 const scriptSource=dev?`'self' 'nonce-${nonce}' 'unsafe-eval'`:`'self' 'nonce-${nonce}' 'strict-dynamic'`;
 const csp=["default-src 'self'",`script-src ${scriptSource}`,
  "style-src 'self' 'unsafe-inline'", // Existing responsive components use inline styles.
  `img-src 'self' data: blob: https: ${dev?'http://localhost:5000':''}`,"font-src 'self' data:",
  `connect-src 'self' ${apiOrigin} ${dev?'http://localhost:5000 ws: wss:':''}`,
  `media-src 'self' blob: https: ${dev?'http://localhost:5000':''}`,
  `frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com https://www.tiktok.com https://www.instagram.com https://embed.ted.com https://www.dailymotion.com https://www.loom.com https://www.facebook.com https://streamable.com https://fast.wistia.net https://play.vidyard.com https://player.twitch.tv https://clips.twitch.tv ${dev?'http://localhost:5000':''}`,
  "object-src 'none'","base-uri 'self'","form-action 'self'","frame-ancestors 'none'",
  ...(!dev?['upgrade-insecure-requests']:[])
 ].join('; ');
 const headers=new Headers(request.headers);headers.set('x-nonce',nonce);headers.set('Content-Security-Policy',csp);
 headers.set('x-sa-public-content-page',new URL(request.url).pathname);
 // Never trust an incoming bootstrap header from a browser or upstream proxy.
 headers.delete(SNAPSHOT_HEADER);
 const access=await pageSession(request);
 if(access.redirect){const response=NextResponse.redirect(new URL(access.redirect,request.url));response.headers.set('Cache-Control','private, no-store');return response;}
 if(access.unavailable){
  const destination=new URL('/connection',request.url);
  destination.searchParams.set('next',new URL(request.url).pathname+new URL(request.url).search);
  const response=NextResponse.redirect(destination);
  response.headers.set('Cache-Control','private, no-store');return response;
 }
 if(access.session)headers.set(SNAPSHOT_HEADER,encodeURIComponent(JSON.stringify(access.session)));
 const response=NextResponse.next({request:{headers}});
 response.headers.set('Content-Security-Policy',csp);response.headers.set('Cache-Control','private, no-store');
 if(!['/','/video-reviews','/terms','/privacy','/robots.txt','/sitemap.xml'].includes(new URL(request.url).pathname))response.headers.set('X-Robots-Tag','noindex, nofollow');
 if(!dev)response.headers.set('Strict-Transport-Security','max-age=31536000');
 return response;
}
export const config={runtime:'nodejs',matcher:['/((?!api(?:/|$)|_next/static|_next/image|images/|optimized/|favicon.ico|.*\\.(?:png|jpg|jpeg|webp|svg|ico|woff2)$).*)']};
