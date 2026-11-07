import {load} from './testLoader.js';
import {entitlementHarness} from './entitlementHarness.js';
import * as grants from '../src/utils/courseEntitlements.js';
import {realAccessFilter} from '../src/utils/commerce.js';
import {businessError} from '../src/utils/business.js';
/** Real access functions with explicit in-memory model dependencies. */
export function catalogAccessHarness(h){
 const section=load('../src/services/sectionAccess.js',{SectionAccess:h.model('SectionAccess'),Invoice:h.model('Invoice'),businessError,realAccessFilter,...grants},'({effectiveSectionAccess,effectiveSectionAccesses})');
 return load('../src/services/catalogEntitlements.js',{Course:h.model('Course'),Subscription:h.model('Subscription'),businessError,realAccessFilter,...entitlementHarness(h),...section},'({catalogAccessSnapshot,activePurchaseCoverage,assertNoActivePurchase})');
}
