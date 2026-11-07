'use client';
import {useEffect,useState} from 'react';
import {apiFetch} from '../../lib/api';
import FeedbackNotice from '../feedback/FeedbackNotice';
import type {Country,CountryPrice,PricingOption} from './regionalPricing';
import {filterCountries,usaDefaultPrice,changeUsaDefault,changeCountryPrices} from './regionalPricing';
import './catalog-admin.css';
// Keep the legacy prop accepted while country prices are now shown for every base term.
type Props={value:any;onChange:(part:any)=>void;disabled?:boolean;baseCountryPrices?:boolean};
export default function RegionalPricingEditor({value,onChange,disabled=false}:Props){
 const[countries,setCountries]=useState<Country[]>([]),[countryError,setCountryError]=useState(''),[revision,setRevision]=useState(0);
 useEffect(()=>{const controller=new AbortController();setCountryError('');apiFetch('/auth/countries',{signal:controller.signal}).then(d=>{if(!controller.signal.aborted){if(!Array.isArray(d.countries))throw new Error('Country list is unavailable.');setCountries(d.countries);}}).catch(e=>{if(!controller.signal.aborted)setCountryError(e.message);});return()=>controller.abort();},[revision]);
 const options:PricingOption[]=value.pricing||[];
 const patch=(index:number,part:any)=>onChange({pricing:options.map((option,i)=>i===index?{...option,...part}:option)});
 return <section className="regionalPricing wide" aria-label="USD pricing and country overrides">
  <p>Enter the total price in USD for the access term. The USA/default price applies wherever no country price is set. Checkout uses the country saved on the student's account.</p>
  {countryError&&<FeedbackNotice variant="error">{countryError} <button type="button" className="edit" disabled={disabled} onClick={()=>setRevision(n=>n+1)}>Retry country list</button></FeedbackNotice>}
  <h3>Default price</h3>
  <div className="formGrid regionalBaseFields">
   <label>Access term (months)<input className="field" type="number" min="1" max="120" step="1" required disabled={disabled} value={value.accessMonths??1} onChange={e=>onChange({accessMonths:e.target.value})}/></label>
   <label>USA / default term total (USD)<input className="field" type="number" min="0" step="0.01" required disabled={disabled} value={usaDefaultPrice(value)} onChange={e=>onChange(changeUsaDefault(value,e.target.value))}/></label>
  </div>
  <CountryPrices value={value.countryPrices||[]} label="Default term" countries={countries} disabled={disabled} onChange={countryPrices=>onChange(changeCountryPrices(value,countryPrices))}/>
  <h3>Additional access terms</h3><p>Students can choose the default term or any additional term below. Each term has its own total and optional country prices. Use any whole-month duration from 1 to 120 months.</p>
  {options.map((option,index)=><article className="planEditor" key={option.key||index}>
   <div className="formGrid">
    <label>Term name<input className="field" maxLength={120} required disabled={disabled} value={option.label||''} onChange={e=>patch(index,{label:e.target.value})}/></label>
    <label>Access term (months)<input className="field" type="number" min="1" max="120" step="1" required disabled={disabled} value={option.durationMonths??1} onChange={e=>patch(index,{durationMonths:e.target.value})}/></label>
    <label>USA / default term total (USD)<input className="field" type="number" min="0" step="0.01" required disabled={disabled} value={usaDefaultPrice(option)} onChange={e=>patch(index,changeUsaDefault(option,e.target.value))}/></label>
   </div>
   <CountryPrices value={option.countryPrices||[]} label={option.label||`term ${index+1}`} countries={countries} disabled={disabled} onChange={countryPrices=>patch(index,changeCountryPrices(option,countryPrices))}/>
   <button type="button" className="danger" disabled={disabled} onClick={()=>onChange({pricing:options.filter((_,i)=>i!==index)})}>Remove access term</button>
  </article>)}
  <button type="button" className="edit" disabled={disabled} onClick={()=>onChange({pricing:[...options,{label:'',price:'',durationMonths:1,countryPrices:[]}]})}>＋ Add another term</button>
 </section>;
}

export function CountryPrices({value,label,countries,disabled,onChange}:{value:CountryPrice[];label:string;countries:Country[];disabled:boolean;onChange:(prices:CountryPrice[])=>void}){
 const[search,setSearch]=useState(''),matchingCodes=new Set(filterCountries(countries,search).map(country=>country.code));
 const canAdd=countries.some(country=>country.code!=='US'&&!value.some(entry=>entry.country.toUpperCase()===country.code));
 return <div className="countryPrices"><h4>{label} country prices</h4><p>{value.length?'Leave a country total blank to use the default price.':'No country prices added. All countries use the USA/default price.'}</p>
  {value.length>0&&<label>Search countries<input className="field" type="search" aria-label={`Search countries for ${label}`} placeholder="Country name or code" value={search} disabled={disabled||countries.length===0} onChange={event=>setSearch(event.target.value)}/></label>}
  {value.map((entry,index)=>{
   const update=(part:any)=>onChange(value.map((p,i)=>i===index?{...p,...part}:p));
   const missing=entry.country&&!countries.some(c=>c.code===entry.country);
   return <div className="countryPriceRow" key={index}>
    <label>Country<select className="field" aria-label={`Country for ${label} override ${index+1}`} value={entry.country} disabled={disabled||countries.length===0} onChange={e=>update({country:e.target.value})}><option value="">Select country</option>{missing&&<option value={entry.country}>{entry.country}</option>}{countries.filter(country=>country.code===entry.country||country.code!=='US'&&matchingCodes.has(country.code)).map(country=><option key={country.code} value={country.code} disabled={value.some((p,i)=>i!==index&&p.country.toUpperCase()===country.code)}>{country.name} ({country.code})</option>)}</select></label>
    <label>{entry.country==='US'?'USA / default term total (USD)':'Country term total (USD)'}<input className="field" type="number" min="0" step="0.01" placeholder="Use default price" aria-label={`Country total for ${label} override ${index+1}`} value={entry.price??''} disabled={disabled} onChange={e=>update({price:e.target.value})}/></label>
    <button type="button" className="danger" disabled={disabled} onClick={()=>onChange(value.filter((_,i)=>i!==index))}>Remove country price</button>
   </div>;
  })}
  <button type="button" className="edit" disabled={disabled||!canAdd||value.some(entry=>!entry.country)} onClick={()=>onChange([...value,{country:'',price:''}])}>＋ Add country price</button>
 </div>;
}
