/** Never uses the server image optimizer on arbitrary remote URLs. Only current
 * Academy GridFS IDs get width variants; external providers keep their original URL. */
export function academyImageVariants(mapped:string){
 if(!/^\/api\/media\/[a-f0-9]{24}(?:\?|$)/i.test(mapped))return null;
 const u=new URL(mapped,'https://local.invalid');
 const at=(width:number)=>{const next=new URL(u);next.searchParams.set('w',String(width));return next.pathname+next.search;};
 return {src:at(720),srcSet:[240,480,720,1080,1600].map(width=>at(width)+' '+width+'w').join(', ')};
}
export function retryImageSource(src:string){if(!src.startsWith('/')||src.startsWith('//'))return src;const u=new URL(src,'https://local.invalid');u.searchParams.set('sa_image_retry','1');return u.pathname+u.search;}

/** Match the existing three-column course / four-column team grids. Priority is
 * only a network hint and must never imply a full-viewport image. */
export const COURSE_CARD_SIZES='(max-width: 680px) calc(100vw - 56px), (max-width: 1050px) 44vw, 29vw';
export const TEAM_MARQUEE_SIZES='(max-width: 560px) 210px, (max-width: 900px) 230px, 290px';
export const TEAM_CARD_SIZES='(max-width: 600px) calc(100vw - 88px), (max-width: 900px) 42vw, 21vw';
