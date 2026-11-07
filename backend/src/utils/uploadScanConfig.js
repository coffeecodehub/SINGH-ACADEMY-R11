/** Upload-scanner configuration only. No network, account creation or secret logging. */
import {hostedEnvironment} from './deploymentMode.js';
import {localUnscannedUploads} from './localUploadMode.js';
export const CLOUDMERSIVE_SCAN_URL = 'https://api.cloudmersive.com/virus/scan/file';
const placeholder = /YOUR_|REPLACE|CHANGE[_ -]?ME|GENERATE|example/i;
export function usableScannerKey(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{16,256}$/.test(value) && !placeholder.test(value);
}
function boundedInteger(value, fallback, minimum, maximum, name, errors) {
  if (value === undefined || value === '') return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value)<minimum || Number(value)>maximum) {
    errors.push(name+' is outside its allowed integer range.'); return fallback;
  }
  return Number(value);
}
export function uploadScanConfiguration(env=process.env) {
  const errors=[];
  const localUnscanned=localUnscannedUploads(env);
  const provider=env.UPLOAD_SCAN_PROVIDER || 'clamav';
  if (!['clamav','cloudmersive'].includes(provider)) errors.push('UPLOAD_SCAN_PROVIDER must be clamav or cloudmersive.');
  const enabled=env.UPLOADS_ENABLED!=='false';
  const required=env.UPLOAD_SCAN_REQUIRED==='true' || hostedEnvironment(env);
  const timeout=boundedInteger(env.UPLOAD_SCAN_TIMEOUT_MS,120000,5000,300000,'UPLOAD_SCAN_TIMEOUT_MS',errors);
  // Optional operator-declared provider allowance, never a guessed subscription limit.
  // Zero leaves acceptance to the actual provider; every file still needs a clean verdict.
  const maxFileBytes=boundedInteger(env.CLOUDMERSIVE_MAX_FILE_BYTES,0,0,Number.MAX_SAFE_INTEGER,'CLOUDMERSIVE_MAX_FILE_BYTES',errors);
  const apiKey=env.CLOUDMERSIVE_API_KEY || '';
  if (!localUnscanned && provider==='cloudmersive' && (enabled || (hostedEnvironment(env) && env.DEPLOYMENT_STAGE!=='review')) && !usableScannerKey(apiKey)) errors.push('Cloudmersive uploads require a valid CLOUDMERSIVE_API_KEY in the backend environment.');
  return {provider,enabled,required,timeout,maxFileBytes,apiKey,localUnscanned,errors};
}
