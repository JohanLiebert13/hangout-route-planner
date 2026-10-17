import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { loadConfig } from '../server/config.ts';
const require = createRequire(import.meta.url);
let local = {}; try { local = parseEnv(readFileSync('.env', 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const settings = loadConfig();
const apiBase = process.env.EXPO_PUBLIC_API_BASE_URL || local.EXPO_PUBLIC_API_BASE_URL || 'http://127.0.0.1:' + settings.port;
const children = [spawn(process.execPath, ['--experimental-strip-types', 'server/index.ts'], { stdio: 'inherit' }),
  spawn(process.execPath, [require.resolve('expo/bin/cli'), 'start', '--web'], { stdio: 'inherit', env: { ...process.env, EXPO_PUBLIC_API_BASE_URL: apiBase } })];
let stopping = false;
function stop() { if (stopping) return; stopping = true; for (const child of children) child.kill(); }
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, stop);
for (const child of children) { child.on('error', error => { console.error(error.message); stop(); process.exitCode = 1; }); child.on('exit', code => { if (!stopping) { stop(); process.exitCode = code || 0; } }); }
