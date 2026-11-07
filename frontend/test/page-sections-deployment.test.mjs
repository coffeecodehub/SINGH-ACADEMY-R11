import test from 'node:test';
import assert from 'node:assert/strict';
import {proxyTarget} from '../lib/server/apiProxy.mjs';
const production={NODE_ENV:'production',API_PROXY_ALLOW_INTERNAL_DOCKER:'true'};
test('production Docker session upstream is fixed to the private backend service',()=>assert.equal(proxyTarget({...production,API_PROXY_TARGET:'http://backend:5000'},'https://academy.example.org'),'http://backend:5000'));
for(const upstream of ['http://evil.example.org','http://localhost:5000','http://backend:8080','http://backend.evil.example.org:5000','http://backend:5000/path'])test('private Docker flag cannot authorize arbitrary HTTP upstream '+upstream,()=>assert.throws(()=>proxyTarget({...production,API_PROXY_TARGET:upstream},'https://academy.example.org')));
test('external deployments retain HTTPS requirement without the explicit private Docker flag',()=>assert.throws(()=>proxyTarget({NODE_ENV:'production',API_PROXY_TARGET:'http://backend:5000'},'https://academy.example.org')));
