'use client';
import {useSyncExternalStore} from 'react';
// Stable functions: every SSR subtree (including a late Suspense boundary) uses
// the SAME initial snapshot during hydration. Client-only navigations use true
// immediately. Do not read localStorage or window in a render initializer.
const subscribe=()=>()=>{};
const browserSnapshot=()=>true;
const serverSnapshot=()=>false;
export function useHydrated(){return useSyncExternalStore(subscribe,browserSnapshot,serverSnapshot);}
