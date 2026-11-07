'use client';
import {usePathname} from 'next/navigation';
import {portalMediaUrl} from '../../lib/api';
import {usePublicResource} from '../../lib/usePublicResource';
import {contentPageKey,pageHasContentAnchors,type PageContentBlock,type PageSectionPlacement} from '../../lib/pageSections';
import './page-sections.css';
import PageGallery from './PageGallery';
import PageSectionVideo from './PageSectionVideo';
import AcademyImage from '../AcademyImage';
export function PageSectionBlock({block,preview=false}:{block:PageContentBlock;preview?:boolean}){
 const external=block.buttonUrl?.startsWith('https:');
 return <section className={`pageSectionBlock pageSectionTheme-${block.theme||'cream'} pageSectionLayout-${block.layout||'stack'} pageSectionAlign-${block.align||'left'}`} aria-labelledby={block.title?`page-section-${block.id}`:undefined}>
  <div className="pageSectionCopy">{block.title&&<h2 id={`page-section-${block.id}`}>{block.title}</h2>}{block.description&&<div className="pageSectionDescription">{block.description.split(/\n\s*\n/).map((paragraph,i)=><p key={i}>{paragraph}</p>)}</div>}{block.buttonLabel&&block.buttonUrl&&<a className="button" href={block.buttonUrl} {...(external?{target:'_blank',rel:'noopener noreferrer'}:{})}>{block.buttonLabel}{external?' ↗':''}</a>}</div>
  <PageGallery block={block} preview={preview}/>
  {(block.imageUrl||block.videoUrl)&&<div className="pageSectionMedia">{block.imageUrl&&<AcademyImage src={preview?portalMediaUrl(block.imageUrl):block.imageUrl} alt={block.imageAlt} priority={!preview&&block.placement==='start'} sizes="(max-width: 760px) 90vw, 1100px" decoding="async" style={{objectFit:block.imageFit||'contain'}}/>}{block.videoUrl&&<PageSectionVideo url={preview?portalMediaUrl(block.videoUrl):block.videoUrl} title={block.title}/>}</div>}
 </section>;
}
/** Concurrent anchors reuse the account-bound public result and render only their placement. */
export default function PageSections({placement='end'}:{placement?:PageSectionPlacement}={}){
 const path=usePathname(),key=contentPageKey(path),{data:blocks,error}=usePublicResource<PageContentBlock>(key?`/page-sections/${key}`:'','blocks');
 const placed=blocks.filter(block=>pageHasContentAnchors(path)?(block.placement||'end')===placement:placement==='end');
 if(!key||(!placed.length&&(!error||placement!=='end')))return null;
 return <div className="pageSections" aria-label="Additional page sections">{placed.map(block=><PageSectionBlock key={block.id} block={block}/>)}{error&&placement==='end'&&<p className="pageSectionsUnavailable" role="status">Additional page content is temporarily unavailable.</p>}</div>;
}
