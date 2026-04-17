/**
 * Restarts the Vite dev server if it exits so the UI keeps coming back.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const MIN_UP_MS = 8000;
const RESTART_MS = 2000;

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(scriptDir, '..');
const viteCli = path.join(projectRoot, 'node_modules/vite/bin/vite.js');

let startedAt = 0;
let shuttingDown = false;
let child = null;

function start() {
  startedAt = Date.now();
  child = spawn(process.execPath, [viteCli], {
    stdio: 'inherit',
    env: process.env,
    cwd: projectRoot,
  });

  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    const up = Date.now() - startedAt;
    const delay = up < MIN_UP_MS ? RESTART_MS * 2 : RESTART_MS;
    console.error(
      `[keepalive] Vite exited (code=${code} signal=${signal}); restarting in ${delay}ms`,
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
