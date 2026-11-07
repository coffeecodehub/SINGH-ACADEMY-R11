/** Display only server-selected USD totals. Country selection and discounts belong to the backend. */
export type CatalogOffer={key:string;label:string;price:number;durationMonths:number;currency:string};
export function catalogOffers(product:any):CatalogOffer[]{
 if(!product||product.accessType==='free'||product.accessType==='membership')return [];
 const currency=product.currency||'USD';
 const options=Array.isArray(product.offers)?product.offers:Array.isArray(product.pricing)&&product.pricing.length?product.pricing:[{key:'base',label:'',price:product.salePrice??product.price,durationMonths:product.durationMonths??product.accessMonths??(product.period==='year'?12:1)}];
 return options.flatMap((option:any,index:number)=>{
  const minor=option.amountMinor,raw=minor!==undefined?(Number.isSafeInteger(minor)?minor/100:undefined):option.price;
  const price=Number(raw),durationMonths=Number(option.durationMonths);
  if(raw==null||raw===''||!Number.isFinite(price)||price<0||!Number.isInteger(durationMonths)||durationMonths<1||durationMonths>120)return [];
  return [{key:String(option.key??index),label:typeof option.label==='string'?option.label:'',price,durationMonths,currency:option.currency||currency}];
 });
}
export function accessTerm(months:number){return `${months} month${months===1?'':'s'}`;}
export function catalogCheckout(kind:'course'|'section'|'membership',product:string,optionKey?:string){
 const query=new URLSearchParams({[kind==='membership'?'plan':kind]:product});
 if(optionKey!==undefined)query.set('option',optionKey);
 return '/checkout?'+query.toString();
}
/** Courses assigned to a section are discovered inside that section. */
export function standaloneCourses(courses:any[]){return courses.filter(course=>!String(course.sectionSlug||'').trim());}
