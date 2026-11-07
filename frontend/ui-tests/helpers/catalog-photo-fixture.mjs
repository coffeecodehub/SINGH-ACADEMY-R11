/** TEST ONLY. Responsive photo responses with real, descriptor-matching pixels.
 * A 1x1 placeholder advertised as 480w is NOT a valid responsive-image fixture:
 * naturalWidth is density-corrected and can round to zero even after decode().
 * No production component, database, or real media bytes are changed here.
 */
import {deflateSync} from 'node:zlib';

export const CATALOG_PHOTO_PATH='/api/media/'+'f'.repeat(24);
export const CATALOG_PHOTO_WIDTHS=Object.freeze([240,480,720,1080,1600]);
export const CATALOG_PHOTO_ORIGINAL_WIDTH=1600;
const cache=new Map();
const signature=Buffer.from([137,80,78,71,13,10,26,10]);

function crc32(data){
 let crc=0xffffffff;
 for(const byte of data){
  crc^=byte;
  for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);
 }
 return (crc^0xffffffff)>>>0;
}
function chunk(type,data){
 const name=Buffer.from(type,'ascii');
 const length=Buffer.alloc(4);length.writeUInt32BE(data.length);
 const checksum=Buffer.alloc(4);checksum.writeUInt32BE(crc32(Buffer.concat([name,data])));
 return Buffer.concat([length,name,data,checksum]);
}
export function catalogPhotoPng(width){
 if(!CATALOG_PHOTO_WIDTHS.includes(width))throw new RangeError('Unsupported synthetic catalog photo width.');
 if(cache.has(width))return Buffer.from(cache.get(width));
 const height=Math.round(width*9/16),rowLength=1+width*3;
 const pixels=Buffer.alloc(rowLength*height);
 // Deterministic two-band RGB image. Every row uses the PNG "None" filter.
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const at=y*rowLength+1+x*3,left=x<width/2;
  pixels[at]=left?102:181;pixels[at+1]=left?140:164;pixels[at+2]=left?163:129;
 }
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);
 ihdr[8]=8;ihdr[9]=2; // 8-bit RGB, standard compression/filtering, no interlacing.
 const body=Buffer.concat([signature,chunk('IHDR',ihdr),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
 cache.set(width,body);
 return Buffer.from(body);
}
export function catalogPhotoResponse(address){
 const url=new URL(address,'http://127.0.0.1:3108');
 if(url.pathname!==CATALOG_PHOTO_PATH)throw new Error('Unexpected synthetic catalog image path.');
 const values=url.searchParams.getAll('w');
 const width=values.length===0?CATALOG_PHOTO_ORIGINAL_WIDTH:Number(values[0]);
 if(values.length>1||!CATALOG_PHOTO_WIDTHS.includes(width)||(values.length===1&&values[0]!==String(width))){
  return {status:400,contentType:'text/plain; charset=utf-8',headers:{'Cache-Control':'no-store'},body:Buffer.from('Invalid synthetic image width.')};
 }
 return {status:200,contentType:'image/png',headers:{'Cache-Control':'private, max-age=300'},body:catalogPhotoPng(width)};
}
