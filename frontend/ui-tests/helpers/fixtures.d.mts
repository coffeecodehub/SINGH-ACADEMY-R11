/** Types for TEST-ONLY fixture helpers; the production app does not import these. */
import type {Route} from '@playwright/test';
export type SyntheticProviderIdentity = {provider:'stripe'|'paypal';id:string};
export const SYNTHETIC_PROVIDER_HEADING:string;
export const FIXTURE_FRONTEND_ORIGIN:string;
export function syntheticProviderIdentity(address:string):SyntheticProviderIdentity|null;
export function syntheticProviderDocument(address:string):{
 status:number;contentType:string;headers:Record<string,string>;body:string;
}|null;
export function matchingFixtureOrder<T extends {_id:string;provider:string}>(
 orders:T[],identity:SyntheticProviderIdentity|null
):T|null;
export function fulfillObservedJson(route:Route):Promise<{
 status:number;body:{success?:boolean;signedOut?:boolean;portal?:string;[key:string]:unknown};
}>;
