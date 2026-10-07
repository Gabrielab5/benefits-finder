import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';

// Runs against the real Supabase project with throwaway "e2e" users: npm run test:db
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { include: ['tests/db/**/*.test.ts'], env: loadEnv('', process.cwd(), ''), testTimeout: 60_000, fileParallelism: false },
});
