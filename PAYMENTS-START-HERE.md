# Singh Academy — PAYMENT PATCH P1

## Abhi sirf yeh karein

ZIP ko **naye folder** mein extract karein. Purana working project overwrite na karein.
VS Code mein woh folder open karein jahan `package.json`, `backend` aur `frontend` hain.
Terminal mein **sirf yeh command** chalayein:

```powershell
npm run payments:live
```

Node.js 22 ya 24 chahiye. Backend dependencies missing hon to command existing lockfile se install karegi; internet chahiye. App/server start nahi hota.

Command pehle UI hashes aur 50 payment regression tests check karegi, phir yeh **6 LIVE values** ek ek karke poochegi:

1. `STRIPE_SECRET_KEY`
2. `STRIPE_WEBHOOK_SECRET`
3. `PAYPAL_CLIENT_ID`
4. `PAYPAL_CLIENT_SECRET`
5. `PAYPAL_WEBHOOK_ID`
6. `PAYPAL_MERCHANT_ID`

Har value paste karke Enter dabayein. Typing/pasting screen par nazar nahi aayegi. Hostinger mein saved wohi LIVE values use karein. Command aapki `.env` nahi padhti ya badalti; credentials command-line arguments ya report mein save nahi hote.

## PayPal event missing ho to

Command official PayPal API se existing webhook aur event catalog check karegi. Sirf missing subscriptions ka issue ho to optional confirmation aayegi:

```text
ADD PAYPAL EVENTS
```

Yeh exact text tab type karein jab **existing PayPal webhook ki event list update** karne ki ijazat deni ho. Enter blank karein to koi subscription update nahi hogi. Webhook URL/ID aur existing events preserve kiye jaate hain; koi payment/capture/refund create nahi hota.

Agar event API catalog mein bhi absent ho, tool is baat ko dikhayega. Aapki explicit permission par documented missing event ki ek subscription request bhej sakta hai. PayPal accept bhi kar sakta hai aur reject bhi. Saved subscription dobara read karke match hone tak PASS nahi diya jaata. Koi unavailable event chupke se required list se remove nahi hota.

## Result

Sanitized result: `qa/payment-live-readiness.json`. Sirf yeh report share karein; secret keys nahi.

- **FAIL:** Hostinger `ONLINE_PAYMENTS_ENABLED=false` rakhein. Report batayegi kaunsa provider/URL/event fail hua.
- **CONFIGURATION CHECK PASSED:** API authentication aur registered webhook configuration checked. Yeh deployed secret matching, actual signed webhook, payment receipt ya course access ka end-to-end proof nahi.

**Command Hostinger checkout ON nahi karti. SSH, DNS/CDN changes, `.env` editing aur GitHub push is check ke liye nahi chahiye.**

## Iske baad deployment / acceptance

Payment checks pass hone ke baad payment-only backend patch ko separate branch/candidate par deploy aur sandbox acceptance karein. Current healthy commit + secure environment backup rollback ke liye rakhein. `PAYMENTS-P1-AUDIT.md` mein exact changed files aur deployment steps hain.

Production approval ke baad backend enablement aur client-authorized genuine purchase, signed webhook, one invoice/receipt, course/membership access aur cancellation behavior verify karein. Test cards LIVE mode mein use na karein. Uncertain payment ko dobara pay na karein.
