'use client';
import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {portalMediaUrl} from '../../lib/api';
import {bindGalleryMotion} from '../../lib/galleryMotion';
import AcademyImage from '../AcademyImage';
import type {PageContentBlock,PageGalleryImage} from '../../lib/pageSections';
export default function PageGallery({block,preview=false}:{block:PageContentBlock;preview?:boolean}){
 const items=(block.gallery||[]).filter(image=>image.imageUrl),[selected,setSelected]=useState(0),viewport=useRef<HTMLDivElement>(null);
 const layout=block.galleryLayout||'grid',identity=items.map(image=>image.id+image.imageUrl).join('|'),loop=layout==='carousel'&&items.length>1;
 useEffect(()=>{if(layout==='carousel'&&items.length>1&&viewport.current)return bindGalleryMotion(viewport.current);},[layout,identity]);
 if(!items.length)return null;
 const index=Math.min(selected,items.length-1),aspect=(block.imageAspect||'4:3').replace(':','/');
 function figure(image:PageGalleryImage,i:number,copy?:'before'|'after'){return <figure className={'pageGalleryItem'+(copy?' pageGalleryCopy':'')} key={copy?copy+':'+image.id:image.id} data-gallery-copy={copy} data-gallery-original-start={loop&&!copy&&i===0?'':undefined} data-gallery-after-start={loop&&copy==='after'&&i===0?'':undefined} aria-hidden={copy?true:undefined} inert={copy?true:undefined}>
  <div className="pageGalleryFrame" style={block.imageAspect==='original'?undefined:{aspectRatio:aspect}}><AcademyImage src={preview?portalMediaUrl(image.imageUrl):image.imageUrl} alt={image.imageAlt||''} priority={!copy&&(layout==='single'||(!preview&&block.placement==='start'&&i===0))} sizes={layout==='single'?'(max-width: 760px) 90vw, 900px':layout==='carousel'?'(max-width: 760px) 85vw, 700px':'(max-width: 480px) 90vw, (max-width: 760px) 44vw, '+Math.round(1100/(block.columns||3))+'px'} loading={!copy&&(layout==='single'||(!preview&&block.placement==='start'&&i===0))?'eager':'lazy'} decoding="async" style={{objectFit:image.imageFit||'cover',objectPosition:`${image.positionX??50}% ${image.positionY??50}%`}}/></div>
  {(image.title||image.description)&&<figcaption>{image.title&&<h3>{image.title}</h3>}{image.description&&<p>{image.description}</p>}</figcaption>}
 </figure>;}
 return <div className={`pageGallery pageGallery-${layout}`} style={{'--gallery-columns':block.columns||3} as CSSProperties} aria-label={block.title?`${block.title} image gallery`:'Image gallery'}>
  {layout==='single'?<><div className="pageGalleryViewer">{figure(items[index],index)}</div>{items.length>1&&<div className="pageGalleryThumbnails" aria-label="Choose gallery image">{items.map((image,i)=><button type="button" key={image.id} aria-label={`Show gallery image ${i+1}${image.title?': '+image.title:''}`} aria-pressed={index===i} onClick={()=>setSelected(i)}><AcademyImage src={preview?portalMediaUrl(image.imageUrl):image.imageUrl} alt={image.imageAlt||''} sizes="72px" loading="lazy"/></button>)}</div>}</>:<div ref={viewport} className="pageGalleryItems" tabIndex={layout==='carousel'?0:undefined} role={layout==='carousel'?'region':undefined} aria-label={layout==='carousel'?'Automatically moving image gallery; hover or focus to inspect':undefined}>{loop&&items.map((image,i)=>figure(image,i,'before'))}{items.map((image,i)=>figure(image,i))}{loop&&items.map((image,i)=>figure(image,i,'after'))}</div>}
 </div>;
}
