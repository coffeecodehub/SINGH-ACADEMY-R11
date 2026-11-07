/** Quoting alone does not prevent Excel from interpreting a cell as a formula. */
export function csvCell(value){
 let text=String(value??'').replace(/\u0000/g,'');
 if(/^[\s\uFEFF]*[=+@-]/.test(text)||/^[\t\r\n]/.test(text))text="'"+text;
 return '"'+text.replace(/"/g,'""')+'"';
}
function registeredAt(value){const date=value?new Date(value):null;return date&&Number.isFinite(+date)?date.toISOString():'';}
export const studentCsvHeader=['Name','Email','Phone','Country','Registration date (UTC)','Status'].map(csvCell).join(',')+'\r\n';
export function studentCsvRow(user){return [user.name,user.email,user.phone,user.country,registeredAt(user.createdAt),user.status].map(csvCell).join(',')+'\r\n';}
