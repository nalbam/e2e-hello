import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const serverPath = fileURLToPath(new URL('../server.js', import.meta.url));

function runServer(env) {
  return new Promise((resolve, reject) => {
    const { E2E_HELLO_DB_DATABASE_URL, ...base } = process.env;
    const child = spawn(process.execPath, [serverPath], { env: { ...base, PORT: '0', ...env } });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('server did not exit'));
    }, 15000);
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ code, output });
    });
  });
}

test('startup fails without the database URL and never listens', async () => {
  const { code, output } = await runServer({});
  assert.equal(code, 1);
  assert.match(output, /E2E_HELLO_DB_DATABASE_URL is required/);
  assert.doesNotMatch(output, /listening/);
});

test('startup aborts when migration cannot run and does not print the URL', async () => {
  const url = 'postgres://secret-user:secret-pass@127.0.0.1:1/e2e';
  const { code, output } = await runServer({ E2E_HELLO_DB_DATABASE_URL: url });
  assert.equal(code, 1);
  assert.match(output, /postgres initialization failed/);
  assert.doesNotMatch(output, /listening/);
  assert.doesNotMatch(output, /secret/);
});
