'use client';
import {useWebsiteContent,websiteText} from "../WebsiteContent";
import AcademyImage from '../AcademyImage';
import PageSections from '../content/PageSections';
import {socialIcons} from '../cms/socialIcons';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useAuth} from '../auth/AuthProvider';
import {getPublicSiteContent} from '../../lib/publicSiteContent';

const labels:any={instagram:'Instagram',facebook:'Facebook',linkedin:'LinkedIn',youtube:'YouTube',x:'X',tiktok:'TikTok',whatsapp:'WhatsApp',threads:'Threads',pinterest:'Pinterest'};
const telHref=(value:string)=>'tel:'+value.replace(/[^+\d]/g,'');
const mapHref=(location:string,configured:string)=>{try{if(configured){const u=new URL(configured);if(['http:','https:'].includes(u.protocol)&&!u.username&&!u.password)return u.href;}}catch{}return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;};
const Icon=({name}:any)=>{const icon=socialIcons[name];return icon?<svg width="18" height="18" viewBox={`0 0 ${icon.width} ${icon.height}`} fill="currentColor" aria-hidden="true">{(Array.isArray(icon.path)?icon.path:[icon.path]).map((d,i)=><path key={i} d={d}/>)}</svg>:null};

export default function SiteFooter(){
 const website=useWebsiteContent();const{user,ready}=useAuth();
 const[social,setSocial]=useState<any>({});
 useEffect(()=>{let active=true;getPublicSiteContent().then(content=>{if(active)setSocial(content.footerSocial||{})}).catch(()=>{});return()=>{active=false}},[ready,user?.id,website]);
 const email=websiteText(website,'contact-009','singh@singhacademy.com');
 const phone=websiteText(website,'contact-010','+1 (559) 308 1249');
 const location=websiteText(website,'contact-011','By appointment · USA');
 const configuredMap=websiteText(website,'contact-012','');
 return <><PageSections/><footer className="footer footerV611">
  <div className="footerTop">
   <div className="brand footerBrand">
    <AcademyImage src="/singh-academy-logo-clean.png" alt={websiteText(website,"footer-001","Singh Academy")}/>
    <div>
     <strong>{websiteText(website,"footer-002","SINGH ACADEMY")}</strong>
     <p>{websiteText(website,"footer-003","Transforming conflict into connection and negotiation into opportunity.")}</p>
     <div className="footerSocial">{Object.entries(social).filter(([k,v])=>socialIcons[k]&&typeof v==='string'&&/^https?:\/\//i.test(v)).map(([k,v]:any)=><a key={k} href={v} target="_blank" rel="noreferrer" aria-label={labels[k]||k} title={labels[k]||k}><Icon name={k}/></a>)}</div>
    </div>
   </div>
   <div>
    <b>{websiteText(website,"footer-004","Explore")}</b>
    <Link prefetch={false} href="/about">{websiteText(website,"footer-005","About")}</Link>
    <Link prefetch={false} href="/academy">Academy Plans</Link>
    <Link prefetch={false} href="/team">{websiteText(website,"footer-007","Team")}</Link>
    <Link prefetch={false} href="/reviews">{websiteText(website,"footer-008","Reviews")}</Link>
   </div>
   <div>
    <b>{websiteText(website,"footer-009","Learn")}</b>
    <Link prefetch={false} href="/events">{websiteText(website,"footer-010","Events")}</Link>
    <Link prefetch={false} href="/my-course">My Courses</Link>
   </div>
   <div className="footerContactColumn">
    <b>{websiteText(website,"footer-012","Contact")}</b>
    <a className="footerContactLine" href={`mailto:${email}`}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/></svg><span>{email}</span></a>
    <a className="footerContactLine" href={telHref(phone)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 3 3 5-2 2c2 3 3 4 6 6l2-2 5 3-1 4C10 23 1 14 3 4Z"/></svg><span>{phone}</span></a>
    <a className="footerContactLine footerLocation" href={mapHref(location,configuredMap)} target="_blank" rel="noopener noreferrer"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/></svg><span>{location}</span></a>
   </div>
   <div>
    <b>{websiteText(website,"footer-013","Account")}</b>
    <Link prefetch={false} href="/login">{websiteText(website,"footer-014","Sign In")}</Link>
    <Link prefetch={false} href="/register">{websiteText(website,"footer-015","Get Started")}</Link>
    <Link prefetch={false} href="/terms">{websiteText(website,"footer-016","Terms")}</Link>
    <Link prefetch={false} href="/privacy">{websiteText(website,"footer-017","Privacy")}</Link>
   </div>
  </div>
  <div className="footerBottom">
   <span>{websiteText(website,"footer-018","© 2026 Singh Academy. All rights reserved.")}</span>
   <span>{websiteText(website,"footer-019","Negotiation • Mediation • Leadership • Cross-Cultural Communication")}</span>
   <a className="footerDeveloper" href="https://www.coffecodehub.com/" target="_blank" rel="noopener noreferrer">{websiteText(website,'footer-020','Developed by coffeeCODEhub')}</a>
  </div>
 </footer></>;
}
