/** Types for synthetic browser-test imagery only. */
export const CATALOG_PHOTO_PATH:string;
export const CATALOG_PHOTO_WIDTHS:readonly number[];
export const CATALOG_PHOTO_ORIGINAL_WIDTH:number;
export function catalogPhotoPng(width:number):Buffer;
export function catalogPhotoResponse(address:string):{
 status:number;contentType:string;headers:Record<string,string>;body:Buffer;
};
