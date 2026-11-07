/** Explicit in-memory dependencies for the REAL entitlement source functions.
 * No authorization result is fabricated and no network/database engine is simulated. */
import {load} from './testLoader.js';
import {realAccessFilter} from '../src/utils/commerce.js';
import * as grants from '../src/utils/courseEntitlements.js';
export function entitlementHarness(h){return load('../src/services/courseEntitlements.js',{
 Invoice:h.model('Invoice'),Enrollment:h.model('Enrollment'),realAccessFilter,...grants
},'({loadCourseEntitlements,effectiveCourseEnrollment,effectiveCourseEnrollments,baseGrantSnapshot})');}
export const TEST_ASSESSMENT_SECRET='Synthetic-assessment-only-key-015-do-not-use-in-production';
