/** A script-free terminal document for retired resource URLs only.
 * Mirrors the existing app/not-found.tsx copy and its approved status styles.
 * Never interpolate URL, query, cookie or account data into this document.
 * Native Response is deliberate: notFound() below a streamed layout can retain
 * HTTP 200 even while displaying the not-found UI. GET and HEAD agree on 404.
 */
const document = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Page not found | Singh Academy</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#f7f5f0;color:#1a1917;font-family:Arial,Helvetica,sans-serif}
.button{display:inline-block;background:#9b663d;color:white;text-decoration:none;padding:16px 22px;border-radius:10px;font-weight:700;cursor:pointer}
a{touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.siteStatus{min-height:70vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px;text-align:center;gap:16px}
.siteStatus h1{font-size:clamp(24px,4vw,38px);margin:0}
.siteStatus p{max-width:560px;line-height:1.7;color:#58675f}
</style></head><body>
<main class="siteStatus"><p>404</p><h1>Page not found</h1><p>This address may have changed. Your academy is still here.</p><a class="button" href="/">Return to Singh Academy</a></main>
</body></html>`;

export function retiredNotFoundResponse(head = false): Response {
  return new Response(head ? null : document, {
    status: 404,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    },
  });
}
