/** HTTP is allowed only for explicit local smoke tests; hosted targets still require HTTPS. */
export function validateDeploymentOrigins(front,api,local=false){
 if(!front||!api)throw new Error('Supply both --front and --api origins.');
 const values=[front,api].map(value=>{const url=new URL(value);if(url.origin!==value||url.username||url.password)throw new Error('Use exact origins without paths or credentials.');return url;});
 const loopback=url=>['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 const localPair=local&&values.every(loopback);
 for(const url of values)if(url.protocol!=='https:'&&!(localPair&&url.protocol==='http:'))throw new Error('Hosted checks require HTTPS. For two loopback HTTP origins, add --local.');
 return {front:values[0].origin,api:values[1].origin};
}
