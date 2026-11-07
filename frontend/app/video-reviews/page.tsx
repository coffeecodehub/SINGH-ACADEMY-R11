import type {Metadata} from 'next';
import PageShell from '../../components/layout/PageShell';
import VideoReviews from '../../components/video-reviews/VideoReviews';
import {publicSiteOrigin} from '../../lib/siteMetadata';
const origin=publicSiteOrigin();
export const metadata:Metadata={title:'Video Reviews | Singh Academy',description:'Watch published video reviews and perspectives from the Singh Academy community.',...(origin?{alternates:{canonical:origin+'/video-reviews'}}:{})};
export default function VideoReviewsPage(){return <PageShell kicker="LEARNER PERSPECTIVES" title="Video reviews." intro="Hear from the community. Watch a short preview, then open the complete review."><VideoReviews/></PageShell>;}
