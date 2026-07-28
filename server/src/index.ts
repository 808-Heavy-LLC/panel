import { config } from './config.js';
import { startPoller } from './poller.js';
import { createServer } from './server.js';
import { store } from './store.js';

async function main() {
  // Serve HTTP *before* starting the poller. Startup WAN discovery blocks for
  // ~45s when SNMP is unreachable (the Pi boot race — panel.service starts
  // before eth0 has an address), and deploy/kiosk.sh gives up waiting on
  // /api/health after 60s. Listening first means the kiosk always gets a page;
  // the charts fill in once the poller's recovery loop reaches the UDM.
  store.setSource(config.mock ? 'mock' : 'live');
  const app = await createServer();
  await app.listen({ port: config.port, host: config.host });
  console.log(`[panel] listening on http://${config.host}:${config.port}`);
  console.log(`[panel] websocket on ws://${config.host}:${config.port}/ws`);
  console.log(`[panel] mode: ${config.mock ? 'MOCK' : 'LIVE'}`);
  void startPoller().catch((err) => {
    console.error('[panel] poller failed to start:', err);
  });
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
