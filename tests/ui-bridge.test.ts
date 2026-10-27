import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validRequest, validSource, type BridgeIdentity } from '../src/web/bridge.ts';
const identity: BridgeIdentity = {
  paneon: true,
  channelId: 'random-channel',
  instanceId: 'one',
  revision: 'current',
};
void test('host bridge binds a request to channel, instance, revision and a safe request id', () => {
  const request = {
    ...identity,
    direction: 'request',
    requestId: 'request-1',
    method: 'action',
    payload: { actionId: 'entry#read', input: {} },
  };
  assert.equal(validRequest(request, identity), true);
  for (const changes of [
    { channelId: 'forged' },
    { instanceId: 'two' },
    { revision: 'old' },
    { requestId: '' },
    { requestId: '../path' },
    { direction: 'response' },
    { method: 'credential-use' },
    { payload: null },
  ])
    assert.equal(validRequest({ ...request, ...changes }, identity), false);
  assert.equal(
    validRequest(
      { ...request, method: 'credential', payload: { actionId: 'entry#read' } },
      identity,
    ),
    false,
  );
  assert.equal(
    validRequest({ ...request, method: 'credential', payload: { value: 'plaintext' } }, identity),
    false,
  );
});
void test('host bridge accepts only its exact iframe source', () => {
  const frame = {};
  assert.equal(validSource(frame, frame), true);
  assert.equal(validSource({}, frame), false);
  assert.equal(validSource(null, null), false);
});
void test('file requests and external links retain identity validation and supported targets', () => {
  const request = {
    ...identity,
    direction: 'request',
    requestId: 'open-file',
    method: 'file',
    payload: { href: './app.ts#L3', sourcePath: 'docs/plan.md' },
  };
  assert.equal(validRequest(request, identity), true);
  assert.equal(validRequest({ ...request, channelId: 'forged' }, identity), false);
  assert.equal(validRequest({ ...request, payload: { href: 'vscode://file/a' } }, identity), false);
  assert.equal(
    validRequest({ ...request, payload: { href: 'https://example.com/a' } }, identity),
    false,
  );
  assert.equal(
    validRequest({ ...request, payload: { href: './a', sourcePath: [] } }, identity),
    false,
  );
  assert.equal(
    validRequest(
      { ...request, method: 'browser', payload: { kind: 'open-url', url: 'https://example.com/' } },
      identity,
    ),
    true,
  );
  assert.equal(
    validRequest(
      { ...request, method: 'browser', payload: { kind: 'open-url', url: 'vscode://file/a' } },
      identity,
    ),
    false,
  );
});
void test('diagram browser operations require the existing bridge identity and typed payload', () => {
  const request = {
    ...identity,
    direction: 'request',
    requestId: 'diagram-export',
    method: 'browser',
    payload: { kind: 'copy-text', text: 'flowchart LR\n A --> B' },
  };
  assert.equal(validRequest(request, identity), true);
  assert.equal(validRequest({ ...request, revision: 'old' }, identity), false);
  for (const kind of ['copy-image', 'download-image']) {
    assert.equal(
      validRequest({ ...request, payload: { kind, svg: '<svg/>', background: 'white' } }, identity),
      true,
    );
    assert.equal(validRequest({ ...request, payload: { kind, svg: '<svg/>' } }, identity), false);
  }
  for (const payload of [
    { kind: 'copy-text', text: 123 },
    { kind: 'open-url', url: 'file:///tmp/private' },
    { kind: 'download-image', svg: null, background: 'white' },
    { kind: 'copy-image', svg: '<svg/>', background: 123 },
  ])
    assert.equal(validRequest({ ...request, payload }, identity), false);
});
