# Pehle yeh parhein — V60.15.3

Is version mein sirf upload scanner ka HTTPS option add hua hai. Website ka approved
UI, payments, courses, login aur certificates redesign nahi kiye.

**ZIP install karna akela kaafi nahi:** Cloudmersive account ki real API key chahiye.
Koi account ya subscription aapki taraf se purchase nahi ki gayi.

## Seedha order

1. New ZIP fresh folder mein extract karo. Working private .env aur dono tested
   package-lock.json files matching locations par copy karo. Old source/.next/
   node_modules copy mat karo. Node/Docker reinstall ya database reset nahi.
2. Cloudmersive portal par client-owned account aur Virus Scan API key hasil karo.
   Free evaluation sirf 3.5 MB/file aur 600 calls/month hai. Bari files ke liye
   actual munasib plan chahiye. Private files ke external scan par client approval lo.
3. Private backend/.env mein scanner variables UPLOADS-SETUP-V60.15.3.md se set karo.
   API key chat/GitHub/frontend mein mat bhejo.
4. Project root: npm run verify:release
5. Explicit scanner check: npm run scan:check -- --remote --test-rejection
   Yeh do synthetic probe files send karta hai; private student data nahi.
6. Docker Engine running rakho: npm run verify:integration
7. Fresh reports aur GitHub Node 22/24 green hon, phir same tested source deploy karo.
8. Hostinger BACKEND mein bhi real scanner variables set karo. Build None, entry
   src/server.js, existing Node22. Frontend connection/env ko change mat karo.
9. Hosted website par choti course-cover image upload karke HTTP 201, course save,
   phir Team/PDF/student private upload workflows test karo. PC ka scanner PASS
   Hostinger network ka proof nahi hota.

UPLOADING ON tab karo jab new backend + real key + sufficient plan ready hon.
Scanner timeout/quota/auth failure par file reject hogi, security bypass nahi hogi.

Full exact settings: UPLOADS-SETUP-V60.15.3.md
Commands: LOCAL-GUIDE-V60.15.3.md
Actual executed tests aur limitations: QA-REPORT-V60.15.3.md
