/** Transport readiness is separate from Vimeo/YouTube API readiness.
 * An iframe has a contentWindow while its initial about:blank document still
 * inherits the academy origin. Sending an exact-origin message then is rejected
 * by the browser (asynchronously, so try/catch is not a solution).
 *
 * Open this gate only from this element's load event or a source+origin-checked
 * provider message. Never use '*' to hide an origin mismatch.
 */
export function createPlayerFrameGate(
  frameRef: {current: HTMLIFrameElement | null},
  expectedOrigin: string | null,
  {serialize=true}:{serialize?:boolean}={},
) {
  let committed: HTMLIFrameElement | null = null;
  const allowed = expectedOrigin === 'https://player.vimeo.com' ||
    expectedOrigin === 'https://www.youtube-nocookie.com' ||
    expectedOrigin === 'https://www.tiktok.com';

  function currentRemoteFrame(): HTMLIFrameElement | null {
    const frame = frameRef.current;
    if (!allowed || !frame || !frame.isConnected || !frame.contentWindow) return null;
    try {
      if (new URL(frame.src).origin !== expectedOrigin) return null;
      // Accessible documents (including initial about:blank and srcdoc) must
      // never receive provider commands. A loaded cross-origin document is null.
      if (frame.contentDocument !== null) return null;
    } catch (error) {
      // Some engines throw on cross-origin document access instead of returning
      // null. A malformed URL or any other error is not transport readiness.
      if (!(error instanceof DOMException) || error.name !== 'SecurityError') return null;
    }
    return frame;
  }

  return {
    markLoaded(element: HTMLIFrameElement): boolean {
      if (currentRemoteFrame() !== element) return false;
      committed = element;
      return true;
    },
    matchesMessage(event: Pick<MessageEvent, 'source' | 'origin'>): boolean {
      const frame = currentRemoteFrame();
      return !!frame && event.source === frame.contentWindow && event.origin === expectedOrigin;
    },
    send(data: object): boolean {
      const frame = currentRemoteFrame();
      if (!frame || frame !== committed) return false;
      try {
        frame.contentWindow!.postMessage(serialize?JSON.stringify(data):data, expectedOrigin!);
        return true;
      } catch {
        // A detached/replaced frame is no longer a usable channel. This does
        // not mute browser/provider diagnostics or weaken the target origin.
        committed = null;
        return false;
      }
    },
  };
}
