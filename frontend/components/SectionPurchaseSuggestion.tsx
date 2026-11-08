'use client';
import {useEffect,useState} from 'react';
import {apiFetch} from '../lib/api';
import {sectionPurchaseSuggestion} from '../lib/sectionPurchaseSuggestion';

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
 const {offer}=suggestion;
 return <button type="button" disabled={disabled} onClick={()=>window.location.assign('/checkout?'+new URLSearchParams({section:slug,option:offer.key}))}><b>Complete section</b><span>All published courses in this section</span></button>;
}
