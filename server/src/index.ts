import { config } from './config.js';
import { startPoller } from './poller.js';
import { createServer } from './server.js';

async function main() {
  await startPoller();
  const app = await createServer();
  await app.listen({ port: config.port, host: config.host });
  console.log(`[panel] listening on http://${config.host}:${config.port}`);
  console.log(`[panel] websocket on ws://${config.host}:${config.port}/ws`);
  console.log(`[panel] mode: ${config.mock ? 'MOCK' : 'LIVE'}`);
}

main().catch((err) => {
  console.error('[panel] fatal:', err);
  process.exit(1);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    console.log(`[panel] ${sig} received, exiting`);
    process.exit(0);
  });
}
