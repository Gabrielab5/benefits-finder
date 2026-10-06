import { defineConfig } from '@playwright/test';
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd()); // loads .env.local like Next.js does

export default defineConfig({
  testDir: 'tests/e2e',
  use: { baseURL: 'http://localhost:3000', locale: 'he-IL' },
  webServer: { command: 'npm run dev', url: 'http://localhost:3000/login', reuseExistingServer: true, timeout: 120_000 },
});
