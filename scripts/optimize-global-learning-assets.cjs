/** Add responsive copies for the five supplied photographs without regenerating other assets.
 * Uses optimize-assets.cjs widths/encoding; originals and existing outputs are immutable. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const projectRoot=path.resolve(__dirname,'..');
const SOURCES=Object.freeze([
 '/images/global-learning/brazil-1.jpg',
 '/images/global-learning/brazil-2.jpg',
 '/images/global-learning/brazil-3.jpg',
 '/images/global-learning/ukraine-delegation-1.jpg',
 '/images/global-learning/ukraine-delegation-2.jpg'
]);
const sha256=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');

async function optimizeGlobalLearningAssets({root=projectRoot,sharp=require(process.env.SHARP_PATH||path.join(projectRoot,'backend/node_modules/sharp'))}={}){
 const publicDir=path.join(root,'frontend/public'),out=path.join(publicDir,'optimized'),manifestPath=path.join(root,'frontend/lib/image-manifest.json');
 const previous=fs.readFileSync(manifestPath,'utf8'),manifest=JSON.parse(previous);
 const provenance=JSON.parse(fs.readFileSync(path.join(root,'docs/global-learning-images.json'),'utf8'));
 const pending=new Map(),entries=[],report=[];
 for(const src of SOURCES){
  const raw=fs.readFileSync(path.join(publicDir,src)),hash=sha256(raw),original=provenance.images.find(image=>image.src===src);
  if(!original||original.sha256!==hash)throw new Error('Original photograph does not match its recorded provenance: '+src);
  const metadata=await sharp(raw,{limitInputPixels:60000000}).metadata();
  const swapped=[5,6,7,8].includes(metadata.orientation),width=swapped?metadata.height:metadata.width,height=swapped?metadata.width:metadata.height;
  if(!width||!height)throw new Error('Photograph dimensions are unavailable: '+src);
  const widths=[...new Set([...([240,480,800,1280,1920].filter(value=>value<width)),Math.min(width,1920)])],variants=[];
  for(const targetWidth of widths){
   const name=hash.slice(0,16)+'-'+targetWidth+'.webp',target=path.join(out,name);
   const {data,info}=await sharp(raw,{limitInputPixels:60000000,animated:false}).rotate().resize({width:targetWidth,withoutEnlargement:true}).webp({quality:80,effort:4}).toBuffer({resolveWithObject:true});
   if(fs.existsSync(target)){
    if(!fs.readFileSync(target).equals(data))throw new Error('Refusing to overwrite an existing optimized asset: '+name);
   }else pending.set(target,data);
   variants.push({src:'/optimized/'+name,width:info.width,height:info.height,bytes:info.size});
  }
  const entry={src:(variants.find(variant=>variant.width>=800)||variants.at(-1)).src,width,height,variants};
  if(Object.hasOwn(manifest,src)&&JSON.stringify(manifest[src])!==JSON.stringify(entry))throw new Error('Refusing to replace an existing image manifest entry: '+src);
  entries.push([src,entry]);
  report.push({src,originalBytes:raw.length,variants});
 }
 // Validate every source/collision before writing any output. Never replace existing bytes.
 fs.mkdirSync(out,{recursive:true});
 for(const [target,data]of pending)fs.writeFileSync(target,data,{flag:'wx'});
 for(const [src,entry]of entries)manifest[src]=entry;
 const next=JSON.stringify(manifest);
 if(next!==previous)fs.writeFileSync(manifestPath,next);
 return {addedFiles:pending.size,images:report};
}

module.exports={SOURCES,optimizeGlobalLearningAssets};
if(require.main===module)optimizeGlobalLearningAssets().then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{console.error(error.message);process.exitCode=1;});
