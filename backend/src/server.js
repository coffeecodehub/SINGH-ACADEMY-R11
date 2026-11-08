
import {assertCriticalIndexes} from './services/databaseIndexes.js';
import 'dotenv/config';
import {createServer} from 'node:http';
import mongoose from 'mongoose';
import {connectDB} from './config/db.js';
import {createApp} from './app.js';
import {assertEnvironment} from './utils/deployment.js';
import {closeMailer} from './utils/mailer.js';
import {startStudentNotificationWorker} from './services/studentNotifications.js';
import Enrollment from './models/Enrollment.js';
import {ensureEnrollmentIndexes} from './utils/enrollmentIndexes.js';
import {createStartupGate} from './utils/startupGate.js';

let server;
let startupGate;
let startupPromise;
let stopping = false;
let shutdownCode = 0;
let stopNotifications = async () => {};

async function shutdown(signal, code = 0) {
  shutdownCode = Math.max(shutdownCode, code);
  if (stopping) return;
  stopping = true;

  startupGate?.deactivate();

  console.log(JSON.stringify({
    event: 'shutdown',
    signal
  }));

  const deadline = setTimeout(() => process.exit(1), 15000);
  deadline.unref();

  if (server) {
    server.closeIdleConnections?.();
    await new Promise(resolve => server.close(resolve));
  }

  // Let the current readiness operation settle before closing its MongoDB session.
  // start() checks stopping between stages so shutdown cannot publish the app.
  await startupPromise?.catch(() => {});

  await stopNotifications();
  closeMailer();
  await mongoose.disconnect();

  clearTimeout(deadline);
  process.exit(shutdownCode);
}

async function start() {
  // Validate configuration first.
  assertEnvironment();

  // HOSTINGER STARTUP FIX:
  // Start HTTP listener before MongoDB and index initialization.
  // Business APIs remain blocked until initialization succeeds.
  startupGate = createStartupGate('60.16.0');

  server = createServer(startupGate.handle);

  server.requestTimeout = 1800000;
  server.headersTimeout = 20000;
  server.keepAliveTimeout = 5000;

  const port = Number(process.env.PORT || 5000);

  await new Promise((resolve, reject) => {
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };

    const onError = error => {
      server.off('listening', onListening);
      reject(error);
    };

    server.once('listening', onListening);
    server.once('error', onError);

    server.listen(port, '0.0.0.0');
  });

  if (stopping) return;

  server.on('error', error => {
    console.error(
      error.code === 'EADDRINUSE'
        ? `Port ${port} is already in use. Stop the previous backend terminal, then retry. Do not terminate unrelated processes.`
        : 'Listener failed: ' + (error.code || 'SERVER_ERROR')
    );

    void shutdown('listen_error', 1);
  });

  console.log(
    `Singh Academy V60.16.0 API listening on port ${port}; database readiness pending.`
  );

  // Original database connection.
  await connectDB();

  if (stopping) return;

  // Original enrollment index repair.
  const droppedEnrollmentIndexes =
    await ensureEnrollmentIndexes(Enrollment.collection);

  if (stopping) return;

  if (droppedEnrollmentIndexes.length) {
    console.log(
      `Removed legacy enrollment index(es): ${droppedEnrollmentIndexes.join(', ')}.`
    );
  }

  // Original production MongoDB validation.
  if (process.env.NODE_ENV === 'production') {
    const hello =
      await mongoose.connection.db.admin().command({hello: 1});

    if (stopping) return;

    if (!hello.setName && hello.msg !== 'isdbgrid') {
      throw new Error(
        'Production business operations require MongoDB Atlas or a replica set.'
      );
    }
  }

  // Original critical index verification.
  if (process.env.NODE_ENV === 'production') {
    await assertCriticalIndexes();
  }

  if (stopping) return;

  // Publish real application only after checks succeed.
  const app = createApp();

  if (stopping) return;

  stopNotifications = startStudentNotificationWorker();

  if (stopping) return;

  startupGate.activate(app);

  console.log(
    'Singh Academy V60.16.0 startup gate open: database and required indexes verified.'
  );
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

startupPromise = start();
startupPromise.catch(error => {
  console.error('Backend startup failed:', error.message);
  void shutdown('startup_error', 1);
});
