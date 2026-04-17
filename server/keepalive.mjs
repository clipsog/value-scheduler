/**
 * Restarts the Assets API if the Node process exits (crash, OOM, etc.).
 * Postgres is kept up by Docker (`restart: unless-stopped` in docker-compose.yml).
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const MIN_UP_MS = 5000;
const RESTART_MS = 1500;

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(scriptDir, '..');

let startedAt = 0;
let shuttingDown = false;
let child = null;

function start() {
  startedAt = Date.now();
  child = spawn(process.execPath, [path.join(scriptDir, 'index.mjs')], {
    stdio: 'inherit',
    env: process.env,
    cwd: projectRoot,
  });

  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    const up = Date.now() - startedAt;
    const delay = up < MIN_UP_MS ? RESTART_MS * 2 : RESTART_MS;
    console.error(
      `[keepalive] value-scheduler API exited (code=${code} signal=${signal}); restarting in ${delay}ms`,
    );
    setTimeout(start, delay);
  });
}

process.on('SIGINT', () => {
  shuttingDown = true;
  child?.kill('SIGINT');
  process.exit(0);
});
process.on('SIGTERM', () => {
  shuttingDown = true;
  child?.kill('SIGTERM');
  process.exit(0);
});

start();
