import { createApp } from './app.ts';
import { loadConfig } from './config.ts';
const config = loadConfig();
const server = createApp();
server.listen(config.port, config.host, () => { console.log('Hangout MVP: http://' + config.host + ':' + (server.address() as import('node:net').AddressInfo).port); console.log('OpenFreeMap + Overpass + FOSSGIS walking routes. No API keys required.'); });
server.on('error', error => { console.error('Server could not start: ' + error.message); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(1), 5000).unref(); });
