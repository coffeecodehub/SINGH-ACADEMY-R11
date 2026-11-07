import test from 'node:test';
import assert from 'node:assert/strict';
import {uploadAvailability} from '../src/utils/uploadAvailability.js';
test('local default scanner-free mode is explicit and never reported as a malware scan',()=>{
 const status=uploadAvailability({NODE_ENV:'development',DEPLOYMENT_STAGE:'development'});
 assert.equal(status.configurationReady,true);assert.equal(status.developmentWithoutScanner,true);
 assert.equal(status.scannerConfigured,false);assert.match(status.message,/without malware scanning/);
});
test('hosted or contradictory environments never inherit local scanner-free mode',()=>{
 for(const env of [{NODE_ENV:'production'},{DEPLOYMENT_STAGE:'review'},{NODE_ENV:'production',DEPLOYMENT_STAGE:'development'}]){
  const status=uploadAvailability(env);assert.equal(status.configurationReady,false);assert.equal(status.developmentWithoutScanner,false);assert.equal(status.required,true);
 }
});
test('disabled uploads and explicit invalid provider configuration are actionable, not silently bypassed',()=>{
 assert.equal(uploadAvailability({UPLOADS_ENABLED:'false'}).configurationReady,false);
 const status=uploadAvailability({NODE_ENV:'development',UPLOAD_SCAN_PROVIDER:'cloudmersive'});
 assert.equal(status.configurationReady,false);assert.match(status.message,/CLOUDMERSIVE_API_KEY/);assert.equal(status.developmentWithoutScanner,false);
});
test('configured diagnostics do not expose provider secrets or private network addresses',()=>{
 for(const env of [{NODE_ENV:'production',CLAMAV_HOST:'private-scanner.internal'}, {NODE_ENV:'production',UPLOAD_SCAN_PROVIDER:'cloudmersive',CLOUDMERSIVE_API_KEY:'abcdefghijklmnopqrstuvwx'}]){
  const status=uploadAvailability(env),serialized=JSON.stringify(status);assert.equal(status.configurationReady,true);
  assert.doesNotMatch(serialized,/private-scanner\.internal|abcdefghijklmnopqrstuvwx/);
  assert.match(status.message,/reachable/);
 }
});
