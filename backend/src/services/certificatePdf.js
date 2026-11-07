import fs from 'node:fs';
import {businessError} from '../utils/business.js';
import {assemblePdf,pdfStream} from '../utils/pdfWriter.js';
const widths=JSON.parse(fs.readFileSync(new URL('../assets/certificate-theme-font-metrics.json',import.meta.url),'utf8'));
export const certificateTheme=Object.freeze(JSON.parse(fs.readFileSync(new URL('../assets/certificate-theme-v608.json',import.meta.url),'utf8')));
const artwork=fs.readFileSync(new URL('../assets/certificate-theme-v608.rgb.deflate',import.meta.url));
const extras=new Map([['€',128],['‚',130],['ƒ',131],['„',132],['…',133],['†',134],['‡',135],['ˆ',136],['‰',137],['Š',138],['‹',139],['Œ',140],['Ž',142],['‘',145],['’',146],['“',147],['”',148],['•',149],['–',150],['—',151],['˜',152],['™',153],['š',154],['›',155],['œ',156],['ž',158],['Ÿ',159]]);
export function certificateText(value,label='Certificate text'){
 if(typeof value!=='string'||!value.trim()||value.length>250||/[\x00-\x1f\x7f]/.test(value))throw businessError(`${label} is missing or too long.`,400);
 const text=value.trim().normalize('NFC'),bytes=[];for(const char of text){const code=char.codePointAt(0);if((code>=32&&code<=126)||(code>=160&&code<=255))bytes.push(code);else if(extras.has(char))bytes.push(extras.get(char));else throw businessError(`${label} contains characters this certificate font cannot print. Enter an approved Latin-script display spelling; do not change the student account name.`,400);}return {text,bytes:Buffer.from(bytes)};
}
function literal(value){return '('+[...certificateText(value).bytes].map(b=>b===40||b===41||b===92?'\\'+String.fromCharCode(b):b>=128?'\\'+b.toString(8).padStart(3,'0'):String.fromCharCode(b)).join('')+')';}
const width=(text,font,size)=>[...certificateText(text).bytes].reduce((sum,b)=>sum+(widths[font]?.[String(b)]??600),0)*size/1000;
function wrapWords(text,font,size,maxWidth){const lines=[];let line='';for(const word of text.split(/\s+/)){const candidate=line?line+' '+word:word;if(line&&width(candidate,font,size)>maxWidth){lines.push(line);line=word;}else line=candidate;}if(line)lines.push(line);return lines;}
function fitBlock(text,font,maxSize,minSize,maxWidth,maxLines=2){
 // Prefer the reference's single-line layout; use two lines only for longer real data.
 for(let size=maxSize;size>=Math.max(minSize,maxSize*.78);size-=.5)if(width(text,font,size)<=maxWidth)return {size,lines:[text]};
 for(let size=maxSize*.78;size>=minSize;size-=.5){const lines=wrapWords(text,font,size,maxWidth);if(lines.length<=maxLines&&lines.every(line=>width(line,font,size)<=maxWidth))return {size,lines};}
 throw businessError('Certificate text is too wide. Use a shorter approved display name or course title; the account record will not be changed.',400);
}
function dateText(value){if(value===null||value===undefined||value===''||typeof value==='boolean')throw businessError('Certificate date is missing.',400);const d=new Date(value);if(!Number.isFinite(d.getTime()))throw businessError('Certificate date is invalid.',400);return d.toLocaleDateString('en-US',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});}
/** All courses use one approved master. Artwork contains no student/course/serial/date data.
 * Existing issued PDFs stay immutable; only newly approved completions call this renderer. */
export function createCertificatePdf({studentName,courseTitle,completedAt,issuedAt,issuedBy,number,verificationUrl,sample=false}){
 const name=certificateText(studentName,'studentName').text,title=certificateText(courseTitle,'courseTitle').text,serial=certificateText(number,'number').text;
 certificateText(issuedBy,'issuedBy');
 const completed=dateText(completedAt),issued=dateText(issuedAt);
 let url;try{url=new URL(verificationUrl);}catch{throw businessError('Invalid certificate verification URL.',400);}
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw businessError('Invalid certificate verification URL.',400);
 // A4 landscape, without stretching the source's approved near-A4 composition.
 const W=841.89,H=595.28,sx=W/certificateTheme.width,sy=H/certificateTheme.height,ops=[];
 const face={'Times-Roman':'F1','Times-Bold':'F2','Helvetica':'F3','Helvetica-Bold':'F4'};
 const text=(value,x,y,size,font='Times-Roman',invisible=false)=>ops.push(`BT /${face[font]} ${size.toFixed(2)} Tf ${invisible?'3':'0'} Tr 0.13 0.11 0.075 rg 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm ${literal(value)} Tj ET`);
 const center=(value,baselinePx,size,font)=>text(value,(W-width(value,font,size))/2,H-baselinePx*sy,size,font);
 ops.push(`q ${W} 0 0 ${H} 0 0 cm /ThemeArtwork Do Q`);
 // Searchable equivalents of the fixed captions already painted in the artwork.
 for(const [caption,x,y,size,font] of [
  ['SINGH ACADEMY',590,148,17,'Times-Bold'],['CERTIFICATE OF COMPLETION',328,231,31,'Times-Roman'],
  ['This certificate is proudly presented to',554,315,14,'Times-Roman'],['for completing the required lessons in',554,501,14,'Times-Roman'],
  ['Completion acknowledged and certificate issued by Singh Academy.',407,652,14,'Times-Roman'],
  ['COMPLETED',110,751,9,'Times-Bold'],['ISSUED',591,751,9,'Times-Bold'],['CERTIFICATE NO.',110,845,9,'Times-Bold'],
  ['AUTHORIZED BY',998,751,9,'Times-Bold'],['Authorized Signature - Singh Academy',998,886,11,'Times-Roman'],['Verify certificate online',658,850,11,'Times-Roman']
 ])text(caption,x*sx,H-y*sy,size,font,true);
 const fittedName=fitBlock(name,'Times-Roman',39,16,530);
 const nameStart=fittedName.lines.length===1?426:386;
 fittedName.lines.forEach((line,i)=>center(line,nameStart+i*39,fittedName.size,'Times-Roman'));
 const fittedTitle=fitBlock(title,'Times-Bold',31,15,590);
 const titleStart=fittedTitle.lines.length===1?579:554;
 fittedTitle.lines.forEach((line,i)=>center(line,titleStart+i*45,fittedTitle.size,'Times-Bold'));
 text(completed,110*sx,H-789*sy,14);
 text(issued,591*sx,H-789*sy,14);
 let serialSize=12;while(width(serial,'Times-Roman',serialSize)>220&&serialSize>8)serialSize-=.5;
 if(width(serial,'Times-Roman',serialSize)>220)throw businessError('Certificate number is too long.',400);
 text(serial,111*sx,H-876*sy,serialSize);
 if(sample){ops.push('q 0.62 0.10 0.09 rg');text('SAMPLE - NOT AN ISSUED CERTIFICATE',64,41,7,'Helvetica-Bold');ops.push('Q');}
 const linkRect=[635*sx,H-860*sy,891*sx,H-827*sy].map(n=>n.toFixed(2)).join(' ');
 const sealRect=[650*sx,H-1030*sy,842*sx,H-860*sy].map(n=>n.toFixed(2)).join(' ');
 const link=rect=>`<< /Type /Annot /Subtype /Link /Rect [${rect}] /Border [0 0 0] /A << /S /URI /URI ${literal(url.href)} >> >>`;
 return assemblePdf([
  '<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 4 0 R /F2 5 0 R /F3 6 0 R /F4 7 0 R >> /XObject << /ThemeArtwork 8 0 R >> >> /Contents 9 0 R /Annots [10 0 R 11 0 R] >>`,
  '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman /Encoding /WinAnsiEncoding >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold /Encoding /WinAnsiEncoding >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  pdfStream(artwork,`/Type /XObject /Subtype /Image /Width ${certificateTheme.width} /Height ${certificateTheme.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode`),
  pdfStream(Buffer.from(ops.join('\n'),'ascii')),link(linkRect),link(sealRect),
  `<< /Title ${literal('Certificate of Completion - '+serial)} /Author (Singh Academy) /Producer ${literal('Singh Academy Certificate Service - '+certificateTheme.id)} >>`
 ]);
}
