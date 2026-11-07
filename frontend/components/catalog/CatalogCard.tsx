import Link from 'next/link';
import AcademyImage from '../AcademyImage';
import {COURSE_CARD_SIZES} from '../../lib/imageSources';
import {catalogOffers,accessTerm} from '../../lib/catalogPresentation';
import {money} from '../../lib/money';
import PriceOptions from './PriceOptions';
import './catalog.css';

export default function CatalogCard({product,kind='course',priority=false,covered=false,coverageLabel='Membership Access',accessPending=false,variant='catalog',index=0}:{product:any;kind?:'course'|'section';priority?:boolean;covered?:boolean;coverageLabel?:string;accessPending?:boolean;variant?:'catalog'|'landing'|'compact'|'pricing';index?:number}){
 const section=kind==='section',fallback='/images/courses/cross-cultural-community.png';
 const href=`/${section?'sections':'courses'}/${encodeURIComponent(product.slug)}`;
 if(variant==='pricing')return <article className={index%2?'featured':undefined} data-product-kind={kind}><span>COURSE SECTION</span><h3>{product.title}</h3><p>{product.shortDescription||product.description||'Explore the courses and access options in this section.'}</p><Link prefetch={false} className={index%2?'button':'ghost darkGhost'} href={href}>Explore section →</Link></article>;
 const image=<AcademyImage sizes={COURSE_CARD_SIZES} priority={priority} style={{objectFit:product.thumbnailFit||(section?'contain':'cover'),objectPosition:`${product.thumbnailPositionX??50}% ${product.thumbnailPositionY??50}%`,transform:`scale(${product.thumbnailZoom||1})`}} src={product.thumbnail||fallback} alt={product.title}/>;
 if(variant==='landing')return <article className="card courseLiveCard" data-product-kind={kind}><div className="courseLiveImage">{image}</div><span className="num">{String(index+1).padStart(2,'0')}</span><h3>{product.title}</h3><p>{product.shortDescription||product.description||'Explore this Singh Academy course section.'}</p><div className="cardFoot"><span>Course section</span><Link prefetch={false} href={href}>Explore section →</Link></div></article>;
 const offer=variant==='compact'?catalogOffers(product)[0]:null;
 return <article className="courseVisualCard" data-product-kind={kind}>{image}<div className="courseCardBody"><span className="instructorBadge">{section?'COURSE SECTION':product.instructor||'Singh Academy Faculty'}</span><h3>{product.title}</h3><p>{product.shortDescription||product.description||'Professional Singh Academy learning.'}</p>{covered?<div className="courseMeta"><b>{coverageLabel}</b><span>Included in your active access</span></div>:accessPending?<div className="courseMeta" role="status"><b>Checking access…</b></div>:variant==='compact'?<div className="courseMeta"><b>{offer?money(offer.price,offer.currency):'View access options'}</b><span>{offer?`${accessTerm(offer.durationMonths)} access`:'Section learning'}</span></div>:product.accessType==='free'?<div className="courseMeta"><b>Free</b><span>Start with your student account</span></div>:product.accessType==='membership'?<div className="courseMeta"><b>Existing access</b></div>:<PriceOptions product={product} kind={kind}/>}<Link prefetch={false} className="button courseEnroll" href={covered?(section?href+'#section-courses':'/learn/'+encodeURIComponent(product.slug)):href}>{covered?(section?'Open Section →':'Continue Course →'):(section?'Explore Section →':'View Course →')}</Link></div></article>;
}
