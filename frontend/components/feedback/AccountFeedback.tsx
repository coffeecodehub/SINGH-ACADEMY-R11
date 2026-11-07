'use client';
import type {ReactNode} from 'react';
import {usePathname} from 'next/navigation';
import {useAuth} from '../auth/AuthProvider';
import {accountEpoch} from '../../lib/api';
import FeedbackProvider from './FeedbackProvider';

/** One account/route-bound decision queue for public pages and both portals. */
export default function AccountFeedback({children}:{children:ReactNode}){
 const {user,portal,signedOut,signingOut}=useAuth(),path=usePathname()||'/';
 const scope=[portal,user?.id||user?._id||'guest',accountEpoch(portal),path,signedOut?'signed-out':'present',signingOut?'leaving':'ready'].join(':');
 return <FeedbackProvider scope={scope}>{children}</FeedbackProvider>;
}
