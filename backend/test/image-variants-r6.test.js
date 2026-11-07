import test from 'node:test';import assert from 'node:assert/strict';import sharp from 'sharp';import {Readable} from 'node:stream';
import {createPublicImageVariantService} from '../src/services/imageVariants.js';
const id='a'.repeat(24),base={length:5,contentType:'image/png',metadata:{purpose:'cms-page-section'},uploadDate:new Date('2026-11-06')};
test('published-page image purpose is eligible for the same bounded responsive cache as catalog images',async()=>{
 let reads=0,transforms=0;const render=createPublicImageVariantService({transform:async(data,width)=>{transforms++;assert.equal(data.toString(),'photo');return Buffer.from('webp-'+width);}}),bucket={async *openDownloadStream(){reads++;yield Buffer.from('photo');}};
 const result=await Promise.all([render(bucket,id,base,480),render(bucket,id,base,480)]);assert.equal(result[0].toString(),'webp-480');assert.equal(reads,1);assert.equal(transforms,1);
});
test('large HD originals use a streamed transform and coalesce a responsive width without the buffered-original path',async()=>{
 let reads=0,streamed=0;const size=11*1024*1024;
 const bucket={openDownloadStream(){reads++;return Readable.from((async function*(){for(let left=size;left>0;left-=65536)yield Buffer.alloc(Math.min(left,65536));})());}};
 const render=createPublicImageVariantService({transform:()=>{throw Error('Large source must not enter buffer transform');},transformStream:async(source,width)=>{streamed++;let bytes=0;for await(const chunk of source){assert.ok(chunk.length<=65536);bytes+=chunk.length;}assert.equal(bytes,size);return Buffer.from('small-'+width);}});
 const result=await Promise.all([render(bucket,id,{...base,length:size},720),render(bucket,id,{...base,length:size},720)]);assert.equal(result[0].toString(),'small-720');assert.equal(reads,1);assert.equal(streamed,1);
});
test('actual Sharp streamed derivative shrinks a valid original above10MiB and leaves its source bytes unchanged',async()=>{
 const original=await sharp({create:{width:2100,height:1800,channels:3,background:'#a36842'}}).png({compressionLevel:0}).toBuffer();assert.ok(original.length>10*1024*1024);let reads=0;
 const bucket={openDownloadStream(){reads++;return Readable.from((async function*(){for(let offset=0;offset<original.length;offset+=65536)yield original.subarray(offset,offset+65536);})());}};
 const render=createPublicImageVariantService(),body=await render(bucket,id,{...base,length:original.length},480),metadata=await sharp(body).metadata();assert.equal(metadata.width,480);assert.equal(metadata.format,'webp');assert.ok(body.length<original.length/100);assert.equal(reads,1);assert.equal((await render(bucket,id,{...base,length:original.length},480)).equals(body),true);assert.equal(reads,1);assert.equal((await sharp(original).metadata()).width,2100);
});
test('large private or non-raster files never start either resize path',async()=>{
 let opened=0;const render=createPublicImageVariantService(),bucket={openDownloadStream(){opened++;throw Error('Private source read');}};
 for(const purpose of ['student-assessment','payment-receipt','video-review'])assert.equal(await render(bucket,id,{...base,length:20*1024*1024,metadata:{purpose}},480),null);
 assert.equal(await render(bucket,id,{...base,length:20*1024*1024,contentType:'image/svg+xml'},480),null);assert.equal(opened,0);
});
