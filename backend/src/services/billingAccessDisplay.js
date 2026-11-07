import Invoice from '../models/Invoice.js';
import {agreementPaidAccess} from '../utils/paidAccessDisplay.js';

/** One owner-scoped read for all rendered agreements. No provider calls or writes. */
export async function loadAgreementPaidAccess(userId,agreements,orders,{now=new Date()}={}){
 const ids=agreements.map(item=>item._id),sources=[...agreements.map(item=>item.sourceInvoiceId),...orders.map(item=>item.sourceInvoiceId||item.invoice)].filter(Boolean);
 const invoices=ids.length?await Invoice.find({user:userId,$or:[{billingAgreement:{$in:ids}},{_id:{$in:sources}}]}).select('_id user kind courseSlug sectionSlug planName billingAgreement status paidAt createdAt fulfillmentAt origin totalMinor paidMinor creditedMinor testMode accessStartsAt accessExpiresAt noScheduledExpiry durationMonths accessDays grantVersion grantStartsAt grantExpiresAt grantNoExpiry grantSuppressed accessRevokedAt accessCancelledAt discountFull coupon subtotalMinor discountMinor').lean():[];
 const byId=new Map(orders.map(order=>[String(order._id),order]));
 return new Map(agreements.map(agreement=>[String(agreement._id),agreementPaidAccess(userId,agreement,byId.get(String(agreement.checkoutOrder)),invoices,{now})]));
}
