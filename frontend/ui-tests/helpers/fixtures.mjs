/** TEST-ONLY provider documents. Never imported by application/backend code.
 * No provider request is made: the Playwright route is fulfilled locally.
 * Charset must be explicit: the exact heading includes a Unicode em dash.
 */
export const SYNTHETIC_PROVIDER_HEADING = 'Synthetic payment provider — no real money';
export const FIXTURE_FRONTEND_ORIGIN = 'http://127.0.0.1:3108';

export function syntheticProviderIdentity(address) {
  let url;
  try { url = new URL(address); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return null;
  let provider, token;
  if (url.hostname === 'checkout.stripe.com' && !url.search) {
    provider = 'stripe';
    token = url.pathname.match(/^\/c\/pay\/(sa-ui-[a-f0-9]{24})$/)?.[1];
  } else if (url.hostname === 'www.sandbox.paypal.com' && url.pathname === '/checkoutnow') {
    provider = 'paypal';
    if (url.searchParams.getAll('token').length !== 1 ||
        [...url.searchParams.keys()].some(key => key !== 'token')) return null;
    token = url.searchParams.get('token');
  }
  if (!/^sa-ui-[a-f0-9]{24}$/.test(token || '')) return null;
  return {provider, id: token.slice(6)};
}

export function syntheticProviderDocument(address) {
  const identity = syntheticProviderIdentity(address);
  if (!identity) return null;
  const {id, provider} = identity;
  // Both the HTTP header and early HTML metadata specify UTF-8. Do not
  // replace the em dash with ASCII or loosen exact-text test expectations.
  return {
    status: 200,
    contentType: 'text/html; charset=utf-8',
    headers: {'Cache-Control': 'no-store', 'X-SA-UI-Fixture': 'synthetic-payment-provider'},
    body: `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Synthetic payment provider</title></head><body data-order-id="${id}" data-provider="${provider}"><h1>${SYNTHETIC_PROVIDER_HEADING}</h1><a href="${FIXTURE_FRONTEND_ORIGIN}/checkout/return?order=${id}">Approve fixture payment</a><a href="${FIXTURE_FRONTEND_ORIGIN}/checkout/return?order=${id}&amp;cancelled=1">Cancel fixture payment</a></body></html>`,
  };
}

/** Bind the observed provider document to the matching fixture order. Never
 * approve "the latest order": a click can return before creation has finished.
 */
export function matchingFixtureOrder(orders, identity) {
  if (!identity || !Array.isArray(orders)) return null;
  return orders.find(order => order?._id === identity.id &&
    order.provider === identity.provider) || null;
}

/** Buffer an API response BEFORE the browser receives it and navigates away.
 * route.fetch follows the real fixture/proxy HTTP path, including Set-Cookie.
 * Only the synthetic test route uses this; the production logout is not delayed.
 */
export async function fulfillObservedJson(route) {
  const response = await route.fetch({maxRedirects: 0});
  try {
    const body = await response.body();
    const evidence = {status: response.status(), body: JSON.parse(body.toString('utf8'))};
    await route.fulfill({response, body});
    return evidence;
  } finally {
    await response.dispose();
  }
}
