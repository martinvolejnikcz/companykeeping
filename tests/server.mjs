import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startPostgres } from './postgres.mjs';

const project = new URL('../', import.meta.url);

export async function startApp(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'companykeeping-test-'));
  let child;
  let exited;
  let origin;
  let database;

  async function stop() {
    if (!child) return;
    child.kill('SIGTERM');
    await exited;
    child = undefined;
  }

  async function start() {
    const java = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin/java') : 'java';
    child = spawn(java, ['-jar', 'backend/target/companykeeping.jar'], {
      cwd: project,
      env: {
        ...process.env,
        HOST: '127.0.0.1',
        PORT: '0',
        ...database.env,
        PUBLIC_ORIGIN: '',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    let fatal;
    const ready = new Promise((resolve, reject) => {
      fatal = reject;
      child.stdout.setEncoding('utf8').on('data', chunk => {
        output += chunk;
        const match = output.match(/Companykeeping listening at (http:\/\/127\.0\.0\.1:\d+)/);
        if (match) resolve(match[1]);
      });
      child.stderr.setEncoding('utf8').on('data', chunk => { output += chunk; });
    });
    exited = new Promise(resolve => {
      child.once('error', err => { fatal(err); resolve(); });
      child.once('close', (code, signal) => {
        fatal(new Error(`App exited (${code ?? signal})\n${output}`));
        resolve();
      });
    });
    const timeout = setTimeout(() => fatal(new Error(`App startup timed out\n${output}`)), 60000);
    try {
      origin = await ready;
    } finally {
      clearTimeout(timeout);
    }
  }

  function client() {
    let cookie = '';
    async function request(method, endpoint, data, headers = {}) {
      const response = await fetch(new URL(endpoint, origin), {
        method,
        headers: {
          ...(cookie ? { Cookie: cookie } : {}),
          ...(data !== undefined ? { 'Content-Type': 'application/json', Origin: origin } : {}),
          ...headers,
        },
        body: data === undefined ? undefined : JSON.stringify(data),
        signal: AbortSignal.timeout(5000),
      });
      const setCookie = response.headers.get('Set-Cookie');
      if (setCookie) cookie = setCookie.split(';')[0];
      const body = await response.text();
      return {
        status: response.status,
        ok: response.ok,
        setCookie,
        body: body ? JSON.parse(body) : {},
      };
    }
    async function ok(method, endpoint, data) {
      const result = await request(method, endpoint, data);
      assert.ok(result.ok, `${method} ${endpoint} returned ${result.status}: ${JSON.stringify(result.body)}`);
      return result.body;
    }
    return { request, ok, state: () => ok('GET', '/api/state') };
  }

  t.after(async () => {
    await stop();
    if (database) await database.stop();
    await rm(directory, { recursive: true, force: true });
  });
  database = await startPostgres(directory);
  await start();
  return {
    get origin() { return origin; },
    client,
    restart: async () => { await stop(); await start(); },
  };
}
