import { spawn } from 'node:child_process';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const args = process.argv.slice(2);
if (args.includes('--version')) {
  console.log('codex-cli fake-test');
  process.exit(0);
}
const output = dirname(args[args.indexOf('--output-last-message') + 1]);
const sessionId = '11111111-2222-4333-8444-555555555555';
const scenario = process.env.MOCK_CODEX_SCENARIO;
const prompt = await new Promise((done) => {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => (input += chunk));
  process.stdin.on('end', () => done(input));
});
await writeFile(
  join(output, 'received.json'),
  JSON.stringify({ prompt, args, cwd: process.cwd() }),
);

const sessionDirectory = join(process.env.CODEX_HOME, 'sessions/2026/11/07');
await mkdir(sessionDirectory, { recursive: true });
const rollout = join(sessionDirectory, `rollout-2026-11-07T00-00-00-${sessionId}.jsonl`);
const record = (type, payload) =>
  JSON.stringify({ timestamp: '2026-11-07T00:00:00.000Z', type, payload }) + '\n';
const event = (value) => process.stdout.write(JSON.stringify(value) + '\n');
const toolOutput = '中文🙂\n```tsx\nconst x = 1;\n```\n' + 'long output\n'.repeat(10000);
await writeFile(
  rollout,
  record('session_meta', { id: sessionId, source: 'exec' }) +
    record('turn_context', { turn_id: 'user-turn', model: 'test-model' }) +
    record('response_item', {
      type: 'message',
      role: 'user',
      content: [{ type: 'input_text', text: prompt }],
    }) +
    record('response_item', {
      type: 'function_call',
      name: 'exec_command',
      call_id: 'call-1',
      arguments: JSON.stringify({ cmd: 'read panel.tsx', max_output_tokens: 40000 }),
    }) +
    record('response_item', {
      type: 'function_call_output',
      call_id: 'call-1',
      output: toolOutput,
    }) +
    record('token_usage_record', { response_id: 'response-1', usage: { input_tokens: 42 } }) +
    record('response_item', {
      type: 'custom_tool_call',
      name: 'apply_patch',
      call_id: 'call-2',
      input: '*** Begin Patch\n*** Add File: panel.tsx\n+中文🙂\n*** End Patch',
    }) +
    record('response_item', {
      type: 'custom_tool_call_output',
      call_id: 'call-2',
      output: 'saved',
    }),
);
event({ type: 'thread.started', thread_id: sessionId });
event({ type: 'turn.started' });

if (scenario === 'cancel' || scenario === 'force-cancel') {
  const descendant = spawn(
    process.execPath,
    [
      '-e',
      `const fs=require('node:fs');
       process.on('SIGINT',()=>{fs.writeFileSync(process.argv[1],'interrupted');process.exit(0)});
       process.send('ready');setInterval(()=>{},1000);`,
      join(output, 'descendant-stopped'),
    ],
    { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] },
  );
  await new Promise((done) => descendant.once('message', done));
  await writeFile(join(output, 'descendant.pid'), String(descendant.pid));
  if (scenario === 'force-cancel') process.on('SIGINT', () => {});
  else
    process.once('SIGINT', () => {
      void appendFile(rollout, record('event_msg', { type: 'turn_aborted' })).then(() =>
        process.exit(0),
      );
    });
  await writeFile(join(output, 'ready'), 'ready');
  setInterval(() => {}, 1000);
} else if (scenario === 'fail') {
  event({ type: 'turn.failed', error: { message: 'test failure' } });
  process.stderr.write('fake CLI failed\n');
  process.exitCode = 1;
} else {
  await appendFile(
    rollout,
    record('response_item', {
      type: 'message',
      role: 'assistant',
      phase: 'final_answer',
      content: [{ type: 'output_text', text: '完成🙂' }],
    }) + record('token_usage_record', { response_id: 'response-2', usage: { output_tokens: 12 } }),
  );
  if (scenario === 'missing-rollout') {
    const { unlink } = await import('node:fs/promises');
    await unlink(rollout);
  }
  if (scenario === 'malformed-event') process.stdout.write('not JSON\n');
  event({ type: 'item.completed', item: { type: 'agent_message', text: '完成🙂' } });
  event({ type: 'turn.completed', usage: { input_tokens: 42, output_tokens: 12 } });
  await writeFile(join(output, 'final.md'), '完成🙂');
  // Keep an exact source for byte-for-byte export assertions.
  if (scenario !== 'missing-rollout')
    await writeFile(join(output, 'source-rollout.jsonl'), await readFile(rollout));
}
