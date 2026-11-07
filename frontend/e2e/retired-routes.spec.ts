/** Real Next routing + isolated DB-backed account. No payment provider calls. */
import {test, expect, type BrowserContext} from '@playwright/test';
import {browserStudent} from './account-fixture';

// These cases only read retired pages. Create one real learner and copy only its
// authenticated cookies into otherwise isolated per-test browser contexts.
// This adds ONE registration, preserving the real eight/hour registration limit
// alongside the seven existing e2e accounts. No limiter is disabled or patched.
let learnerCookies: Awaited<ReturnType<BrowserContext['cookies']>> = [];
test.beforeAll(async ({browser}) => {
  const context = await browser.newContext({baseURL: 'http://localhost:3000'});
  try {
    const page = await context.newPage();
    await browserStudent(page);
    learnerCookies = await context.cookies();
  } finally { await context.close(); }
});
async function useReadOnlyLearner(context: BrowserContext) {
  expect(learnerCookies.some(cookie => cookie.name === 'sa_student_v45')).toBe(true);
  await context.addCookies(learnerCookies);
}

for (const route of ['/free-resources', '/resources']) {
  test(`${route}: signed-in GET keeps HTTP 404, noindex and the existing return link`, async ({page, context}) => {
    await useReadOnlyLearner(context);
    for (const suffix of ['', '?source=old-bookmark', '/']) {
      const response = await page.goto(route + suffix);
      expect(response?.status()).toBe(404);
      expect(new URL(page.url()).pathname.replace(/\/$/, '')).toBe(route);
      expect(response?.headers()['cache-control']).toContain('no-store');
      expect(response?.headers()['x-robots-tag']).toContain('noindex');
      expect(response?.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
      await expect(page.getByRole('heading', {name: 'Page not found', exact: true})).toBeVisible();
      await expect(page.getByRole('link', {name: 'Return to Singh Academy', exact: true})).toHaveAttribute('href', '/');
      await expect(page.locator('script')).toHaveCount(0);
    }
    await page.getByRole('link', {name: 'Return to Singh Academy', exact: true}).click();
    await expect(page).toHaveURL('http://localhost:3000/home');
    await expect(page.getByRole('button', {name: 'Logout', exact: true})).toBeVisible();
  });
  test(`${route}: removed deep link is also a terminal 404`, async ({page, context}) => {
    await useReadOnlyLearner(context);
    const response = await page.goto(route + '/old-guide?next=%2Fadmin');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', {name: 'Page not found', exact: true})).toBeVisible();
    expect(await page.content()).not.toContain('old-guide');
    expect(response?.headers()['set-cookie']).toBeUndefined();
  });
  test(`${route}: guest and invalid-session requests still use the existing login gate`, async ({page, context}) => {
    const target = route + '?source=bookmark';
    for (const invalidCookie of [false, true]) {
      if (invalidCookie) await context.addCookies([{name: 'sa_student_v45', value: 'f'.repeat(64), url: 'http://localhost:3000', httpOnly: true}]);
      const response = await context.request.get(target, {maxRedirects: 0});
      expect(response.status()).toBe(307);
      const location = new URL(response.headers().location, 'http://localhost:3000');
      expect(location.origin).toBe('http://localhost:3000');
      expect(location.pathname).toBe('/login');
      expect(location.searchParams.get('next')).toBe(target);
    }
    await context.clearCookies();
    await page.goto(route);
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });
  test(`${route}: authenticated HEAD matches GET status and never carries a body`, async ({page, context}) => {
    await useReadOnlyLearner(context);
    const response = await context.request.head(route, {maxRedirects: 0});
    expect(response.status()).toBe(404);
    expect(response.headers()['x-robots-tag']).toContain('noindex');
    expect(response.headers()['cache-control']).toContain('no-store');
    expect((await response.body()).length).toBe(0);
  });
}
