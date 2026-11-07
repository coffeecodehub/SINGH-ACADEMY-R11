/** No image library/mocks: validate the actual PNG chunks and decompressed pixels
 * supplied by the responsive-photo browser fixture. This runs before UI tests. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
import {CATALOG_PHOTO_PATH,CATALOG_PHOTO_WIDTHS,CATALOG_PHOTO_ORIGINAL_WIDTH,catalogPhotoPng,catalogPhotoResponse} from '../ui-tests/helpers/catalog-photo-fixture.mjs';

// Independent table-driven checksum, not the producer's implementation.
const table=Uint32Array.from({length:256},(_,n)=>{let value=n;for(let bit=0;bit<8;bit++)value=(value&1)?0xedb88320^(value>>>1):value>>>1;return value>>>0;});
function checksum(bytes){let value=0xffffffff;for(const byte of bytes)value=table[(value^byte)&255]^(value>>>8);return (value^0xffffffff)>>>0;}
function parsePng(bytes){
 assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);
 let at=8,header;const compressed=[],types=[];
 while(at<bytes.length){
  assert.ok(at+12<=bytes.length,'complete PNG chunk header');const length=bytes.readUInt32BE(at),end=at+8+length;
  assert.ok(end+4<=bytes.length,'complete PNG chunk body/checksum');
  const type=bytes.toString('ascii',at+4,at+8),data=bytes.subarray(at+8,end);
  assert.equal(bytes.readUInt32BE(end),checksum(bytes.subarray(at+4,end)),type+' CRC');
  types.push(type);if(type==='IHDR')header=data;if(type==='IDAT')compressed.push(data);
  at=end+4;
 }
 assert.deepEqual(types,['IHDR','IDAT','IEND']);assert.equal(header.length,13);
 assert.deepEqual([...header.subarray(8)],[8,2,0,0,0]);
 const width=header.readUInt32BE(0),height=header.readUInt32BE(4),pixels=inflateSync(Buffer.concat(compressed));
 assert.equal(pixels.length,(width*3+1)*height);
 for(let y=0;y<height;y++)assert.equal(pixels[y*(width*3+1)],0,'None PNG filter on every row');
 return {width,height,pixels};
}
for(const width of CATALOG_PHOTO_WIDTHS)test(`V60.13.1 PNG ${width}w has real matching width, intact CRC and decodable pixel stream`,()=>{
 const response=catalogPhotoResponse(CATALOG_PHOTO_PATH+'?w='+width),image=parsePng(response.body);
 assert.equal(response.status,200);assert.equal(response.contentType,'image/png');
 assert.equal(image.width,width);assert.equal(image.height,Math.round(width*9/16));
 assert.deepEqual([...image.pixels.subarray(1,4)],[102,140,163]);
});
test('unmodified/original fixture response is a real 1600px photograph placeholder',()=>{
 const response=catalogPhotoResponse(CATALOG_PHOTO_PATH),image=parsePng(response.body);
 assert.equal(image.width,CATALOG_PHOTO_ORIGINAL_WIDTH);assert.equal(image.height,900);
});
for(const query of ['w=1','w=0','w=-1','w=4096','w=480.0','w=0480','w=NaN','w=','w=480&w=720'])test('fixture rejects invalid/ambiguous width instead of fabricating a 1px image: '+query,()=>{
 const response=catalogPhotoResponse(CATALOG_PHOTO_PATH+'?'+query);
 assert.equal(response.status,400);assert.match(response.contentType,/^text\/plain/);
});
test('fixture generator refuses unbounded images and unsupported scalar types',()=>{
 for(const width of [-1,0,1,240.1,'480',{},NaN,Infinity,100000])assert.throws(()=>catalogPhotoPng(width),RangeError);
});
test('original-image fallback preserves retry query without changing actual pixels',()=>{
 assert.deepEqual(catalogPhotoResponse(CATALOG_PHOTO_PATH+'?sa_image_retry=1').body,catalogPhotoPng(1600));
});
test('fixture cannot accidentally intercept a different student/private media path',()=>{
 assert.throws(()=>catalogPhotoResponse('/api/media/'+'a'.repeat(24)+'?w=480'),/Unexpected synthetic catalog image path/);
});
test('fixture cache is deterministic and callers cannot mutate a cached PNG',()=>{
 const expected=catalogPhotoPng(480),copy=catalogPhotoPng(480);copy.fill(0);
 assert.deepEqual(catalogPhotoPng(480),expected);
});
test('legacy 1x1 fixture cannot substantiate a 480w descriptor and its bad CRC is detected',()=>{
 const legacy=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4L8AAAAASUVORK5CYII=','base64');
 assert.equal(legacy.readUInt32BE(16),1);
 assert.notEqual(legacy.readUInt32BE(16),480);
 assert.throws(()=>parsePng(legacy),/CRC/);
});
