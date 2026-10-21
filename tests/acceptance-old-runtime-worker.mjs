// Child-process fixture for the CLI's old-runtime discovery and stop contract.
import { createServer } from 'node:http';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const [home, protocol] = process.argv.slice(2);
if (!home || !protocol || !process.send)
  throw new Error('Run this fixture through acceptance-versions.mjs.');
const runtimeDirectory = join(home, '.paneon');
const descriptorPath = join(runtimeDirectory, 'runtime.json');
await mkdir(runtimeDirectory, { mode: 0o700 });
const descriptor = {
  runtimeId: `runtime-${randomUUID()}`,
  pid: process.pid,
  port: 0,
  controlToken: randomUUID(),
  paneonVersion: '0.0.1',
  protocolVersion: Number(protocol),
  startedAt: new Date().toISOString(),
};
const server = createServer((request, response) => {
  process.send({ operation: request.url });
  response.setHeader('content-type', 'application/json');
  if (request.headers.authorization !== `Bearer ${descriptor.controlToken}`) {
    response.statusCode = 401;
    response.end(
      JSON.stringify({
        ok: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid credential.' },
      }),
    );
    return;
  }
  if (request.method === 'GET' && request.url === '/health') {
    const { controlToken: _, ...health } = descriptor;
    response.end(JSON.stringify({ ok: true, data: health }));
  } else if (request.method === 'POST' && request.url === '/api/stop') {
    void rm(descriptorPath).then(() => {
      response.end(JSON.stringify({ ok: true, data: { stopped: true } }), () =>
        server.close(() => process.exit(0)),
      );
    });
  } else {
    response.statusCode = 404;
    response.end(
      JSON.stringify({
        ok: false,
        error: { code: 'UNEXPECTED_REQUEST', message: 'The CLI must not send a business request.' },
      }),
    );
  }
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
descriptor.port = server.address().port;
await writeFile(descriptorPath, JSON.stringify(descriptor), { mode: 0o600 });
process.send({ ready: true });
