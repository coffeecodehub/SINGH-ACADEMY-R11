// Larger bounded chunks reduce per-write database round trips for large video
// originals on remote MongoDB. GridFS records chunkSize on each file, so old
// files and Range playback keep their original layout. Student/receipt/image
// policies and signature/scanner gates remain separate.
export function adminVideoStorageOptions(adminMedia,mime){
 return adminMedia===true&&/^video\/(mp4|webm|quicktime)$/.test(mime||'')?{chunkSizeBytes:4*1024*1024}:{};
}
