import {expect, type Page} from '@playwright/test';
import {teamPreviewTarget} from './team-preview-target.mjs';

/** Interact as a user without waiting for an infinite marquee to stop moving.
 * Desktop uses the website's existing hover pause and normal actionable click.
 * Touch uses a real tap on the currently hit-tested, visible card interior.
 * Do not force-click, dispatch synthetic events, freeze CSS or lengthen timeouts.
 */
export async function openTeamPreview(page: Page, input: 'mouse' | 'touch') {
  const rail = page.locator('#faculty > .teamMarquee:not(.secondRow):visible');
  await expect(rail).toHaveCount(1);
  // The stationary container must be scrolled first, NOT its moving child.
  await rail.scrollIntoViewIfNeeded();
  await expect(rail).toBeInViewport();
  if (input === 'mouse') {
    await rail.hover();
    await expect.poll(() => rail.locator('.teamTrackLeft').evaluate(
      track => getComputedStyle(track).animationPlayState,
    )).toBe('paused');
  }
  await expect.poll(() => rail.evaluate(teamPreviewTarget)).not.toBeNull();
  const target = await rail.evaluate(teamPreviewTarget);
  if (!target) throw new Error('No hittable faculty card remains in the visible marquee.');
  if (input === 'touch') {
    await page.touchscreen.tap(target.x, target.y);
  } else {
    await rail.locator('.teamTrackLeft button.teamCard').nth(target.index).click({position: target.position});
  }
  const modal = page.getByRole('dialog', {name: target.name, exact: true});
  await expect(modal).toBeVisible();
  return modal;
}
