'use client';
import {useParams} from 'next/navigation';
import PageShell from '../../../components/layout/PageShell';
export default function CustomContentPage(){const params=useParams<{slug:string}>();const title=(params.slug||'Page').split('-').map(word=>word.charAt(0).toUpperCase()+word.slice(1)).join(' ');return <PageShell kicker="SINGH ACADEMY" title={title} intro="Perspectives, learning and conversations from Singh Academy."><span className="srOnly">Published page content follows.</span></PageShell>;}
