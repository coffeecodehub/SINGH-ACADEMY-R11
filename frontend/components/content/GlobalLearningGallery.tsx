import './page-sections.css';
import {LEARNING_PHOTO_PLACEMENTS,type LearningPhotoPage} from '../../lib/learningPhotos';

/** Optional gallery rendering only for photographs assigned to a gallery slot.
 * Hero/story/event photographs must not be repeated in a bottom-page gallery. */
export default function GlobalLearningGallery({page}:{page:LearningPhotoPage}) {
 const allocation=LEARNING_PHOTO_PLACEMENTS[page];
 const photographs='gallery' in allocation?[allocation.gallery]:[];
 if(!photographs.length)return null;
 const headingId=`global-learning-${page}-title`;
 return <section className="globalLearningGallery" data-photo-page={page} aria-labelledby={headingId}>
  <div className="sectionHead"><div><span className="kicker">A GLOBAL PERSPECTIVE</span><h2 id={headingId}>Learning through connection.</h2></div><p>{page==='about'
   ?'Professional exchange connects people through dialogue. This moment from Brazil reflects the relationships behind a global learning community.'
   :'Cross-cultural understanding begins with listening and meeting people with different perspectives. These moments from Brazil and the Ukraine Delegation reflect a professional community connected by dialogue.'}</p></div>
  <div className="globalLearningGrid">{photographs.map(photo=><figure key={photo.src}>
   <div className="globalLearningPhoto"><img src={photo.src} width={photo.width} height={photo.height} alt={photo.alt} loading="lazy" decoding="async"/></div>
   <figcaption>{photo.caption}</figcaption>
  </figure>)}</div>
 </section>;
}
