/** Read-only, browser-side hit testing for the existing animated faculty rail.
 * A visible DOM node can still be clipped by the marquee or covered by a modal.
 * Return a safe interior point on a currently hittable card, not a fixed clone.
 * No animation, style, event handler or application state is changed here.
 */
export function teamPreviewTarget(rail) {
  const doc = rail?.ownerDocument;
  const win = doc?.defaultView;
  if (!rail?.isConnected || !win) return null;
  const shown = (element) => {
    for (let node = element; node; node = node.parentElement) {
      const style = win.getComputedStyle(node);
      if (node.hidden || node.inert || node.getAttribute('aria-hidden') === 'true' ||
          style.display === 'none' || style.visibility === 'hidden' ||
          style.visibility === 'collapse' || Number(style.opacity) === 0) return false;
    }
    return true;
  };
  if (!shown(rail)) return null;
  const bounds = rail.getBoundingClientRect();
  // Keep away from the unchanged 3% gradient mask at either edge.
  const gutter = Math.max(12, bounds.width * 0.06);
  const left = Math.max(0, bounds.left + gutter);
  const right = Math.min(win.innerWidth, bounds.right - gutter);
  const top = Math.max(0, bounds.top + 8);
  const bottom = Math.min(win.innerHeight, bounds.bottom - 8);
  if (![left, right, top, bottom].every(Number.isFinite) || right <= left || bottom <= top) return null;
  let best = null;
  const cards = [...rail.querySelectorAll('.teamTrackLeft button.teamCard')];
  cards.forEach((card, index) => {
    if (!card.isConnected || card.disabled || card.getAttribute('aria-disabled') === 'true' ||
        !shown(card) || win.getComputedStyle(card).pointerEvents === 'none') return;
    const rect = card.getBoundingClientRect();
    const l = Math.max(left, rect.left + 8), r = Math.min(right, rect.right - 8);
    const t = Math.max(top, rect.top + 8), b = Math.min(bottom, rect.bottom - 8);
    // A sliver of a clipped card is not a reliable mouse/touch target.
    if (![l, r, t, b].every(Number.isFinite) || r - l < 32 || b - t < 32) return;
    const x = (l + r) / 2, y = (t + b) / 2;
    const hit = doc.elementFromPoint(x, y);
    if (!hit || (hit !== card && !card.contains(hit))) return;
    const name = card.querySelector('h3')?.textContent?.trim();
    if (!name) return;
    const area = (r - l) * (b - t);
    if (!best || area > best.area) best = {
      index, name, x, y, area,
      // Playwright locator click positions are relative to the padding box.
      position: {x: x - rect.left - card.clientLeft, y: y - rect.top - card.clientTop},
    };
  });
  return best;
}
