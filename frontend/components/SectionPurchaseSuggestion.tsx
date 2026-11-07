'use client';
import {useEffect,useState} from 'react';
import {apiFetch} from '../lib/api';
import {money} from '../lib/money';
import {sectionPurchaseSuggestion} from '../lib/sectionPurchaseSuggestion';
import styles from './SectionPurchaseSuggestion.module.css';

export default function SectionPurchaseSuggestion({slug,durationMonths,disabled=false}:{slug:string;durationMonths?:number;disabled?:boolean}){
 const [data,setData]=useState<{detail:any;catalog:any}|null>(null);
 useEffect(()=>{
  const controller=new AbortController();setData(null);
  Promise.all([apiFetch('/sections/'+encodeURIComponent(slug),{signal:controller.signal}),apiFetch('/payments/catalog?'+new URLSearchParams({kind:'section',product:slug}),{signal:controller.signal})])
   .then(([detail,catalog])=>{if(!controller.signal.aborted)setData({detail,catalog});})
   .catch(()=>{/* An optional suggestion must not interrupt the selected course checkout. */});
  return()=>controller.abort();
 },[slug]);
 const suggestion=data?sectionPurchaseSuggestion(slug,data.detail,data.catalog,durationMonths):null;
 if(!suggestion)return null;
 const {title,courseCount,offer}=suggestion;
 return <aside className={styles.card} aria-label="Full section purchase"><h2>{title}</h2><p>{courseCount} {courseCount===1?'course':'courses'} included</p><p><strong>{money(offer.amountMinor/100,offer.currency)}</strong> <span>for {offer.durationMonths} month(s)</span></p><button type="button" className="pill" disabled={disabled} onClick={()=>window.location.assign('/checkout?'+new URLSearchParams({section:slug,option:offer.key}))}>Buy Full Section</button></aside>;
}
