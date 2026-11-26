// Menjalankan backend + Expo web + Playwright dalam satu proses, lalu mematikan keduanya.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mobile = path.resolve(here, '..');
const root = path.resolve(mobile, '../..');

const api = spawn('npm', ['run', 'start:prod', '--workspace', '@order-q/api'], { cwd: root, shell: true, stdio: 'ignore' });
const web = spawn('npm', ['run', 'web', '--workspace', 'apps/mobile'], { cwd: root, shell: true, stdio: 'ignore' });

async function waitFor(url, label, timeoutMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        console.log(`${label} siap`);
        return;
      }
    } catch {
      // belum siap
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`${label} tidak siap dalam ${timeoutMs}ms`);
}

async function main() {
  await waitFor('http://127.0.0.1:3000/health', 'API');
  await waitFor('http://127.0.0.1:8081/', 'Expo web');

  const test = spawn('npx', ['playwright', 'test'], {
    cwd: mobile,
    shell: true,
    stdio: 'inherit',
    env: {
      ...process.env,
      WEB_URL: 'http://127.0.0.1:8081',
      EXPO_PUBLIC_API_URL: 'http://127.0.0.1:3000',
    },
  });
  const code = await new Promise((resolve) => test.on('exit', resolve));
  process.exitCode = code ?? 1;
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => {
    api.kill('SIGTERM');
    web.kill('SIGTERM');
  });
