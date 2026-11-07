/** A login return target is navigation, never evidence of authentication.
 * Decode only for validation; preserve encoded query/hash values for the route. */
export function safeStudentNext(value:string|null|undefined):string{
 try{
  if(typeof value!=='string'||value.length>2000||!value.startsWith('/')||value.startsWith('//'))return '/home';
  let decoded=value;for(let i=0;i<3;i++){const next=decodeURIComponent(decoded);if(next===decoded)break;decoded=next;}
  if(/[\\\u0000-\u0020]/.test(value)||/[\\\u0000-\u001f\u007f]/.test(decoded)||decoded.startsWith('//'))return '/home';
  const base='https://academy.invalid',check=new URL(decoded,base),target=new URL(value,base);
  if(check.origin!==base||target.origin!==base||/[\u0000-\u0020]/.test(check.pathname))return '/home';
  const denied=/^\/(?:admin|super-admin|api|_next|login|register|forgot-password|reset-password|verify-otp|connection)(?:\/|$)/i;
  if(denied.test(check.pathname)||denied.test(target.pathname))return '/home';
  if(target.pathname==='/'){
   // Landing anchors become the relevant signed-in destination, not a loop back
   // to the guest landing after a successful login.
   const hash=target.hash.toLowerCase();
   if(hash.includes('course'))return '/courses';
   if(hash.includes('team'))return '/team';
   if(hash.includes('review'))return '/reviews';
   if(hash.includes('plan')||hash.includes('pricing')||hash.includes('membership'))return '/academy';
   if(hash.includes('event'))return '/events';
   if(hash.includes('contact'))return '/contact';
   return '/home';
  }
  return target.pathname+target.search+target.hash;
 }catch{return '/home';}
}
