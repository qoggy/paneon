import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chmod, mkdtemp, writeFile, rm, mkdir, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { z } from '@qoggy/paneon/sdk';
import {
  fileReviewParamsSchema,
  fileFeedbackSchema,
  fileReviewSubmittedSchema,
  validateRanges,
} from '../skills/paneon/assets/panels/file-review/schema.ts';
import type { FileFeedback, Snapshot } from '../skills/paneon/assets/panels/file-review/schema.ts';
import {
  readManifestFile,
  snapshotId,
  validateFeedback,
} from '../skills/paneon/assets/panels/file-review/actions.ts';
import { publicFileFeedback } from '../skills/paneon/assets/panels/file-review/feedback.ts';
import {
  ancestorKeys,
  directoryKeys,
  fileTree,
  fileLanguage,
  isMarkdown,
  visibleFileCount,
} from '../skills/paneon/assets/panels/file-review/model.ts';
import { TEXT_FILE_MAX_BYTES } from '../skills/paneon/assets/shared/read-text-file.js';

const ctx = { signal: new AbortController().signal };
const snapshot = (
  fileIndex: number,
  text: string,
  path = resolve(`file-${fileIndex}.ts`),
): Snapshot => ({ fileIndex, text, path, snapshotId: snapshotId(path, text) });
const target = (file: Snapshot, quote: string, from = 0) => {
  const start = file.text.indexOf(quote, from);
  assert.ok(start >= 0);
  return {
    ref: { fileIndex: file.fileIndex, snapshotId: file.snapshotId },
    text: { start, end: start + quote.length, quote },
  };
};

void test('file manifest is a strict array of literal paths with optional nonblank title', () => {
  const input = { files: [' docs/a#?%.MD ', '/tmp/config.json', 'docs/a#?%.MD'] };
  assert.deepEqual(fileReviewParamsSchema.parse(input), input);
  for (const value of [
    { files: [] },
    { files: [''] },
    { files: [' '] },
    { files: [{ path: 'a' }] },
    { files: [3] },
    { ...input, title: ' ' },
    { ...input, markdownFilePath: 'a' },
    { ...input, displayPath: 'a' },
  ])
    assert.equal(fileReviewParamsSchema.safeParse(value).success, false);
  assert.doesNotThrow(() => z.toJSONSchema(fileReviewParamsSchema));
  assert.doesNotThrow(() => z.toJSONSchema(fileReviewSubmittedSchema));
});

void test('tree reuses directory sorting, compression, duplicate identities and ancestors', () => {
  const roots = fileTree(['src/lib/b.ts', 'root.ts', 'src/lib/a.ts', 'src/lib/a.ts']);
  assert.equal(roots[0].name, 'src/lib');
  assert.deepEqual(
    roots[0].nodes?.map((node) => node.fileIndex),
    [2, 3, 0],
  );
  assert.deepEqual(directoryKeys(roots), ['directory:src/lib']);
  assert.deepEqual(ancestorKeys(roots, 3), ['directory:src/lib']);
  assert.equal(
    visibleFileCount(roots[0], () => true),
    3,
  );
  assert.equal(
    visibleFileCount(roots[0], (index) => index === 3),
    1,
  );
  assert.equal(
    visibleFileCount(roots[0], () => false),
    0,
  );
  const flat = fileTree(['z/same.ts', 'root.ts', 'a/same.ts', 'a/same.ts'], false);
  assert.deepEqual(
    flat.map((node) => node.fileIndex),
    [1, 2, 3, 0],
  );
  assert.equal(
    flat.some((node) => node.nodes),
    false,
  );
  const mixed = fileTree(['a/b.ts', '/a/c.ts']);
  assert.deepEqual(
    mixed.map((node) => node.name),
    ['/a', 'a'],
  );
  assert.deepEqual(
    mixed.map((node) => node.nodes?.[0].fileIndex),
    [1, 0],
  );
  const deep = fileTree(['src/io/github/qoggy/myproject/App.java']);
  assert.equal(deep[0].name, 'src/io/github/qoggy/myproject');
  assert.equal(deep[0].nodes?.[0].name, 'App.java');
  assert.equal(isMarkdown('/tmp/a.MARKDOWN'), true);
  assert.equal(isMarkdown('/tmp/a.mdx'), false);
  assert.equal(fileLanguage('/tmp/a.py'), 'python');
  assert.equal(fileLanguage('/tmp/a.unknown'), 'unknown');
});

void test('literal bounded reads preserve Unicode, BOM and line endings, with valid empty and exact-limit files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'paneon-file-read-'));
  try {
    const name = ' 中文#?%.ts ';
    const text = '\uFEFFconst 中文 = "🙂";\r\nrepeat\rrepeat';
    await writeFile(join(root, name), text);
    const file = await readManifestFile(root, [name, name], 1);
    assert.equal(file.path, join(root, name));
    assert.equal(file.text, text);
    assert.equal(file.fileIndex, 1);
    assert.equal(file.snapshotId, snapshotId(file.path, text));
    await writeFile(join(root, 'empty'), '');
    assert.equal((await readManifestFile(root, ['empty'], 0)).text, '');
    await writeFile(join(root, 'limit'), Buffer.alloc(TEXT_FILE_MAX_BYTES, 97));
    assert.equal(
      (await readManifestFile(root, [join(root, 'limit')], 0)).text.length,
      TEXT_FILE_MAX_BYTES,
    );
    await writeFile(join(root, 'large'), Buffer.alloc(TEXT_FILE_MAX_BYTES + 1, 97));
    await writeFile(join(root, 'nul'), 'a\0b');
    await writeFile(join(root, 'invalid'), Buffer.from([0xc3, 0x28]));
    await mkdir(join(root, 'directory'));
    await writeFile(join(root, 'unreadable'), 'private');
    await chmod(join(root, 'unreadable'), 0);
    await assert.rejects(readManifestFile(root, ['unreadable'], 0), { code: 'FILE_ACCESS_DENIED' });
    for (const [path, code] of [
      ['missing', 'FILE_NOT_FOUND'],
      ['large', 'FILE_TOO_LARGE'],
      ['nul', 'FILE_NOT_TEXT'],
      ['invalid', 'FILE_NOT_TEXT'],
      ['directory', 'FILE_NOT_REGULAR'],
    ])
      await assert.rejects(readManifestFile(root, [path], 0), { code });
    await assert.rejects(readManifestFile(root, [name], 1), /index/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

void test('main source ranges validate against explicit original evidence, preserving separate duplicate entries', () => {
  const a = snapshot(0, '\uFEFF# 中文🙂\r\né repeat repeat');
  const b = { ...a, fileIndex: 1 };
  const evidence = { files: [a, b] };
  const draft: FileFeedback = {
    annotations: [
      {
        id: 'one',
        targets: [target(a, '中文🙂'), target(a, 'repeat', a.text.indexOf('repeat') + 1)],
        comment: '',
      },
      { id: 'two', targets: [target(b, 'é')], comment: 'duplicate manifest entry' },
    ],
  };
  const original = structuredClone(draft);
  assert.equal(validateRanges(fileFeedbackSchema.parse(draft), evidence, []).annotations.length, 2);
  const result = publicFileFeedback(draft, evidence);
  assert.deepEqual(fileReviewSubmittedSchema.parse(result), result);
  assert.equal(result.files.length, 2);
  assert.equal(result.files[0].annotations[0].targets.length, 2);
  assert.equal('id' in result.files[0].annotations[0], false);
  assert.equal('ref' in result.files[0].annotations[0].targets[0], false);
  assert.deepEqual(draft, original);
  const wrong = structuredClone(draft);
  wrong.annotations[0].targets[0].text!.quote = 'wrong';
  assert.throws(() => validateRanges(wrong, evidence, []), /range/);
  const split = structuredClone(draft);
  split.annotations[1].targets[0].text = {
    start: b.text.indexOf('é'),
    end: b.text.indexOf('é') + 1,
    quote: 'e',
  };
  assert.throws(() => validateRanges(split, evidence, []), /range/);
  assert.throws(() => validateRanges(draft, { files: [a, a] }, []), /Duplicate/);
  assert.throws(() => validateRanges(draft, { files: [a] }, []), /Missing/);
  assert.throws(() => validateRanges({ annotations: [] }, { files: [] }, []), /at least one/);
  assert.deepEqual(
    publicFileFeedback(
      validateRanges({ annotations: [], replacesEventId: 17 }, { files: [] }, []),
      {
        files: [],
      },
    ),
    { files: [], replacesEventId: 17 },
  );
});

void test('linked opinions publish under their own file without unannotated owner or internal references', () => {
  const owner = snapshot(0, '[link](./request.ts)');
  const linked = { path: '/work/request.ts', snapshotId: 'sha256:linked' };
  const draft = fileFeedbackSchema.parse({
    annotations: ['first', 'second'].map((id, index) => ({
      id,
      targets: [
        {
          ref: { fileIndex: 0, snapshotId: owner.snapshotId },
          sourceRef: linked,
          text: { start: index, end: index + 1, quote: index ? '中' : '文' },
        },
      ],
      comment: '',
    })),
  });
  const evidence = { files: [owner] };
  validateRanges(draft, evidence, []);
  const result = publicFileFeedback(draft, evidence);
  assert.equal(result.files.length, 1);
  assert.deepEqual(result.files[0], {
    ...linked,
    annotations: draft.annotations.map(({ targets, comment }) => ({
      targets: targets.map(({ text }) => ({ text })),
      comment,
    })),
  });
});

void test('path selections validate against the supplied path and publish only path.quote alongside body targets', () => {
  const paths = ['docs/缓存🙂/缓存🙂.md'];
  const file = snapshot(0, '# 缓存方案', '/workspace/docs/缓存🙂/缓存🙂.md');
  const evidence = { files: [file] };
  const start = paths[0].lastIndexOf('缓存🙂');
  const draft = fileFeedbackSchema.parse({
    annotations: [
      {
        id: 'path',
        targets: [
          {
            ref: { fileIndex: 0, snapshotId: file.snapshotId, part: 'path' },
            text: { start, end: start + '缓存🙂'.length, quote: '缓存🙂' },
          },
        ],
        comment: '请修改文件名',
      },
      { id: 'body', targets: [target(file, '缓存方案')], comment: '' },
    ],
  });
  validateRanges(draft, evidence, paths);
  const result = publicFileFeedback(draft, evidence);
  assert.deepEqual(fileReviewSubmittedSchema.parse(result), {
    files: [
      {
        path: file.path,
        snapshotId: file.snapshotId,
        annotations: [
          { targets: [{ path: { quote: '缓存🙂' } }], comment: '请修改文件名' },
          { targets: [{ text: target(file, '缓存方案').text }], comment: '' },
        ],
      },
    ],
  });
  const wrong = structuredClone(draft);
  wrong.annotations[0].targets[0].text!.quote = '缓存方案';
  assert.throws(() => validateRanges(wrong, evidence, paths), /range/);
  const bodyAsPath = structuredClone(draft);
  bodyAsPath.annotations[1].targets[0].ref.part = 'path';
  assert.throws(() => validateRanges(bodyAsPath, evidence, paths), /range/);
  const absoluteDraft = structuredClone(draft);
  const absoluteStart = file.path.lastIndexOf('缓存🙂');
  absoluteDraft.annotations[0].targets[0].text = {
    start: absoluteStart,
    end: absoluteStart + '缓存🙂'.length,
    quote: '缓存🙂',
  };
  assert.equal(
    validateFeedback.handler(ctx, {
      params: { files: [file.path] },
      feedback: absoluteDraft,
      evidence,
    }),
    absoluteDraft,
  );
});

void test('submission checks path and digest from explicit evidence without rereading removed files or prior worker memory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'paneon-file-evidence-'));
  try {
    const path = join(root, 'a.ts');
    await writeFile(path, 'const x = 1;');
    const file = await readManifestFile(root, [path], 0);
    const request = {
      params: { files: [path] },
      feedback: { annotations: [{ id: 'a', targets: [target(file, '1')], comment: '' }] },
      evidence: { files: [file] },
    };
    await unlink(path);
    assert.equal(validateFeedback.handler(ctx, request), request.feedback);
    for (const patch of [
      { path: path + '.other' },
      { snapshotId: `sha256:${'a'.repeat(64)}` },
      { fileIndex: 9 },
    ]) {
      const changed = structuredClone(request);
      Object.assign(changed.evidence.files[0], patch);
      assert.throws(() => validateFeedback.handler(ctx, changed), /inconsistent/);
    }
    const script = `import {validateFeedback} from ${JSON.stringify(new URL('../skills/paneon/assets/panels/file-review/actions.ts', import.meta.url).href)}; const request = JSON.parse(process.argv[1]); validateFeedback.handler({signal:new AbortController().signal}, request);`;
    const worker = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', script, JSON.stringify(request)],
      { encoding: 'utf8' },
    );
    assert.equal(worker.status, 0, worker.stderr);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
