# Singh Academy — isi PAYMENTS-P1 project ka updated source

**Patch:** PAYMENTS-P1-EYE-LOADING-REVIEW-1. Package version ab bhi 60.15.3 hai.
Yeh naya/scaffold project nahi; aapki attached complete P1 ZIP ka updated copy hai.

**Abhi status:** eye update aur local source tests complete hain. Is environment
mein dependency download blocked tha, is liye fresh Next production build/full
Next browser run verify nahi hua. Loading fixed ya client-handover ready nahi kaha
ja raha. Pehle neeche ke local gates pass karein.

## 1. Local candidate kholein

ZIP ko alag folder mein extract karein, old working project backup rakhein. Existing
repo/history ko replace/delete na karein. Apni private backend/frontend environment
files locally corresponding locations mein rakhein; values kisi chat/report mein
share na karein. Existing AUTH_SECRET, database name, live IDs aur approved config
preserve karein. Old node_modules, .next, generated reports ya old source new folder
mein copy na karein. Dono supplied package-lock.json files isi ZIP se use karein.

Is patch ke liye setup/seed/reset/migration/admin recovery command zaroori nahi.
Node ka existing supported 22.x/24.x version retain karein; dependencies upgrade,
lockfile regeneration ya `npm audit fix --force` na karein.

## 2. Commands — extracted project root, ek ek karke

```powershell
npm --prefix backend ci
npm --prefix frontend ci
node scripts/verify-payment-scope.mjs
npm --prefix backend test
npm run test:reliability
npm run test:runtime
npm --prefix frontend run typecheck
npm --prefix frontend run build
```

Har command ka exit code zero hona chahiye. Current expected test counts:
backend 1085; frontend reliability 561; runtime/tooling 165. Payment-only 50 tests
backend total mein included hain. Counts akelay proof nahi; fail/skip logs bhi dekhein.
Yahan source tests system TypeScript 5.8.3 par chale; `npm ci` ke baad aapki local
run exact lockfile TypeScript 5.9.3 ko exercise karegi.

Browser dependency aur full existing suite (16 naye password cases included):

```powershell
cd frontend
npx --no-install playwright install chromium
cd ..
npm run test:ui
```

Sirf naye actual Next eye cases dobara chalane ke liye:

```powershell
npm --prefix frontend run test:ui -- p1-password-eye.spec.ts
```

Yeh existing isolated synthetic UI stack hai; real database/provider transactions
ka proof nahi. Existing release/integration/security gates ko separately same
reviewed candidate par run karein. Incomplete ya historical QA ko PASS na samjhein.

## 3. Loading ko alag measure karein — real local backend ke saath

Terminal 1, project root:

```powershell
npm run dev:backend
```

Terminal 2, project root:

```powershell
npm run dev:frontend
```

Terminal 3, project root:

```powershell
node scripts/measure-loading.mjs --mode development
```

Report `qa/loading-development.json` mein anonymous first/repeat document, direct
backend aur /api proxy timings aayengi. Next terminal ki `Compiling` / `Compiled`
duration separately note karein. First observed request necessarily cold nahi hoti;
fresh dev server aur repeat requests ko distinguish karein.

Production comparison: dev frontend ko Ctrl+C se normally stop karein. Backend
running rehne dein. Same frontend par dev/build ek saath na chalayein.

```powershell
npm --prefix frontend run build
```

Build PASS ke baad local-only frontend terminal:

```powershell
$env:API_PROXY_ALLOW_LOCAL_TEST_ONLY="true"
npm run start:frontend
```

Yeh existing switch sirf local HTTP loopback frontend-to-backend comparison ke liye
hai; Hostinger environment mein isay add na karein. Existing API_PROXY_TARGET local
backend origin aur NEXT_PUBLIC_API_URL=/api retain karein. TLS/cookie/auth policy
ko production mein relax na karein. Terminal close karne ya server stop karne ke
baad local process variable hata dein:

```powershell
Remove-Item Env:API_PROXY_ALLOW_LOCAL_TEST_ONLY -ErrorAction SilentlyContinue
```

Production frontend chal raha ho to doosre terminal mein:

```powershell
node scripts/measure-loading.mjs --mode production
```

Compare `qa/loading-development.json` and `qa/loading-production.json`. Reports
sirf anonymous GET requests measure karte hain; logged-in session, real MongoDB
lookup, initial JS hydration ya signed-in page completion ka proof nahi.

Signed-in issue ke liye apne browser mein existing student/Client Admin/Super Admin
session par F12 > Network dekhein: Document Waiting/TTFB, session API (jab browser
request ho), aur slow endpoint ka pathname/status/time note karein. Server middleware
session lookup document TTFB mein included hota hai. Full HAR/cookies, request bodies,
passwords aur authorization headers share na karein. Real slowdown ka cause conclude
karne se pehle frontend compile output aur matching backend timings compare karein.

## 4. Manual deployment — sirf local gates pass hone ke baad

Existing repo mein reviewed candidate changes manually apply/review karein, old
healthy commit aur secure environment backup rakhein. GitHub/Hostinger par is chat
se koi write, push ya deploy nahi hua. Private .env, node_modules, .next, local QA
outputs ya credentials commit/upload na karein.

Existing Hostinger app roots, Node version, build/start commands aur environment
retain karke candidate deploy karein. Frontend rebuild zaroori hai: password component
frontend source mein badla hai. Backend code exactly supplied P1 wala hai; already
P1 backend deployed ho to backend source ka naya change nahi. Backend agar purana
ho to matching preserved P1 code ki deployment/acceptance bhi required hai.

Existing public/backend origins ko change na karein. Backend `/api/health/ready`
200 with ready:true aur frontend same-origin `/api` routing verify karein. Student,
Client Admin, Super Admin login/logout and eye buttons, signup/reset confirmation
independence, no accidental form POST, refresh/back and account separation verify
karein. Temporary errors ko hidden login success/access mein convert na karein.

## 5. Payment acceptance — existing LIVE webhook preserve

Aapke reported LIVE configuration checks aur missing PayPal event ka read-back
complete hain. **Webhook ID na badlein, naya webhook na banayein, completed event
repair dobara na chalayein.** Is eye patch ke liye `payments:live` wizard dobara
run karna required nahi. Existing credentials, event list aur payment switch ki
approved state unchanged rakhein; `PAYMENTS-START-HERE.md` ki old repair sequence
ko nayi instruction na samjhein.

Client-authorized deployed payment, authentic signed webhook delivery, correct
student access aur exactly one invoice/payment receipt abhi baqi hain. Sandbox
acceptance separate sandbox config/database par ho; LIVE mein fake success events
ya test cards use na karein. Actual LIVE purchase sirf merchant/client permission
se ho aur real money charge hota hai. Uncertain payment ko dobara pay na karein:
existing order/provider outcome inspect karein. Failure par new sales ko operator
pause kare, known-good matching code/config rollback kare, existing payment/order
records ya webhook history delete na kare.

Final handover tab ho jab fresh build/browser gates aur actual deployed acceptance
complete ho. Details: TEST-RESULTS-P1-EYE-LOADING.md.
