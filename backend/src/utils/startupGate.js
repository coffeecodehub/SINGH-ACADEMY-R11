
export function createStartupGate(version) {
  let application = null;
  let closed = false;

  function handle(req, res) {
    if (application && !closed) {
      return application(req, res);
    }

    const path = String(req.url || '').split('?')[0];

    const liveness =
      !closed &&
      (req.method === 'GET' || req.method === 'HEAD') &&
      path === '/api/health';

    const status = liveness ? 200 : 503;

    const payload = liveness
      ? {
          success: true,
          version,
          ready: false
        }
      : {
          success: false,
          ready: false,
          code: 'STARTUP_NOT_READY',
          message: 'The service is starting. Please retry shortly.'
        };

    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      ...(status === 503 ? {'Retry-After': '2'} : {})
    });

    res.end(
      req.method === 'HEAD'
        ? undefined
        : JSON.stringify(payload)
    );
  }

  return {
    handle,

    activate(nextApp) {
      if (
        closed ||
        application ||
        typeof nextApp !== 'function'
      ) {
        throw new Error(
          'Startup gate cannot activate an invalid or stopped application.'
        );
      }

      application = nextApp;
    },

    deactivate() {
      closed = true;
      application = null;
    }
  };
}
