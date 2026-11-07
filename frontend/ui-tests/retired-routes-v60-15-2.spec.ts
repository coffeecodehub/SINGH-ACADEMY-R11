/** Regression also runs in the ordinary local release gate, not only Docker CI. */
import {test, expect} from '@playwright/test';
const origin = 'http://127.0.0.1:3108';
for (const width of [390, 1440]) for (const route of ['/free-resources', '/resources']) {
  test(`retired ${route} is a true signed-in 404 at ${width}px, while guest login remains protected`, async ({page, context}) => {
    await page.setViewportSize({width, height: 900});
    const guest = await context.request.get(route, {maxRedirects: 0});
    expect(guest.status()).toBe(307);
    expect(new URL(guest.headers().location, origin).pathname).toBe('/login');
    const login = await context.request.post(origin + '/api/auth/login', {
      headers: {'X-SA-Portal': 'student', 'X-SA-CSRF': '1'},
      data: {email: 'learner@example.invalid', password: 'TestPassword123!'},
    });
    expect(login.ok()).toBe(true);
    const response = await page.goto(route);
    expect(response?.status()).toBe(404);
    await expect(page).toHaveURL(origin + route);
    await expect(page.getByRole('heading', {name: 'Page not found', exact: true})).toBeVisible();
    await expect(page.getByRole('link', {name: 'Return to Singh Academy', exact: true})).toHaveAttribute('href', '/');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(response?.headers()['cache-control']).toContain('no-store');
    expect(response?.headers()['x-robots-tag']).toContain('noindex');
    await expect(page.locator('script')).toHaveCount(0);
    const head = await context.request.head(route);
    expect(head.status()).toBe(404);
    expect((await head.body()).length).toBe(0);
    await page.getByRole('link', {name: 'Return to Singh Academy', exact: true}).click();
    await expect(page).toHaveURL(origin + '/home');
    await expect(page.getByRole('button', {name: 'Logout', exact: true})).toBeVisible();
  });
}
