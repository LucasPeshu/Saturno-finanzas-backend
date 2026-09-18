import EmbeddedPostgres from 'embedded-postgres';
import { resolve, relative, sep } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
const port = await new Promise((resolve, reject) => {
  const server = createServer();
  server.on('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    server.close(() => resolve(address.port));
  });
});
const baseDir = resolve('.test-postgres');
const databaseDir = resolve(baseDir, String(process.pid));
if (relative(baseDir, databaseDir).startsWith('..' + sep))
  throw new Error('Unsafe test database directory');
await mkdir(databaseDir, { recursive: true });
const pg = new EmbeddedPostgres({
  databaseDir,
  user: 'postgres',
  password: 'local-test-only',
  port,
  persistent: false,
  onLog: () => {},
  onError: console.error,
});
async function run(executable, args, options = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      stdio: 'inherit',
      windowsHide: true,
      ...options,
    });
    child.on('error', reject);
    child.on('exit', resolve);
  });
}
try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('control_gastos_test');
  const env = {
    ...process.env,
    POSTGRES_HOST: '127.0.0.1',
    POSTGRES_PORT: String(port),
    POSTGRES_USERNAME: 'postgres',
    POSTGRES_PASSWORD: 'local-test-only',
    POSTGRES_DATABASE: 'control_gastos_test',
    POSTGRES_SSL: 'false',
    SEED_ENABLED: 'false',
    JWT_SECRET: 'isolated-test-jwt-secret-at-least-32-characters',
  };
  process.exitCode =
    (await run(process.execPath, process.argv.slice(2), { env })) ?? 1;
} finally {
  if (process.platform === 'win32' && pg.process) {
    // pg_ctl avoids taskkill's permission dependency and shuts down only our cluster.
    await run(
      resolve(
        'node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe',
      ),
      ['-D', databaseDir, '-m', 'fast', '-w', 'stop'],
    );
    pg.process = undefined;
  }
  await pg.stop();
}
