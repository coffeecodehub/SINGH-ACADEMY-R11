export type SectionSuggestion={slug:string;title:string;courseCount:number;offer:{key:string;durationMonths:number;amountMinor:number;currency:string}};

/** Presentation only. The existing section checkout re-quotes the chosen term. */
export function sectionPurchaseSuggestion(slug:string,detail:any,catalog:any,durationMonths?:number):SectionSuggestion|null{
 const section=detail?.section,purchase=catalog?.purchase;
 if(!slug||section?.slug!==slug||section.published!==true||detail.access?.active===true||!Array.isArray(detail.courses)||purchase?.kind!=='section'||purchase.product!==slug||!Array.isArray(purchase.offers))return null;
 const offers=purchase.offers.filter((offer:any)=>typeof offer?.key==='string'&&offer.key.length>0&&Number.isSafeInteger(offer.durationMonths)&&offer.durationMonths>0&&Number.isSafeInteger(offer.amountMinor)&&offer.amountMinor>0&&typeof offer.currency==='string'&&/^[A-Z]{3}$/.test(offer.currency));
 const offer=offers.find((item:any)=>item.durationMonths===durationMonths)||offers[0];
 const courseCount=new Set(detail.courses.filter((course:any)=>course?.published===true&&course.sectionSlug===slug&&typeof course.slug==='string'&&course.slug).map((course:any)=>course.slug)).size;
 if(!offer||!courseCount||typeof section.title!=='string'||!section.title.trim())return null;
 return {slug,title:section.title,courseCount,offer:{key:offer.key,durationMonths:offer.durationMonths,amountMinor:offer.amountMinor,currency:offer.currency}};
}
