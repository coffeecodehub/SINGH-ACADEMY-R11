/** Actual server.js lifecycle with explicit HTTP/MongoDB/worker stubs.
 * Deferred operations make shutdown ordering deterministic; no external services.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {load} from './testLoader.js';
import {createStartupGate} from '../src/utils/startupGate.js';

const stages = ['listen', 'connect', 'enrollment', 'hello', 'critical'];

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
}

function harness(t, {
  pause,
  failAt,
  failure = new Error('Controlled startup failure'),
  hello = {setName: 'test-replica'},
  holdConnections = false,
  signalFrom
} = {}) {
  const events = [], logs = [], errors = [], exits = [];
  const reached = Object.fromEntries(stages.map(stage => [stage, deferred()]));
  const barriers = Object.fromEntries(stages.map(stage => [stage, deferred()]));
  for (const stage of stages) if (stage !== pause) barriers[stage].resolve();
  const drained = deferred(), exited = deferred();
  if (!holdConnections) drained.resolve();
  let connected = false, gate, deadline;

  const processStub = new EventEmitter();
  processStub.env = {NODE_ENV: 'production', PORT: '5000'};
  processStub.exit = code => {
    events.push('exit');
    exits.push(code);
    exited.resolve(code);
  };

  async function stage(name) {
    events.push(name);
    reached[name].resolve();
    await barriers[name].promise;
    if (failAt === name) throw failure;
    if (['enrollment', 'hello', 'critical'].includes(name) && !connected) {
      throw new Error('Cannot use a session that has ended');
    }
    events.push(`${name}:done`);
  }

  const server = new EventEmitter();
  server.listen = () => {
    void stage('listen').then(
      () => server.emit('listening'),
      error => server.emit('error', error)
    );
  };
  server.closeIdleConnections = () => events.push('http-idle-close');
  server.close = callback => {
    events.push('http-close');
    void drained.promise.then(() => {
      events.push('http-drained');
      callback();
    });
  };

  const lifecycle = load('../src/server.js', {
    createServer: handler => { server.handler = handler; return server; },
    mongoose: {
      connection: {db: {admin: () => ({command: async command => {
        assert.deepEqual(command, {hello: 1});
        await stage('hello');
        return hello;
      }})}},
      disconnect: async () => { events.push('db-disconnect'); connected = false; }
    },
    connectDB: async () => {
      await stage('connect');
      connected = true;
      events.push('db-connected');
    },
    createApp: () => {
      events.push('app-create');
      if (signalFrom === 'app') processStub.emit('SIGTERM');
      return (req, res) => { res.writeHead(200, {}); res.end('application'); };
    },
    assertEnvironment: () => {
      events.push('config');
      if (failAt === 'config') throw failure;
    },
    closeMailer: () => events.push('mailer-close'),
    startStudentNotificationWorker: () => {
      events.push('worker-start');
      if (signalFrom === 'worker') processStub.emit('SIGTERM');
      return async () => { events.push('worker-stop'); };
    },
    Enrollment: {collection: {}},
    ensureEnrollmentIndexes: async () => { await stage('enrollment'); return []; },
    assertCriticalIndexes: async () => { await stage('critical'); },
    createStartupGate: version => {
      gate = createStartupGate(version);
      return gate;
    },
    process: processStub,
    console: {
      log: (...args) => logs.push(args),
      error: (...args) => errors.push(args)
    },
    setTimeout: (callback, delay) => {
      deadline = {callback, delay, unref() { this.unreferenced = true; }};
      return deadline;
    },
    clearTimeout: timer => {
      assert.equal(timer, deadline);
      timer.cleared = true;
    }
  }, '({startupPromise, shutdown})');

  t.after(async () => {
    for (const barrier of Object.values(barriers)) barrier.resolve();
    drained.resolve();
    await lifecycle.startupPromise.catch(() => {});
    await lifecycle.shutdown('test_cleanup');
    await exited.promise;
  });

  return {
    ...lifecycle, events, logs, errors, exits, server,
    reached: name => reached[name].promise,
    release: name => barriers[name].resolve(),
    reject: (name, error) => barriers[name].reject(error),
    releaseConnections: () => drained.resolve(),
    exited: exited.promise,
    connected: () => connected,
    deadline: () => deadline,
    signal: (name = 'SIGTERM') => processStub.emit(name),
    response(url = '/api/business') {
      assert.ok(gate, 'Startup gate must exist');
      const response = {
        writeHead(status, headers) { this.status = status; this.headers = headers; },
        end(body) { this.body = body; }
      };
      gate.handle({method: 'GET', url}, response);
      return response;
    }
  };
}

function assertStopped(rig, code = 0) {
  assert.deepEqual(rig.exits, [code]);
  assert.equal(rig.connected(), false);
  assert.equal(rig.events.filter(event => event === 'db-disconnect').length, 1);
  assert.equal(rig.deadline().delay, 15000);
  assert.equal(rig.deadline().unreferenced, true);
  assert.equal(rig.deadline().cleared, true);
  assert.equal(rig.logs.filter(args => String(args[0]).includes('startup gate open')).length, 0);
}

for (const [index, stage] of stages.entries()) {
  test(`SIGTERM during ${stage} waits for the operation and prevents later startup stages`, {timeout: 2000}, async t => {
    const rig = harness(t, {pause: stage});
    await rig.reached(stage);
    assert.equal(rig.response('/api/health').status, 200);
    assert.equal(JSON.parse(rig.response('/api/health').body).ready, false);
    assert.equal(rig.response().status, 503);

    rig.signal();
    rig.signal();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(rig.response('/api/health').status, 503);
    assert.equal(rig.events.includes('db-disconnect'), false);
    assert.equal(rig.connected(), index > 1);
    assert.deepEqual(rig.exits, []);

    rig.release(stage);
    await rig.exited;
    assertStopped(rig);
    assert.deepEqual(rig.errors, []);
    assert.equal(rig.events.includes('app-create'), false);
    assert.equal(rig.events.includes('worker-start'), false);
    assert.deepEqual(rig.events.filter(event => stages.includes(event)), stages.slice(0, index + 1));
    assert.equal(rig.logs.filter(args => String(args[0]).includes('"event":"shutdown"')).length, 1);
    if (stage === 'connect') {
      assert.ok(rig.events.indexOf('db-connected') < rig.events.indexOf('db-disconnect'));
      await Promise.resolve();
      assert.equal(rig.connected(), false, 'A late connect must finish before disconnect, never reopen afterward');
    }
  });
}

test('healthy production startup performs every readiness check before serving the application', {timeout: 2000}, async t => {
  const rig = harness(t);
  await rig.startupPromise;
  assert.deepEqual(rig.events.filter(event => stages.includes(event)), stages);
  assert.ok(rig.events.indexOf('critical:done') < rig.events.indexOf('app-create'));
  assert.ok(rig.events.indexOf('app-create') < rig.events.indexOf('worker-start'));
  assert.equal(rig.response().status, 200);
  assert.equal(rig.response().body, 'application');
  assert.equal(rig.connected(), true);
  assert.equal(rig.logs.filter(args => String(args[0]).includes('startup gate open')).length, 1);
  assert.deepEqual(rig.errors, []);

  rig.signal('SIGINT');
  await rig.exited;
  assert.deepEqual(rig.exits, [0]);
  assert.equal(rig.response().status, 503);
  assert.ok(rig.events.indexOf('worker-stop') < rig.events.indexOf('db-disconnect'));
});

for (const stage of ['config', ...stages]) {
  test(`a genuine ${stage} startup failure remains logged and exits unsuccessfully`, {timeout: 2000}, async t => {
    const failure = new Error(`Controlled ${stage} failure`);
    const rig = harness(t, {failAt: stage, failure});
    await assert.rejects(rig.startupPromise, error => error === failure);
    await rig.exited;
    assertStopped(rig, 1);
    assert.deepEqual(rig.errors, [['Backend startup failed:', failure.message]]);
    assert.equal(rig.events.includes('app-create'), false);
    assert.equal(rig.events.includes('worker-start'), false);
  });
}

test('a genuine readiness failure after SIGTERM is still logged and makes shutdown unsuccessful', {timeout: 2000}, async t => {
  const rig = harness(t, {pause: 'critical'});
  await rig.reached('critical');
  rig.signal();
  const failure = new Error('Required uniqueness indexes are missing');
  rig.reject('critical', failure);
  await assert.rejects(rig.startupPromise, error => error === failure);
  await rig.exited;
  assertStopped(rig, 1);
  assert.deepEqual(rig.errors, [['Backend startup failed:', failure.message]]);
});

test('production standalone MongoDB remains blocked by replica-set validation', {timeout: 2000}, async t => {
  const rig = harness(t, {hello: {isWritablePrimary: true}});
  await assert.rejects(rig.startupPromise, /require MongoDB Atlas or a replica set/);
  await rig.exited;
  assertStopped(rig, 1);
  assert.equal(rig.events.includes('critical'), false);
  assert.equal(rig.events.includes('app-create'), false);
  assert.match(rig.errors[0][1], /require MongoDB Atlas or a replica set/);
});

test('healthy shutdown drains live HTTP connections before stopping the worker and disconnecting MongoDB', {timeout: 2000}, async t => {
  const rig = harness(t, {holdConnections: true});
  await rig.startupPromise;
  rig.signal();
  assert.equal(rig.response('/api/health').status, 503);
  assert.equal(rig.events.includes('http-close'), true);
  assert.equal(rig.events.includes('worker-stop'), false);
  assert.equal(rig.events.includes('db-disconnect'), false);
  assert.equal(rig.connected(), true);

  rig.releaseConnections();
  await rig.exited;
  assert.deepEqual(rig.exits, [0]);
  assert.ok(rig.events.indexOf('http-drained') < rig.events.indexOf('worker-stop'));
  assert.ok(rig.events.indexOf('worker-stop') < rig.events.indexOf('mailer-close'));
  assert.ok(rig.events.indexOf('mailer-close') < rig.events.indexOf('db-disconnect'));
});

for (const phase of ['app', 'worker']) {
  test(`shutdown requested while creating the ${phase} cannot activate the startup gate`, {timeout: 2000}, async t => {
    const rig = harness(t, {signalFrom: phase});
    await rig.startupPromise;
    await rig.exited;
    assertStopped(rig);
    assert.equal(rig.response().status, 503);
    assert.deepEqual(rig.errors, []);
    if (phase === 'app') assert.equal(rig.events.includes('worker-start'), false);
    else assert.equal(rig.events.includes('worker-stop'), true);
  });
}
