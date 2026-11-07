import SiteContent from '../models/SiteContent.js';
import {normalizeCountry} from '../utils/countries.js';
import {durationMonths} from '../utils/commerce.js';
import {toMinor} from '../utils/business.js';
import {catalogCache} from './catalogCache.js';

function selectedPrice(option,country,fallback){
 const code=normalizeCountry(country),prices=(option.countryPrices||[]).filter(row=>row.price!==''&&row.price!=null);
 const override=prices.find(row=>code&&normalizeCountry(row.country)===code),usa=prices.find(row=>normalizeCountry(row.country)==='US');
 // Legacy rows may have a US override different from the old base. It is the
 // canonical USA/default total even before an administrator next saves the row.
 return toMinor(override?.price??usa?.price??fallback,{allowZero:true});
}
/** Pure projection of raw stored prices. Call per account AFTER any raw cache read. */
export function regionalOffers(product,country){
 const fallback=durationMonths(product.accessMonths??product.durationMonths??1,'Product access term');
 const options=Array.isArray(product.pricing)?product.pricing:[];
 const base=()=>({key:product.name?'plan':'base',label:product.name||'Default access',amountMinor:selectedPrice(product,country,product.salePrice??product.price),currency:product.currency||'USD',durationMonths:fallback,accessDays:0});
 if(options.length){const offers=options.map((option,index)=>{
  const months=durationMonths(option.durationMonths??(Number(option.accessDays)>0?Math.max(1,Math.ceil(Number(option.accessDays)/30)):fallback),'Price option');
  return {key:String(option.key||index),label:option.label||product.name||'Product access',amountMinor:selectedPrice(option,country,option.price),currency:product.currency||'USD',durationMonths:months,accessDays:Number(option.accessDays)||0};
 });return product.includeBaseOffer===true&&!product.name?[base(),...offers]:offers;}
 return [base()];
}
/** No country map crosses the student/public boundary, including nested options. */
export function publicRegionalProduct(product,country){
 if(!product)return product;
 const raw=typeof product.toObject==='function'?product.toObject():product;
 const {countryPrices,regionalDefault,includeBaseOffer,...out}=raw,offers=regionalOffers(raw,country),baseIncluded=raw.pricing?.length&&raw.includeBaseOffer===true&&!raw.name;
 if(raw.pricing?.length){const optionOffers=baseIncluded?offers.slice(1):offers;out.pricing=raw.pricing.map((option,index)=>{
  const {countryPrices,...safe}=option;return {...safe,key:optionOffers[index].key,price:optionOffers[index].amountMinor/100,durationMonths:optionOffers[index].durationMonths};
 });if(baseIncluded)out.pricing.unshift({key:'base',label:offers[0].label,price:offers[0].amountMinor/100,durationMonths:offers[0].durationMonths});}
 out.price=offers[0].amountMinor/100;if(raw.salePrice!=null)out.salePrice=offers[0].amountMinor/100;
 return out;
}
export async function getMembershipPlans(country,{session=null}={}){
 const load=()=>SiteContent.findOne({key:'membershipPlans'}).session(session).lean();
 const doc=session?await load():await catalogCache.get('membership:raw-plans',load);
 // No invented prices or regional classification: only explicit administrator configuration.
 const plans=Array.isArray(doc?.value)?doc.value:[];
 return plans.filter(plan=>plan.active!==false).map(plan=>publicRegionalProduct(plan,country));
}
