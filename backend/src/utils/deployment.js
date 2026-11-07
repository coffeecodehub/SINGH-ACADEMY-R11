import {uploadScanConfiguration} from './uploadScanConfig.js';
import {usableProxySecret} from './proxyIdentity.js';
import {hostedEnvironment} from './deploymentMode.js';
import {gatewayConfiguration} from './commerce.js';
/** Pure deployment validation. Never print secret values. */
export function isPlaceholder(value) {
  return !value || /CHANGE[_ -]?ME|YOUR_|REPLACE[_ -]?WITH|GENERAT(?:E|ED)[_ -]?(?:BY|WITH)|example\.(?:com|org|net)/i.test(value);
}
export function envInteger(value, fallback, minimum, maximum) {
  if (value === undefined || value === '') return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) throw new Error('An environment numeric setting is outside its allowed range.');
  return number;
}
export function checkEnvironment(env = process.env) {
  const errors = [], warnings = [], production = hostedEnvironment(env), stage = env.DEPLOYMENT_STAGE || (production ? 'production' : 'development'), review = stage === 'review';
  if (!['development','review','production'].includes(stage)) errors.push('DEPLOYMENT_STAGE must be development, review, or production.');
  if (['review','production'].includes(stage)&&env.NODE_ENV!=='production') errors.push('Hosted review/production requires NODE_ENV=production. Do not use the development runtime on a public deployment.');
  if(env.NODE_ENV==='production'&&stage==='development')errors.push('NODE_ENV=production cannot use DEPLOYMENT_STAGE=development; select review for sandbox or production for live.');
  if(env.NODE_ENV&&!['production','development','test'].includes(env.NODE_ENV))errors.push('NODE_ENV must be development, test, or production.');
  const secret = env.AUTH_SECRET || env.JWT_SECRET || '';
  if (isPlaceholder(secret) || secret.length < 32 || new Set(secret).size < 8) errors.push('AUTH_SECRET must be a non-placeholder random secret of at least 32 characters. Run npm run setup.');
  if(env.ASSESSMENT_SECRET&&(isPlaceholder(env.ASSESSMENT_SECRET)||env.ASSESSMENT_SECRET.length<32))errors.push('ASSESSMENT_SECRET must be a non-placeholder secret of at least 32 characters when provided; otherwise AUTH_SECRET is used.');
  const uri = env.MONGODB_URI || env.MONGO_URI || '';
  if (!/^mongodb(?:\+srv)?:\/\//.test(uri) || isPlaceholder(uri)) errors.push('Set an actual MONGODB_URI. Do not use the example URI in production.');
  const origins = (env.FRONTEND_URLS || env.FRONTEND_URL || 'http://localhost:3000').split(',').map(x => x.trim()).filter(Boolean);
  for (const origin of origins) {
    try { const u = new URL(origin); if (u.origin !== origin || !['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw new Error(); if (production && u.protocol !== 'https:') throw new Error(); }
    catch { errors.push('Each FRONTEND_URLS entry must be an exact website origin, without a path or wildcard; HTTPS is required in production.'); }
  }
  try { envInteger(env.PORT, 5000, 1, 65535); envInteger(env.TRUST_PROXY_HOPS, 0, 0, 3); envInteger(env.MAX_UPLOAD_MB, 250, 1, 500); envInteger(env.ADMIN_MEDIA_MAX_UPLOAD_MB, 0, 0, 8388607); envInteger(env.MONGO_MAX_POOL, 20, 2, 100); }
  catch (error) { errors.push(error.message); }
  const scan=uploadScanConfiguration(env);
  errors.push(...scan.errors);
  if (scan.provider==='cloudmersive' && scan.enabled) warnings.push('Uploads will be sent to Cloudmersive over HTTPS for scanning. Review privacy/region/plan limits and run scan:check --remote; configuration alone is not service availability.');
  if (production) {
    if (!env.SMTP_HOST || isPlaceholder(env.SMTP_HOST) || !env.EMAIL_FROM || /YOUR_|example\./i.test(env.EMAIL_FROM)) errors.push('Production requires configured SMTP_HOST and EMAIL_FROM; the development console is not an email service.');
    if (!env.FRONTEND_URL || !origins.includes(env.FRONTEND_URL)) errors.push('FRONTEND_URL must be one of the allowed HTTPS origins.');
    if (env.PUBLIC_API_URL !== '/api') warnings.push('Use PUBLIC_API_URL=/api with the supplied same-origin reverse proxy. Cross-site frontend/API hosting is unsupported by this deployment.');
    if (!(review && env.UPLOADS_ENABLED === 'false')) {
      if (scan.provider==='clamav' && (env.UPLOAD_SCAN_REQUIRED!=='true' || !env.CLAMAV_HOST)) errors.push('Production uploads require UPLOAD_SCAN_REQUIRED=true and a reachable CLAMAV_HOST.');
      if (scan.provider==='cloudmersive' && env.UPLOAD_SCAN_REQUIRED!=='true') errors.push('Hosted Cloudmersive uploads require UPLOAD_SCAN_REQUIRED=true; scanning cannot be bypassed.');
    }
    if (/localhost|127\.0\.0\.1/.test(uri) && !/replicaSet=/.test(uri)) warnings.push('A local database must run as a replica set for financial transactions.');
  }
  if(review&&env.UPLOADS_ENABLED==='false')warnings.push('Review upload endpoints are disabled. Existing learning media remains readable; configure a scanner before enabling new uploads.');
  if(env.SEND_SANDBOX_EMAILS==='true'&&!env.SANDBOX_EMAIL_ALLOWLIST?.trim())errors.push('Sandbox email delivery requires an explicit SANDBOX_EMAIL_ALLOWLIST of test recipients.');
  if(env.SEND_SANDBOX_EMAILS==='true'&&stage==='production')errors.push('Do not enable sandbox emails in the live production stage.');
  if(env.SA_PROXY_SHARED_SECRET&&!usableProxySecret(env.SA_PROXY_SHARED_SECRET))errors.push('SA_PROXY_SHARED_SECRET must be a distinct non-placeholder random secret of at least 32 characters.');
  if(env.SA_REQUIRE_PROXY_IDENTITY==='true'&&!usableProxySecret(env.SA_PROXY_SHARED_SECRET))errors.push('SA_REQUIRE_PROXY_IDENTITY requires SA_PROXY_SHARED_SECRET shared only by frontend/backend servers.');
  if(production&&env.SA_REQUIRE_PROXY_IDENTITY!=='true')warnings.push('Trusted frontend client-IP attribution has not been enforced. Verify the hosting edge before live handover; never blindly trust browser forwarding headers.');
  if(env.PAYPAL_CREATE_REPLAY_SECONDS!==undefined&&(!/^\d+$/.test(env.PAYPAL_CREATE_REPLAY_SECONDS)||Number(env.PAYPAL_CREATE_REPLAY_SECONDS)>18000))errors.push('PAYPAL_CREATE_REPLAY_SECONDS must be 0..18000; set nonzero only within confirmed merchant/API idempotency retention.');
  if(env.ONLINE_PAYMENTS_ENABLED==='true'){
    const methods=gatewayConfiguration(env);
    if(!Object.values(methods).some(m=>m.enabled))errors.push('Online checkout is enabled but no complete Stripe or PayPal configuration is present. Set the provider credentials and webhook settings.');
    if(env.PAYMENTS_REQUIRE_BOTH==='true'&&(!methods.stripe.enabled||!methods.paypal.enabled))errors.push('PAYMENTS_REQUIRE_BOTH=true requires complete Stripe and PayPal configuration.');
    if(methods.stripe.enabled&&methods.paypal.enabled&&methods.stripe.environment!==methods.paypal.environment)errors.push('Stripe and PayPal must use the same payment environment. Do not mix test/sandbox credentials with live credentials.');
    if(production&&!review&&Object.values(methods).some(m=>m.enabled&&m.environment!=='live'))errors.push('Live production checkout cannot use sandbox/test payment credentials.');
    if(review&&Object.values(methods).some(m=>m.enabled&&m.environment==='live'))errors.push('Client-review checkout must use Stripe test and PayPal sandbox credentials; live credentials are blocked.');
    if(!env.FRONTEND_URL)errors.push('Online checkout requires an explicit FRONTEND_URL for return links.');
    if(!env.PAYMENT_WEBHOOK_BASE_URL)warnings.push('PAYMENT_WEBHOOK_BASE_URL is not set; webhook checks will default to FRONTEND_URL. Set the direct public API origin when frontend and backend use different hosts.');
    if(env.PAYMENT_WEBHOOK_BASE_URL){
      try{const u=new URL(env.PAYMENT_WEBHOOK_BASE_URL);if(u.origin!==env.PAYMENT_WEBHOOK_BASE_URL||!['http:','https:'].includes(u.protocol)||u.username||u.password||(production&&u.protocol!=='https:'))throw new Error();}
      catch{errors.push('PAYMENT_WEBHOOK_BASE_URL must be an exact HTTP/HTTPS origin; HTTPS is required in production.');}
    }
  }
  return {errors: [...new Set(errors)], warnings, production, review, stage, origins};
}
export function assertEnvironment(env = process.env) {
  const result = checkEnvironment(env);
  if (result.errors.length) throw new Error(result.errors.join('\n'));
  for (const warning of result.warnings) console.warn('Configuration:', warning);
  return result;
}
