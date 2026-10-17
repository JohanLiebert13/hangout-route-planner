import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
const channel = process.env.PLAYWRIGHT_CHANNEL || 'chrome';
const paths = channel === 'msedge' ? ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'] : ['C:/Program Files/Google/Chrome/Application/chrome.exe'];
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || paths.find(existsSync);
export default defineConfig({
  testDir: './tests/browser', timeout: 30000, workers: 1,
  globalSetup: './tests/browser/setup.mjs',
  use: { baseURL: 'http://127.0.0.1:63120', viewport: { width: 390, height: 844 },
    launchOptions: executablePath ? { executablePath } : { channel }, screenshot: 'only-on-failure' },
});
