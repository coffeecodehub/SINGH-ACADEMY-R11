export type PageGalleryImage={id:string;imageUrl:string;imageAlt:string;imageFileId?:string|null;originalUrl?:string;originalFileId?:string|null;imageEdit?:any;title:string;description:string;imageFit:'cover'|'contain';positionX:number;positionY:number};
export type PageSectionPlacement='start'|'after-hero'|'after-catalog'|'end';
export const PAGE_SECTION_PLACEMENTS=[['start','Before the page introduction'],['after-hero','After the page introduction'],['after-catalog','After the learning sections'],['end','Before the footer']] as const;
export const GALLERY_LAYOUTS=[['grid','Responsive grid'],['masonry','Masonry'],['justified','Justified rows'],['portfolio','Portfolio'],['single','Single image viewer'],['carousel','Carousel']] as const;
export function pageHasContentAnchors(path:string){return ['/', '/home','/about'].includes(path.replace(/\/$/,'')||'/');}
export function blankGalleryImage():PageGalleryImage{return {id:crypto.randomUUID(),imageUrl:'',imageAlt:'',title:'',description:'',imageFit:'cover',positionX:50,positionY:50};}
export type PageContentBlock={id:string;placement?:PageSectionPlacement;galleryLayout?:'grid'|'masonry'|'justified'|'portfolio'|'single'|'carousel';columns?:number;imageAspect?:'original'|'4:3'|'1:1'|'3:4'|'16:9';gallery?:PageGalleryImage[];type:'text'|'image'|'video'|'call-to-action'|'gallery';title:string;description:string;imageUrl:string;imageAlt:string;imageFileId?:string|null;imageFit:'contain'|'cover';videoUrl:string;videoFileId?:string|null;buttonLabel:string;buttonUrl:string;layout:'stack'|'split';align:'left'|'center';theme:'cream'|'white'|'dark';published:boolean;order?:number};
export const CONTENT_PAGES=[['/','Public landing'],['/home','Student home'],['/about','About'],['/academy','Academy'],['/courses','Courses'],['/sections','Course sections'],['/team','Team'],['/events','Events'],['/contact','Contact'],['/reviews','Reviews'],['/book','Book']] as const;
export function contentPageKey(path:string){
 if(path==='/')return 'landing';
 const clean=path.replace(/^\/+|\/+$/g,'');
 if(!/^[a-z][a-z0-9-]*(?:\/[a-z0-9-]+)*$/.test(clean)||/^(?:admin|super-admin|api|checkout|billing|learn|login|register|reset-password)(?:\/|$)/.test(clean))return null;
 const key=clean.split('/').join('--');return key.length<=100?key:null;
}
export function blankPageBlock(type:PageContentBlock['type']='text'):PageContentBlock{return {placement:'end',galleryLayout:'grid',columns:3,imageAspect:'4:3',gallery:[],id:crypto.randomUUID(),type,title:'',description:'',imageUrl:'',imageAlt:'',imageFileId:null,imageFit:'contain',videoUrl:'',videoFileId:null,buttonLabel:'',buttonUrl:'',layout:'stack',align:'left',theme:'cream',published:false};}
