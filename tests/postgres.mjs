import { execFile, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

async function freePort() {
  const listener = createServer();
  await new Promise((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', resolve);
  });
  const { port } = listener.address();
  await new Promise(resolve => listener.close(resolve));
  return port;
}

async function pgBin() {
  if (process.env.PG_BIN) return process.env.PG_BIN;
  try {
    return (await run('pg_config', ['--bindir'])).stdout.trim();
  } catch {
    return ''; // Fall back to binaries on PATH.
  }
}

async function bootstrapRole(postgres, dataDir, password) {
  const child = spawn(postgres, ['--single', '-D', dataDir, 'postgres'], { stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  const done = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', code => code === 0 && !/ERROR:|FATAL:/i.test(output)
      ? resolve() : reject(new Error('Could not create the test database and its restricted application role.')));
  });
  child.stdin.end(`CREATE ROLE companykeeping LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${password}';\nCREATE DATABASE companykeeping OWNER companykeeping;\n`);
  await done;
}

export async function startPostgres(directory) {
  const binaries = await pgBin();
  const data = path.join(directory, 'pgdata');
  const log = path.join(directory, 'postgres.log');
  const pgControl = path.join(binaries, 'pg_ctl');
  const port = await freePort();
  const password = randomBytes(24).toString('hex');
  const passwordFile = path.join(directory, 'init-password');
  await writeFile(passwordFile, randomBytes(24).toString('hex') + '\n', { mode: 0o600 });
  await run(path.join(binaries, 'initdb'), [
    '-D', data, '-U', 'postgres', '--encoding=UTF8', '--locale=C',
    '--auth-local=trust', '--auth-host=scram-sha-256', '--pwfile', passwordFile,
  ]);
  await unlink(passwordFile);
  await bootstrapRole(path.join(binaries, 'postgres'), data, password);
  const stop = () => run(pgControl, ['-D', data, '-w', '-m', 'fast', 'stop']);
  await writeFile(path.join(data, 'postgresql.auto.conf'), [
    "listen_addresses = '127.0.0.1'", 'port = ' + port, "unix_socket_directories = ''", '',
  ].join('\n'));
  try {
    await run(pgControl, ['-D', data, '-l', log, '-w', 'start']);
  } catch (error) {
    throw new Error('PostgreSQL startup failed. ' + (await readFile(log, 'utf8').catch(() => error.message)));
  }
  return {
    stop,
    env: {
      SPRING_DATASOURCE_URL: 'jdbc:postgresql://127.0.0.1:' + port + '/companykeeping',
      SPRING_DATASOURCE_USERNAME: 'companykeeping',
      SPRING_DATASOURCE_PASSWORD: password,
    },
  };
}
