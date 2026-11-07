/** TEST-ONLY observation; never imports application code or changes authentication.
 * Read URL, readiness and rendered controls in ONE browser evaluation. Streaming
 * HTML may keep a hidden copy: ignore only non-rendered copies, not a second
 * visible header. No DOM selection via first()/nth(), no auto-login, no reload.
 */
export function readSignedOutSnapshot() {
  const visible = element => {
    if (!element.isConnected) return false;
    const style = window.getComputedStyle(element);
    if (style.visibility === 'hidden' || style.visibility === 'collapse') return false;
    const box = element.getBoundingClientRect();
    return box.width > 0 && box.height > 0;
  };
  const all = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));
  const shown = (selector, scope = document) => all(selector, scope).filter(visible);
  const text = element => (element.getAttribute('aria-label') || element.textContent || '').replace(/\s+/g, ' ').trim();
  const logout = element => element.classList.contains('logoutBtn') || text(element) === 'Logout';
  const buttons = shown('button,[role="button"]');
  const headers = shown('header.nav').map(header => ({
    ready: header.getAttribute('data-auth-controls-ready') === 'true',
    signInLinks: shown('a', header).filter(a => text(a) === 'Sign In' &&
      new URL(a.href, location.href).origin === location.origin &&
      new URL(a.href, location.href).pathname === '/login').length,
  }));
  const loginForms = shown('form.authCard').map(form => ({
    emails: shown('input[name="email"][type="email"]', form).length,
    passwords: shown('input[name="password"]', form).length,
    submitButtons: shown('button[type="submit"]', form).filter(b => text(b) === 'Sign in →' && !b.disabled).length,
  }));
  return {
    href: location.href,
    readyState: document.readyState,
    timeOrigin: performance.timeOrigin,
    totalHeaders: all('header.nav').length,
    headers,
    loginForms,
    logoutButtons: buttons.filter(logout).length,
    userChips: shown('.userChip').length,
  };
}

/** Evaluate only the public guest states already permitted by the test contract.
 * Wrong host, unexpected/protected path, loading, ambiguous visible controls,
 * stale account UI and incomplete sign-in form all remain a FAIL/PENDING state.
 */
export function signedOutSnapshotState(snapshot, {origin, expectedPath = 'either'}) {
  let url;
  try { url = new URL(snapshot.href); } catch { return 'pending:invalid-url'; }
  if (url.origin !== origin) return 'pending:wrong-origin';
  if (url.pathname !== '/' && url.pathname !== '/login') return 'pending:not-a-guest-page';
  if (expectedPath !== 'either' && url.pathname !== expectedPath) return 'pending:wrong-guest-destination';
  if (snapshot.readyState !== 'complete') return 'pending:document-loading';
  if (snapshot.logoutButtons !== 0 || snapshot.userChips !== 0) return 'pending:account-ui-still-present';
  if (url.pathname === '/') {
    if (snapshot.headers.length !== 1) return 'pending:visible-header-count=' + snapshot.headers.length;
    if (!snapshot.headers[0].ready) return 'pending:header-not-hydrated';
    if (snapshot.headers[0].signInLinks !== 1) return 'pending:sign-in-link-count=' + snapshot.headers[0].signInLinks;
    if (snapshot.loginForms.length !== 0) return 'pending:wrong-page-markup';
    return 'ready:landing';
  }
  if (snapshot.headers.length !== 0) return 'pending:wrong-page-markup';
  if (snapshot.loginForms.length !== 1) return 'pending:login-form-count=' + snapshot.loginForms.length;
  const form = snapshot.loginForms[0];
  if (form.emails !== 1 || form.passwords !== 1 || form.submitButtons !== 1) return 'pending:login-controls-not-ready';
  return 'ready:login';
}

/** Require two consecutive coherent samples of the same document + URL, with
 * no main-document navigation in flight. This is polling, not a fixed sleep or
 * a retry of a failed test. A redirect resets the candidate immediately.
 */
export function createSignedOutStability(options) {
  let candidate = '';
  return (snapshot, {pendingDocuments = 0, navigationEpoch = 0} = {}) => {
    const state = signedOutSnapshotState(snapshot, options);
    if (pendingDocuments !== 0 || !state.startsWith('ready:')) {
      candidate = '';
      return pendingDocuments ? 'pending:document-navigation' : state;
    }
    const key = JSON.stringify([snapshot.href, snapshot.timeOrigin, state, navigationEpoch]);
    if (key !== candidate) { candidate = key; return 'pending:confirm-same-guest-document'; }
    return state;
  };
}
