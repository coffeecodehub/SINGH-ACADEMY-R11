import fs from 'node:fs';import {pathToFileURL} from 'node:url';
const root=process.argv[2];const {compileModule}=await import(pathToFileURL(root+'/frontend/test/compile.mjs'));
const {retiredNotFoundResponse}=compileModule('../lib/server/retiredNotFound.ts');
const response=retiredNotFoundResponse();const updated=await response.text();
const css=fs.readFileSync(root+'/frontend/app/styles.css','utf8');
const main='<main class="siteStatus"><p>404</p><h1>Page not found</h1><p>This address may have changed. Your academy is still here.</p><a class="button" href="/">Return to Singh Academy</a></main>';
console.log(JSON.stringify({scope:'Static HTML for visual comparison only, not framework navigation',updated,baseline:'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>'+css+'</style></head><body>'+main+'</body></html>'}));
