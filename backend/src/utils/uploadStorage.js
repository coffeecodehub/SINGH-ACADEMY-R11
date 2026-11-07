/** A storage operation must settle even when MongoDB stops accepting chunks.
 * Active file transfer has no duration limit; this covers the subsequent commit. */
export function uploadStorageTimeout(bytes){return Math.min(10*60*1000,Math.max(60000,Math.ceil(Number(bytes||0)/(512*1024))*1000));}
export function uploadStorageFailure(error){
 return /Mongo.*(?:Timeout|Network|ServerSelection)|AbortError/.test(error?.name||'')||/timed? ?out/i.test(error?.message||'');
}
/** A GridFS stream whose CSOT expired cannot use that expired context to abort.
 * Cleanup gets its own short budget and never touches another upload's files. */
export async function removeIncompleteAdminUpload(db,id){
 await Promise.all([db.collection('academyMedia.files').deleteOne({_id:id},{timeoutMS:10000}),db.collection('academyMedia.chunks').deleteMany({files_id:id},{timeoutMS:10000})]);
}
