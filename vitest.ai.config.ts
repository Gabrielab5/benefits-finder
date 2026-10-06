import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { include: ['tests/ai/**/*.test.ts'], env: loadEnv('', process.cwd(), ''), testTimeout: 300_000 },
});
