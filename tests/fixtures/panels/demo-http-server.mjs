#!/usr/bin/env node
// An isolated, application-owned HTTP service. It is not part of Paneon runtime.
import { createServer } from 'node:http';
const port = Number(process.argv[2] ?? 43180);
let counter = 0;
const server = createServer(async (request, response) => {
  response.setHeader('content-type', 'application/json');
  if (request.method === 'GET' && request.url === '/counter') {
    response.end(JSON.stringify({ counter }));
    return;
  }
  if (request.method === 'POST' && request.url === '/counter') {
    let body = '';
    for await (const chunk of request) {
      body += chunk;
      if (body.length > 4096) break;
    }
    try {
      const { amount } = JSON.parse(body);
      if (!Number.isSafeInteger(amount) || amount < 1 || amount > 10) throw new Error();
      counter += amount;
      response.end(JSON.stringify({ counter }));
    } catch {
      response.statusCode = 400;
      response.end(JSON.stringify({ error: 'amount must be an integer from 1 to 10' }));
    }
    return;
  }
  response.statusCode = 404;
  response.end(JSON.stringify({ error: 'Not found' }));
});
server.listen(port, '127.0.0.1', () =>
  console.log(JSON.stringify({ url: `http://127.0.0.1:${server.address().port}` })),
);
process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());
