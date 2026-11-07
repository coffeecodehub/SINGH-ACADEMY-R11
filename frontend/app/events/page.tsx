'use client';
import FeedbackNotice from '../../components/feedback/FeedbackNotice';
import {useWebsiteContent,websiteText} from "../../components/WebsiteContent";

import EventCard from '../../components/events/EventCard';

import PageShell from '../../components/layout/PageShell';
import {usePublicResource} from '../../lib/usePublicResource';
export default function Page(){const website=useWebsiteContent();
  const {data:events,loading,error,retry}=usePublicResource('/content/events','events');
  return <PageShell kicker={websiteText(website,"events-001","EVENTS")} title={websiteText(website,"events-002","Live learning and Academy conversations.")} intro={websiteText(website,"events-003","Explore Academy sessions, discussions and professional learning events.")}><section className="contentWrap contentGrid">{error&&<FeedbackNotice variant="error"><p>{error}</p><button className="button" onClick={retry}>{websiteText(website,"events-005","Retry")}</button></FeedbackNotice>}{loading?<p>{websiteText(website,"events-004","Loading events…")}</p>:!events.length?!error&&<div className="emptyState"><h3>{websiteText(website,"events-006","No published events yet.")}</h3><p>{websiteText(website,"events-007","New Academy events will appear here when they are announced.")}</p></div>:events.map(event=><EventCard key={event._id||event.slug} event={event}/>)}</section></PageShell>;
}
