import {retiredNotFoundResponse} from '../../../lib/server/retiredNotFound';

// Tombstone for the removed page and any old deep links. Route Handlers bypass
// RootLayout/loading/Suspense, so the transport status is a genuine 404.
// Existing middleware still checks a guest's session before reaching this route.
export const dynamic = 'force-dynamic';
export function GET() { return retiredNotFoundResponse(); }
export function HEAD() { return retiredNotFoundResponse(true); }
