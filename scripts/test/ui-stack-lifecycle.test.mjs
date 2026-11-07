import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {uiProcessAlive,acquireUiStackLock,stopOwnedUiChild} from '../ui-stack-lifecycle.mjs';

test('a zombie PID does not retain the UI build lock, while a live process does',()=>{
 assert.equal(uiProcessAlive(123,{probe(){},platform:'linux',readStat:()=> '123 (old UI stack) Z 1 0'}),false);
 assert.equal(uiProcessAlive(123,{probe(){},platform:'linux',readStat:()=> '123 (live UI stack) S 1 0'}),true);
 assert.equal(uiProcessAlive(123,{probe(){throw Object.assign(new Error(),{code:'EPERM'});}}),true);
});
test('stale locks recover, live owners remain protected and release cannot erase a replacement owner',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sa-ui-lock-')),lock=path.join(directory,'.ui-stack.lock');
 try{
  fs.writeFileSync(lock,'123');
  assert.throws(()=>acquireUiStackLock(lock,{pid:456,isAlive:()=>true}),/Another UI test stack/);
  const release=acquireUiStackLock(lock,{pid:456,isAlive:()=>false});assert.equal(fs.readFileSync(lock,'utf8'),'456');
  fs.writeFileSync(lock,'789');release();assert.equal(fs.readFileSync(lock,'utf8'),'789');
  const finalRelease=acquireUiStackLock(lock,{pid:456,isAlive:()=>false});finalRelease();assert.equal(fs.existsSync(lock),false);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test('owned child-group teardown stops its grandchild without terminating unrelated processes',{skip:process.platform==='win32'},async()=>{
 const unrelated=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});
 const child=spawn(process.execPath,['--input-type=module','-e',"import {spawn} from 'node:child_process';const p=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});console.log(p.pid);setInterval(()=>{},1000);"],{detached:true,stdio:['ignore','pipe','ignore']});
 let grandchild;
 try{
  const [output]=await once(child.stdout,'data');grandchild=Number(String(output).trim());assert.ok(grandchild>0);
  assert.equal(uiProcessAlive(grandchild),true);
  await stopOwnedUiChild(child,{timeoutMs:1000});
  for(let attempt=0;attempt<20&&uiProcessAlive(grandchild);attempt++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(uiProcessAlive(grandchild),false);assert.equal(uiProcessAlive(unrelated.pid),true);
 }finally{await stopOwnedUiChild(child,{timeoutMs:1000});unrelated.kill('SIGKILL');}
});
