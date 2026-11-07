import {fileURLToPath} from 'node:url';
import {configureLocalUploads} from '../utils/localUploads.js';
const args=process.argv.slice(2),target=fileURLToPath(new URL('../../.env',import.meta.url));
try{
 if(args.some(arg=>arg!=='--apply'))throw new Error('Use npm run uploads:local -- --apply.');
 const result=configureLocalUploads({target,apply:args.includes('--apply')});
 console.log(JSON.stringify({mode:'localhost-development-only',...result,privateValuesPrinted:false},null,2));
 console.log(result.applied?'Local upload configuration is ready. Stop and restart the backend from this fresh terminal. Originals still receive file-type checks; development media is not malware-scanned. Configure a real scanner before hosting.':'Read-only local upload check passed. To apply the local-only settings with a private backup, run npm run uploads:local -- --apply.');
}catch(error){console.error(error.code==='ENOENT'?'Run npm run setup first to create backend/.env.':error.message);process.exitCode=1;}
