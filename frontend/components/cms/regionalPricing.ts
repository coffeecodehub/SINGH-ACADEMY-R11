/** Editor normalization only. The backend remains authoritative for country and checkout pricing. */
export type Country = {code:string;name:string};
export type CountryPrice = {country:string;price:number|string};
export type PricingOption = {key?:string;label:string;price:number|string;durationMonths:number|string;countryPrices?:CountryPrice[];[key:string]:any};
export const COUNTRY_SHORTCUTS=['US','DE','GB','CA','AU','IN','PK','BD','NP','AF'];
/** Selection shortcuts only; these groups never choose or populate a price. */
export const EUROPE_COUNTRY_SHORTCUTS=['AL','AD','AM','AT','AZ','BY','BE','BA','BG','HR','CY','CZ','DK','EE','FI','FR','GE','DE','GR','HU','IS','IE','IT','LV','LI','LT','LU','MT','MD','MC','ME','NL','MK','NO','PL','PT','RO','RU','SM','RS','SK','SI','ES','SE','CH','TR','UA','GB','VA'];
/** Explicit editing groups. Prices exist only after an administrator enters a total and applies it. */
export const PRICE_REGIONS=[
 {key:'africa',label:'Africa',countries:['DZ','AO','BJ','BW','BF','BI','CV','CM','CF','TD','KM','CG','CD','CI','DJ','EG','GQ','ER','SZ','ET','GA','GM','GH','GN','GW','KE','LS','LR','LY','MG','MW','ML','MR','MU','MA','MZ','NA','NE','NG','RW','ST','SN','SC','SL','SO','ZA','SS','SD','TZ','TG','TN','UG','ZM','ZW','EH','YT','RE','SH','IO','TF']},
 {key:'asia',label:'Asia',countries:['AF','AM','AZ','BH','BD','BT','BN','KH','CN','CY','GE','HK','IN','ID','IR','IQ','IL','JP','JO','KZ','KP','KR','KW','KG','LA','LB','MO','MY','MV','MN','MM','NP','OM','PK','PS','PH','QA','SA','SG','LK','SY','TW','TJ','TH','TL','TR','TM','AE','UZ','VN','YE']},
 {key:'latin_america',label:'Latin America & Caribbean',countries:['AR','BO','BR','CL','CO','CR','CU','DO','EC','SV','GT','HT','HN','MX','NI','PA','PY','PE','UY','VE','AG','BS','BB','BZ','DM','GD','GY','JM','KN','LC','VC','SR','TT','AI','AW','BQ','VG','KY','CW','FK','GF','GP','MQ','MS','PR','BL','MF','SX','TC','VI']},
 {key:'western_europe',label:'Western Europe',countries:['AT','BE','FR','DE','LI','LU','MC','NL','CH']}
] as const;
export function expandRegionPrices(entries:CountryPrice[],regionKey:string,total:any,{overwriteExisting=false}={}){
 const region=PRICE_REGIONS.find(item=>item.key===regionKey);if(!region)throw new Error('Choose a valid region.');
 const price=amount(total,`${region.label} total`),current=normalizeCountryPrices(entries),prices=new Map(current.map(row=>[row.country,row]));
 let added=0,replaced=0,preserved=0;
 for(const country of region.countries){
  const existing=prices.get(country);
  if(existing&&!overwriteExisting){preserved++;continue;}
  if(existing){if(existing.price!==price)replaced++;else preserved++;}else added++;
  prices.set(country,{country,price});
 }
 return {countryPrices:[...prices.values()],price,region:region.label,added,replaced,preserved};
}
export function filterCountries(countries:Country[],search:string){
 const key=(value:string)=>value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim(),term=key(search);
 return countries.filter(country=>!term||key(country.name).includes(term)||country.code.toLowerCase().includes(term)||(country.code==='US'&&'usa united states of america'.includes(term))||(country.code==='GB'&&'uk great britain'.includes(term)));
}
export function usaDefaultPrice(value:{price?:number|string;countryPrices?:CountryPrice[]}){
 const usa=value.countryPrices?.find(row=>String(row.country).toUpperCase()==='US'&&row.price!==''&&row.price!=null);
 return usa?.price??value.price??'';
}
export function changeUsaDefault(value:{countryPrices?:CountryPrice[]},price:number|string){
 return {price,currency:'USD',...(value.countryPrices?.some(row=>row.country.toUpperCase()==='US')?{countryPrices:value.countryPrices.map(row=>row.country.toUpperCase()==='US'?{...row,price}:row)}:{})};
}
export function changeCountryPrices(value:{price?:number|string;countryPrices?:CountryPrice[]},countryPrices:CountryPrice[]){
 // Removing an old US override keeps its last explicitly entered USA total.
 return {countryPrices,price:usaDefaultPrice({price:usaDefaultPrice(value),countryPrices})};
}
function amount(value:any,label:string){
 if(value===''||value===null||value===undefined)throw new Error(`${label} is required.`);
 const n=Number(value);
 if(!Number.isFinite(n)||n<0||n>999999999||Math.abs(n*100-Math.round(n*100))>0.000001)throw new Error(`${label} must be a USD amount with at most two decimal places.`);
 return n;
}
export function months(value:any,label='Access term'){
 const n=Number(value);
 if(!Number.isInteger(n)||n<1||n>120)throw new Error(`${label} must be a whole number from 1 to 120 months.`);
 return n;
}
export function normalizeCountryPrices(entries:CountryPrice[]=[],label='Default term'){
 const seen=new Set<string>();
 return entries.filter(p=>p.price!==''&&p.price!=null).map(p=>{
  const country=String(p.country||'').trim().toUpperCase();
  if(!/^[A-Z]{2}$/.test(country))throw new Error(`Select a country for every override in ${label}.`);
  if(seen.has(country))throw new Error(`${label} has more than one price for ${country}.`);
  seen.add(country);return {country,price:amount(p.price,`${label}: ${country} total`)};
 });
}
export function normalizeRegionalPricing(value:any){
 const pricing=(value.pricing||[]).map((option:PricingOption,index:number)=>{
  if(option.key==='base')throw new Error('The access term key "base" is reserved for the default term. Remove this additional term and add it again before saving.');
  const label=String(option.label||'').trim();
  if(!label||label.length>120)throw new Error(`Option ${index+1} needs a label of 1–120 characters.`);
  const countryPrices=normalizeCountryPrices(option.countryPrices,label);
  return {...option,label,price:amount(usaDefaultPrice({...option,countryPrices}),`${label} USA/default total`),durationMonths:months(option.durationMonths,`${label} duration`),countryPrices};
 });
 const countryPrices=normalizeCountryPrices(value.countryPrices);
 return {currency:'USD',includeBaseOffer:true,price:amount(usaDefaultPrice({...value,countryPrices}),'USA/default price'),accessMonths:months(value.accessMonths??1),countryPrices,pricing};
}
