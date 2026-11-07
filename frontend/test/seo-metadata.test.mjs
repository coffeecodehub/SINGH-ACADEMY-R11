import test from 'node:test';
import assert from 'node:assert/strict';
import {compileModule} from './compile.mjs';
const metadata=compileModule('../lib/siteMetadata.ts');
test('public canonical origin requires an explicit safe HTTPS origin',()=>{
 assert.equal(metadata.publicSiteOrigin('https://academy.example/'),'https://academy.example');
 for(const value of ['',undefined,'http://academy.example','https://user:secret@academy.example','https://academy.example/other','https://academy.example/?x=1','javascript:alert(1)'])assert.equal(metadata.publicSiteOrigin(value),undefined);
});
test('sitemap includes only public documents and never guesses a domain',()=>{
 const m=compileModule('../lib/publicMetadata.ts',{imports:{'./siteMetadata':metadata}});
 assert.doesNotMatch(m.sitemapXml(''),/<url>/);
 const rows=[...m.sitemapXml('https://academy.example').matchAll(/<loc>(.*?)<\/loc>/g)].map(row=>row[1]);
 assert.deepEqual(rows,['https://academy.example/','https://academy.example/video-reviews','https://academy.example/terms','https://academy.example/privacy']);
});
test('ordinary metadata routes serve real HTTP bodies without the Windows metadata loader',async()=>{
 const m=compileModule('../lib/publicMetadata.ts',{imports:{'./siteMetadata':{publicSiteOrigin:()=> 'https://academy.example'}}});
 const robots=compileModule('../app/robots.txt/route.ts',{imports:{'../../lib/publicMetadata':m}}).GET();
 const body=await robots.text();assert.match(robots.headers.get('Content-Type'),/text\/plain/);
 assert.ok(body.includes('Sitemap: https://academy.example/sitemap.xml'));
 for(const route of ['/checkout','/billing','/learn/','/api/','/admin'])assert.ok(body.includes('Disallow: '+route));
 const sitemap=compileModule('../app/sitemap.xml/route.ts',{imports:{'../../lib/publicMetadata':m}}).GET();
 assert.match(sitemap.headers.get('Content-Type'),/application\/xml/);assert.match(await sitemap.text(),/<loc>https:\/\/academy.example\//);
});
