import './styles.css';
import {publicSiteOrigin,SITE_TITLE,SITE_DESCRIPTION} from '../lib/siteMetadata';
import {WebsiteContentProvider} from '../components/WebsiteContent';
import {Suspense} from 'react';
import {headers} from 'next/headers';
import {AuthProvider} from '../components/auth/AuthProvider';
import SiteAccessGate from '../components/auth/SiteAccessGate';
import NavigationFeedback from '../components/NavigationFeedback';
import CatalogWarmup from '../components/CatalogWarmup';
import {SNAPSHOT_HEADER} from '../lib/server/pageSession';
import {prefetchWebsiteContent,prefetchPublicPageContent} from '../lib/server/publicWebsiteContent';
import {PublicInitialDataProvider} from '../components/PublicInitialData';
import AccountFeedback from '../components/feedback/AccountFeedback';
export const dynamic='force-dynamic';
const siteOrigin=publicSiteOrigin();
export const metadata={title:SITE_TITLE,description:SITE_DESCRIPTION,...(siteOrigin?{metadataBase:new URL(siteOrigin)}:{}),openGraph:{title:SITE_TITLE,description:SITE_DESCRIPTION,type:'website',locale:'en_US',siteName:'Singh Academy',...(siteOrigin?{url:siteOrigin,images:[{url:'/singh-academy-logo-clean.png',alt:'Singh Academy'}]}:{})},twitter:{card:'summary',title:SITE_TITLE,description:SITE_DESCRIPTION}};
export default async function RootLayout({children}:{children:React.ReactNode}){
 const incoming=await headers(),raw=incoming.get(SNAPSHOT_HEADER);let initialSession=null;
 try{if(raw)initialSession=JSON.parse(decodeURIComponent(raw));}catch{}
 const [initialConfig,initialPublicData]=await Promise.all([prefetchWebsiteContent(incoming),prefetchPublicPageContent(incoming.get('x-sa-public-content-page'),incoming)]);
 return <html lang="en" data-scroll-behavior="smooth"><body><AuthProvider initialSession={initialSession}><AccountFeedback><Suspense fallback={null}><NavigationFeedback/></Suspense><SiteAccessGate><WebsiteContentProvider {...(initialConfig?{initialConfig}:{})}><PublicInitialDataProvider initialData={initialPublicData}><Suspense fallback={<div role="status" style={{padding:40}}>Loading Singh Academy…</div>}>{children}</Suspense><CatalogWarmup/></PublicInitialDataProvider></WebsiteContentProvider></SiteAccessGate></AccountFeedback></AuthProvider></body></html>;
}
