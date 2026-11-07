import AcademyImage from '../AcademyImage';
import {eventDate,zoomMeetingUrl} from '../../lib/events';
import './events.css';

export default function EventCard({event}:{event:any}){
 const webinar=event.type==='webinar',date=eventDate(event.date),past=!!date&&date.getTime()<Date.now(),join=zoomMeetingUrl(event.zoomUrl);
 return <article className="contentCard academyEventCard" id={event.slug} data-event-type={webinar?'webinar':'event'}>
  {event.image&&<AcademyImage className="academyEventImage" src={event.image} alt={event.title}/>}
  <span className="kicker">{past?(webinar?'PAST WEBINAR':'PAST EVENT'):(webinar?'WEBINAR · LIVE ON ZOOM':'ACADEMY EVENT')}</span>
  <h3>{event.title}</h3>
  <div className="academyEventMeta">{date?<><p><time dateTime={date.toISOString()}>{date.toLocaleString(undefined,{dateStyle:'long',timeStyle:'short'})}</time></p><small>Date and time shown in your local timezone.</small></>:<p>Date to be announced.</p>}
   <p><b>{webinar?'Online · Zoom':event.location||'Location to be announced'}</b></p>
  </div>
  <p className="academyEventDescription">{event.description}</p>
  <div className="academyEventActions">{webinar?!past&&join?<a className="button" href={join} target="_blank" rel="noopener noreferrer">Join webinar on Zoom</a>:!past?<p>Joining details will be announced.</p>:null:event.mapUrl?<a className="button" href={event.mapUrl} target="_blank" rel="noopener noreferrer">View location ↗</a>:null}</div>
 </article>;
}
