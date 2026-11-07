'use client';
import PageSections from '../../components/content/PageSections';
import {useWebsiteContent,websiteText} from '../../components/WebsiteContent';
import AcademyImage from '../../components/AcademyImage';
import {usePublicResource} from '../../lib/usePublicResource';
import {useCatalogAccess} from '../../lib/useCatalogAccess';
import ApiLoadError from '../../components/ApiLoadError';
import SiteHeader from '../../components/SiteHeader';
import SiteFooter from '../../components/layout/SiteFooter';
import FounderProfile from '../../components/content/FounderProfile';
import CatalogCard from '../../components/catalog/CatalogCard';
import {learningPhotoProps} from '../../lib/learningPhotos';

export default function Home(){
 const website=useWebsiteContent();
 const {data:sections,loading,error,retry}=usePublicResource('/sections','sections');
 const access=useCatalogAccess();
 return <main><SiteHeader/><PageSections placement="start"/><section className="storeHero"><div><span className="kicker">SINGH ACADEMY SECTIONS</span><h1>{websiteText(website,'home-002','Learn practical skills for conversations that matter.')}</h1><p>Explore a published learning section, review its courses and choose the access period that fits your goals.</p><a className="button" href="#course-store">Browse Sections →</a></div><div className="storeHeroImages"><AcademyImage priority sizes="(max-width: 800px) 100vw, 50vw" {...learningPhotoProps('home','hero')}/><AcademyImage src="/images/events/workshop-outdoor.jpg" alt={websiteText(website,'home-006','Singh Academy learning experience')}/></div></section><PageSections placement="after-hero"/><FounderProfile compact/><section id="course-store" className="section"><div className="sectionHead"><div><span className="kicker">SECTION CATALOG</span><h2>Choose your next section.</h2></div><p>Open a section to explore its courses, choose section access or purchase an individual course.</p></div><div className="courseVisualGrid">{loading&&<p role="status">Loading published sections…</p>}{error&&<ApiLoadError message={error} onRetry={retry}/>}{access.unavailable&&<ApiLoadError message={access.error} onRetry={access.refresh}/>} {!loading&&!error&&!sections.length&&<p>No sections have been published yet.</p>}{sections.map((section,index)=>{const coverage=access.sectionAccess(section);return <CatalogCard key={section._id||section.slug} product={section} kind="section" variant="compact" priority={index<3} covered={!!coverage} coverageLabel={coverage?.label} accessPending={access.checking||access.unavailable}/>;})}</div></section><PageSections placement="after-catalog"/><section className="eventShowcase"><div><span className="kicker gold">{websiteText(website,'home-013','LEARNING IN PRACTICE')}</span><h2>{websiteText(website,'home-014','Courses shaped by real conversations, global events and professional experience.')}</h2><p>{websiteText(website,'home-015','Real Singh Academy workshops and global learning experiences connect course concepts with professional practice.')}</p></div><div className="eventMosaic"><AcademyImage src="/images/events/rising-tide-group.jpg" alt={websiteText(website,'home-016','Singh Academy global event')}/><AcademyImage {...learningPhotoProps('home','event')}/><AcademyImage src="/images/events/academy-workshop.jpg" alt={websiteText(website,'home-018','Professional learning workshop')}/></div></section><SiteFooter/></main>;
}
