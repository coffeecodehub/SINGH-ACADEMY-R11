'use client';
import {usePublicResource} from '../../lib/usePublicResource';
import {useCatalogAccess} from '../../lib/useCatalogAccess';
import {standaloneCourses} from '../../lib/catalogPresentation';
import ApiLoadError from '../../components/ApiLoadError';
import SiteHeader from '../../components/SiteHeader';
import SiteFooter from '../../components/layout/SiteFooter';
import BackButton from '../../components/layout/BackButton';
import CatalogCard from '../../components/catalog/CatalogCard';

export default function AcademyPage(){
 const access=useCatalogAccess();
 const courses=usePublicResource('/courses','courses'),sections=usePublicResource('/sections','sections');
 const standalone=standaloneCourses(courses.data);
 return <main><SiteHeader/><section className="innerHero"><BackButton label="Back"/><span className="kicker">SINGH ACADEMY</span><h1>Academy Plans</h1><p>Explore a complete course section or choose an individual course. Each option shows the total price for its access period.</p></section><section className="contentWrap">{access.unavailable&&<ApiLoadError message={access.error} onRetry={access.refresh}/>}
  <div className="catalogGroup" id="sections"><div className="catalogHeading"><div><span className="kicker">LEARN BY SUBJECT</span><h2>Course sections</h2><p>Choose a section to access its courses during your selected term, including published courses added to that section while your access is active.</p></div></div>{sections.error&&<ApiLoadError message={sections.error} onRetry={sections.retry}/>} {sections.loading?<p role="status">Loading course sections…</p>:sections.data.length?<div className="courseVisualGrid">{sections.data.map((section,index)=>{const coverage=access.sectionAccess(section);return <CatalogCard key={section._id||section.slug} product={section} kind="section" priority={index<3} covered={!!coverage} coverageLabel={coverage?.label} accessPending={access.checking||access.unavailable}/>;})}</div>:!sections.error&&<div className="emptyState">No course sections are currently published.</div>}</div>
  <div className="catalogGroup" id="standalone-courses"><div className="catalogHeading"><div><span className="kicker">INDIVIDUAL LEARNING</span><h2>Standalone courses</h2><p>Choose a course outside a section, or open any section above to purchase one of its courses individually.</p></div></div>{courses.error&&<ApiLoadError message={courses.error} onRetry={courses.retry}/>} {courses.loading?<div className="emptyState"><b>Loading courses…</b></div>:standalone.length?<div className="courseVisualGrid">{standalone.map((course,index)=>{const coverage=access.courseAccess(course);return <CatalogCard key={course._id||course.slug} product={course} priority={!sections.data.length&&index<3} covered={!!coverage&&coverage.type!=='free'} coverageLabel={coverage?.label} accessPending={access.checking||access.unavailable}/>;})}</div>:!courses.error&&<div className="emptyState"><b>No standalone courses are currently published.</b>{sections.data.length>0&&<p>Open a course section to explore its individual courses.</p>}</div>}</div>
 </section><SiteFooter/></main>;
}
