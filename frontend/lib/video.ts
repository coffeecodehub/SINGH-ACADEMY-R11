export type VideoSource={kind:'embed'|'native'|'external';src:string;provider:string};

const cleanHost=(host:string)=>host.toLowerCase().replace(/^www\./,'');
const videoExt=/\.(?:mp4|webm|ogg|ogv|mov|m4v)(?:$|[?#])/i;
function safeUrl(raw:string){try{return new URL(raw,typeof window==='undefined'?'https://academy.invalid':window.location.origin)}catch{return null}}
function firstMatch(parts:string[],rx:RegExp){return parts.find(x=>rx.test(x))||''}
function twitchParent(){return typeof window!=='undefined'&&window.location.hostname?window.location.hostname:'singhacademy.com'}

/**
 * Convert common public video/social links into safe player URLs.
 * Any other HTTP(S) page is intentionally retained as an external link so an
 * instructor can still use providers that do not permit third-party embeds.
 */
export function resolveVideoSource(raw:string=''):VideoSource|null{
 const value=String(raw||'').trim();if(!value)return null;
 if(value.startsWith('/api/media/')||value.startsWith('blob:'))return {kind:'native',src:value.split('#')[0],provider:'upload'};
 if(videoExt.test(value)&&value.startsWith('/')&&!value.startsWith('//'))return {kind:'native',src:value.split('#')[0],provider:'direct'};
 const u=safeUrl(value);if(!u||!['http:','https:'].includes(u.protocol)||u.username||u.password)return null;const host=cleanHost(u.hostname),parts=u.pathname.split('/').filter(Boolean);
 if(host==='youtu.be'||host==='youtube.com'||host.endsWith('.youtube.com')||host==='youtube-nocookie.com'||host.endsWith('.youtube-nocookie.com')){
  let id='';if(host==='youtu.be')id=parts[0]||'';else if(parts[0]==='watch')id=u.searchParams.get('v')||'';else if(['embed','shorts','live'].includes(parts[0]))id=parts[1]||'';else id=u.searchParams.get('v')||'';
  if(id){const q=new URLSearchParams({rel:'0',playsinline:'1',start:'0',autoplay:'0'});return {kind:'embed',src:`https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?${q}`,provider:'youtube'};}
 }
 if(host==='vimeo.com'||host.endsWith('.vimeo.com')){
  const id=firstMatch(parts,/^\d+$/);if(id){const pos=parts.indexOf(id),pathHash=parts[pos+1]&&/^[a-z0-9]{6,}$/i.test(parts[pos+1])?parts[pos+1]:'',hash=u.searchParams.get('h')||pathHash;const q=new URLSearchParams();if(hash)q.set('h',hash);let src=`https://player.vimeo.com/video/${id}${q.toString()?`?${q}`:''}`;src+=(q.toString()?'&':'?')+'autoplay=0#t=0s';return {kind:'embed',src,provider:'vimeo'};}
 }
 if(host==='tiktok.com'||host.endsWith('.tiktok.com')){
  const marker=parts.indexOf('video'),player=parts.indexOf('v1'),id=(marker>=0?parts[marker+1]:player>=0?parts[player+1]:'');if(/^\d+$/.test(id||''))return {kind:'embed',src:`https://www.tiktok.com/player/v1/${id}?controls=1&autoplay=0`,provider:'tiktok'};
 }
 if(host==='instagram.com'||host.endsWith('.instagram.com')){
  const kind=parts[0]==='reels'?'reel':parts[0],code=parts[1]||'';if(['p','reel','tv'].includes(kind)&&code)return {kind:'embed',src:`https://www.instagram.com/${kind}/${encodeURIComponent(code)}/embed/`,provider:'instagram'};
 }
 if(host==='facebook.com'||host.endsWith('.facebook.com')||host==='fb.watch'){
  if(['http:','https:'].includes(u.protocol)){u.searchParams.delete('t');u.searchParams.delete('start');u.hash='';const href=encodeURIComponent(u.href);return {kind:'embed',src:`https://www.facebook.com/plugins/video.php?href=${href}&show_text=false&width=1280&autoplay=false`,provider:'facebook'};}
 }
 if(host==='ted.com'||host.endsWith('.ted.com')){
  if(host==='embed.ted.com'){u.search='';u.hash='';return {kind:'embed',src:u.href,provider:'ted'};}const i=parts.indexOf('talks');if(i>=0&&parts[i+1])return {kind:'embed',src:`https://embed.ted.com/talks/${encodeURIComponent(parts[i+1])}`,provider:'ted'};
 }
 if(host==='dailymotion.com'||host==='dai.ly'){
  const id=host==='dai.ly'?(parts[0]||''):(parts[0]==='video'?parts[1]||'':'');if(id)return {kind:'embed',src:`https://www.dailymotion.com/embed/video/${encodeURIComponent(id)}`,provider:'dailymotion'};
 }
 if(host==='loom.com'||host.endsWith('.loom.com')){
  const i=parts.findIndex(x=>['share','embed'].includes(x)),id=i>=0?parts[i+1]||'':'';if(id)return {kind:'embed',src:`https://www.loom.com/embed/${encodeURIComponent(id)}`,provider:'loom'};
 }
 if(host==='streamable.com'||host.endsWith('.streamable.com')){
  const id=parts[0]==='e'?parts[1]:parts[0];if(id)return {kind:'embed',src:`https://streamable.com/e/${encodeURIComponent(id)}`,provider:'streamable'};
 }
 if(host==='wistia.com'||host.endsWith('.wistia.com')||host==='wi.st'){
  const media=parts.indexOf('medias'),embed=parts.indexOf('embed'),id=(media>=0?parts[media+1]:embed>=0?parts[embed+1]:parts.at(-1))||'';if(/^[a-z0-9]+$/i.test(id))return {kind:'embed',src:`https://fast.wistia.net/embed/iframe/${encodeURIComponent(id)}`,provider:'wistia'};
 }
 if(host==='share.vidyard.com'||host==='play.vidyard.com'||host.endsWith('.vidyard.com')){
  const watch=parts.indexOf('watch'),id=(watch>=0?parts[watch+1]:parts[0])||'';if(/^[A-Za-z0-9_-]+$/.test(id))return {kind:'embed',src:`https://play.vidyard.com/${encodeURIComponent(id)}.html`,provider:'vidyard'};
 }
 if(host==='twitch.tv'||host.endsWith('.twitch.tv')){
  const parent=encodeURIComponent(twitchParent());
  if(host==='clips.twitch.tv'){const slug=parts[0]||'';if(slug)return {kind:'embed',src:`https://clips.twitch.tv/embed?clip=${encodeURIComponent(slug)}&parent=${parent}&autoplay=false`,provider:'twitch'};}
  const videoIndex=parts.indexOf('videos'),videoId=videoIndex>=0?parts[videoIndex+1]:'';if(/^\d+$/.test(videoId||''))return {kind:'embed',src:`https://player.twitch.tv/?video=v${videoId}&parent=${parent}&autoplay=false&time=0s`,provider:'twitch'};
  const channel=parts[0]||'';if(channel&&!['directory','downloads','jobs','p'].includes(channel))return {kind:'embed',src:`https://player.twitch.tv/?channel=${encodeURIComponent(channel)}&parent=${parent}&autoplay=false`,provider:'twitch'};
 }
 if(['http:','https:'].includes(u.protocol)&&videoExt.test(u.pathname)){u.hash='';return {kind:'native',src:u.href,provider:'direct'};}
 if(['http:','https:'].includes(u.protocol))return {kind:'external',src:u.href,provider:'external'};
 return null;
}

export function autoplayVideoSource(source:VideoSource){if(source.kind!=='embed')return source.src;try{const u=new URL(source.src);if(['youtube','vimeo','tiktok'].includes(source.provider))u.searchParams.set('autoplay','1');return u.href}catch{return source.src}}
