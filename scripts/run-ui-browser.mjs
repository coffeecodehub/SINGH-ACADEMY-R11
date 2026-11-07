/** Browser runner with honest exit status, including unexpected Next JSON errors. */
import fs from 'node:fs';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';
const frontend=fileURLToPath(new URL('../frontend/',import.meta.url));
const cli=frontend+'node_modules/@playwright/test/cli.js';
if(!fs.existsSync(cli))throw Error('Project Playwright is not installed. Run npm run install:all first.');
const result=spawnSync(process.execPath,[cli,'test','-c','playwright.ui.config.ts',...process.argv.slice(2)],{cwd:frontend,env:process.env,stdio:'inherit'});
if(result.error)throw result.error;
let code=result.status??1;
const log=frontend+'qa/ui-runtime-errors.log';
if(fs.existsSync(log)&&fs.readFileSync(log,'utf8').trim()){
 console.error('Unexpected Next runtime/manifest errors were detected. Review frontend/qa/ui-runtime-errors.log. This run is not a clean pass.');code=1;
}
process.exitCode=code;
