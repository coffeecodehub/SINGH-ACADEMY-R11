/** Public payment failures never contain the provider's raw message, body,
 * headers or credentials. Operators can look up the bounded diagnostic ID. */
import {redactPaymentMessage} from './paymentWebhookPolicy.js';
const stripeTypes=new Set(['StripeAPIError','StripeAuthenticationError','StripePermissionError','StripeRateLimitError','StripeConnectionError','StripeInvalidRequestError','StripeIdempotencyError','StripeCardError']);
const safeCode=value=>typeof value==='string'&&/^[A-Za-z0-9_.-]{1,100}$/.test(value)&&redactPaymentMessage(value,process.env)===value?value:undefined;
const safeId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(value)&&redactPaymentMessage(value,process.env)===value?value:undefined;
const safeParam=value=>typeof value==='string'&&/^[A-Za-z0-9_.\[\]-]{1,120}$/.test(value)&&redactPaymentMessage(value,process.env)===value?value:undefined;
export function paymentProviderError(original){
 const stripe=stripeTypes.has(original?.type)||stripeTypes.has(original?.name);
 const paypal=original?.paymentProvider==='paypal'||Number.isInteger(original?.providerStatus)&&typeof original?.providerCode==='string';
 if(!stripe&&!paypal)return null;
 const configuration=stripe&&['StripeAuthenticationError','StripePermissionError'].includes(original.type||original.name)||paypal&&[401,403].includes(original.providerStatus);
 const temporary=stripe&&['StripeConnectionError','StripeRateLimitError','StripeAPIError'].includes(original.type||original.name)||paypal&&(!original.providerStatus||original.providerStatus>=500||original.providerStatus===429);
 const referenceMissing=stripe&&original.statusCode===404&&original.code==='resource_missing';
 const error=new Error(referenceMissing?'The previous checkout reference is unavailable in the current Stripe account or payment mode. Please contact the Academy with the request ID so the original reference can be verified before another payment.':configuration?'This payment method is temporarily unavailable. Please contact the Academy with the request ID.':temporary?'The payment provider is taking longer or is temporarily unavailable. Check or continue the same order before starting another payment.':'The payment provider could not start or confirm checkout. Please contact the Academy with the request ID; check the same order if you already approved payment.');
 error.status=referenceMissing?502:configuration||temporary?503:502;
 error.code=referenceMissing?'PAYMENT_PROVIDER_REFERENCE_MISSING':configuration?'PAYMENT_PROVIDER_CONFIGURATION':temporary?'PAYMENT_PROVIDER_UNAVAILABLE':'PAYMENT_PROVIDER_REJECTED';
 error.paymentProvider=stripe?'stripe':'paypal';
 const status=original.statusCode||original.providerStatus;
 error.providerStatus=Number.isInteger(status)&&status>=100&&status<=599?status:undefined;
 error.providerType=stripe?safeCode(original.type||original.name):undefined;
 error.providerCode=safeCode(original.code||original.providerCode);
 error.providerParam=stripe?safeParam(original.param):undefined;
 error.providerIssue=safeCode(original.providerIssue);
 error.providerRequestId=safeId(original.requestId||original.providerDebugId);
 return error;
}
