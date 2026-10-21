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
    true,
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
