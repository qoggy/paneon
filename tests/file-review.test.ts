import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chmod, mkdtemp, writeFile, rm, mkdir, unlink, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { z } from '@qoggy/paneon/sdk';
import {
  fileReviewParamsSchema,
  fileFeedbackSchema,
  fileReviewSubmittedSchema,
  validateSources,
} from '#test-skill/assets/panels/file-review/schema.ts';
import type { FileFeedback, Snapshot } from '#test-skill/assets/panels/file-review/schema.ts';
import {
  readManifestFile,
  readFile,
  snapshotId,
  validateFeedback,
  resolvePaths,
} from '#test-skill/assets/panels/file-review/actions.ts';
import { publicFileFeedback } from '#test-skill/assets/panels/file-review/feedback.ts';
import {
  ancestorKeys,
  directoryKeys,
  fileTree,
  initialExpandedKeys,
  fileLanguage,
  isMarkdown,
  visibleFileCount,
} from '#test-skill/assets/panels/file-review/model.ts';
import { TEXT_FILE_MAX_BYTES } from '#test-skill/assets/shared/read-text-file.js';
import { discoverFiles } from '#test-skill/assets/panels/file-review/directory.ts';

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
  for (const value of [
    { directories: ['src', '/workspace/tests'] },
    { files: [], directories: ['src'] },
    { files: ['plan.md'], directories: [] },
    { files: ['plan.md'], directories: ['src', 'tests'] },
  ])
    assert.deepEqual(fileReviewParamsSchema.parse(value), value);
  for (const value of [
    {},
    { directories: [] },
    { files: [], directories: [] },
    { directories: [' '] },
  ])
    assert.equal(fileReviewParamsSchema.safeParse(value).success, false);
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

void test('directory lists merge nested roots and explicit files without reading content', async () => {
  const root = await mkdtemp(join(tmpdir(), 'paneon-file-directories-'));
  try {
    const names = ['src/b.ts', 'src/nested/a.ts', 'tests/a.test.ts', '.hidden/config', 'plan.md'];
    for (const name of names) {
      await mkdir(join(root, name, '..'), { recursive: true });
      await writeFile(join(root, name), name);
    }
    await writeFile(join(root, 'src/binary'), Buffer.from([0, 255]));
    await writeFile(join(root, 'src/large'), Buffer.alloc(TEXT_FILE_MAX_BYTES + 1));
    await symlink(join(root, 'src/b.ts'), join(root, 'src/link.ts'));
    await symlink(join(root, 'src'), join(root, 'src/loop'));
    const params = {
      files: ['plan.md', 'src/b.ts', './src/b.ts'],
      directories: ['src/nested', 'src', './src', 'tests', '.hidden'],
    };
    const result = await discoverFiles(root, params);
    assert.deepEqual(result.files, [
      ...params.files,
      'src/nested/a.ts',
      'src/binary',
      'src/large',
      'src/link.ts',
      'tests/a.test.ts',
      '.hidden/config',
    ]);
    assert.deepEqual(
      result.paths,
      result.files.map((path) => resolve(root, path)),
    );
    assert.deepEqual(result.issues, []);
    assert.equal(
      result.links.find((link) => link.path === join(root, 'src/link.ts'))?.kind,
      'file',
    );
    assert.equal(result.links.find((link) => link.path === join(root, 'src/loop'))?.cycle, true);
    const absolute = await discoverFiles(join(root, 'tests'), {
      directories: [join(root, 'src/nested')],
    });
    assert.deepEqual(absolute.files, [join(root, 'src/nested/a.ts')]);
    const resolved = await resolvePaths.handler(ctx, {
      directories: [join(root, 'src', '..', 'src')],
    });
    assert.deepEqual(resolved.directories, [join(root, 'src')]);
    await symlink(join(root, '.hidden'), join(root, 'root-link'));
    assert.deepEqual((await discoverFiles(root, { directories: ['root-link'] })).files, [
      'root-link/config',
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

void test('initial expansion reveals supplied sources and preserves directory boundaries', () => {
  const directories = ['/workspace/src', '/workspace/tests'];
  const paths = [
    '/workspace/src/components/Button.tsx',
    '/workspace/docs/plan.md',
    '/workspace/src/forms/input.ts',
    '/workspace/src/index.ts',
    '/workspace/tests/a.test.ts',
  ];
  const roots = fileTree(paths, true, directories);
  assert.deepEqual(
    new Set(initialExpandedKeys(roots, directories, 2)),
    new Set([
      'directory:/workspace',
      'directory:/workspace/src',
      'directory:/workspace/src/components',
      'directory:/workspace/docs',
      'directory:/workspace/tests',
    ]),
  );
  const chain = fileTree(['/workspace/src/deep/nested/a.ts'], true, ['/workspace/src']);
  assert.equal(chain[0].key, 'directory:/workspace/src');
  assert.equal(chain[0].nodes?.[0].name, 'deep/nested');
  assert.deepEqual(initialExpandedKeys(chain, ['/workspace/src'], 0), ['directory:/workspace/src']);
  const nestedRoots = ['/workspace/src', '/workspace/src/deep/nested'];
  const overlapping = fileTree(['/workspace/src/deep/nested/a.ts'], true, nestedRoots);
  assert.deepEqual(
    new Set(initialExpandedKeys(overlapping, nestedRoots, 0)),
    new Set(nestedRoots.map((path) => `directory:${path}`)),
  );
  const explicitOnly = fileTree(paths);
  assert.deepEqual(
    new Set(initialExpandedKeys(explicitOnly, [], paths.length)),
    new Set(directoryKeys(explicitOnly)),
  );
  const filesystemRoot = fileTree(['/etc/hosts'], true, ['/']);
  assert.equal(filesystemRoot[0].name, '/');
  assert.equal(filesystemRoot[0].key, 'directory:/');
  assert.deepEqual(initialExpandedKeys(filesystemRoot, ['/'], 0), ['directory:/']);
});

void test('symbolic links retain targets, scan directory aliases and stop ancestor cycles', async () => {
  const root = await mkdtemp(join(tmpdir(), 'paneon-symbolic-links-'));
  try {
    const review = join(root, 'review');
    await mkdir(review);
    await mkdir(join(root, 'target/empty'), { recursive: true });
    await writeFile(join(root, 'target/value.ts'), 'export const linkedValue = 42;\n');
    await symlink('../target/value.ts', join(review, 'alias.ts'));
    await symlink('../target', join(review, 'linked-dir'));
    await symlink('../target', join(review, 'second-dir'));
    await symlink('../target/empty', join(review, 'empty-dir'));
    await symlink('../target/missing.ts', join(review, 'broken.ts'));
    await symlink('../review', join(root, 'target/back'));
    const result = await discoverFiles(review, { directories: ['.'] });
    assert.deepEqual(result.files, [
      'alias.ts',
      'broken.ts',
      'linked-dir/value.ts',
      'second-dir/value.ts',
    ]);
    assert.deepEqual(result.issues, []);
    const byPath = new Map(result.links.map((link) => [link.path, link]));
    assert.equal(byPath.get(join(review, 'alias.ts'))?.target, '../target/value.ts');
    assert.equal(byPath.get(join(review, 'alias.ts'))?.kind, 'file');
    assert.equal(byPath.get(join(review, 'broken.ts'))?.error?.code, 'ENOENT');
    assert.equal(byPath.get(join(review, 'linked-dir'))?.cycle, false);
    assert.equal(byPath.get(join(review, 'second-dir'))?.cycle, false);
    assert.equal(byPath.get(join(review, 'linked-dir/back'))?.cycle, true);
    assert.equal(byPath.get(join(review, 'second-dir/back'))?.cycle, true);
    const tree = fileTree(result.paths, true, [review], result.links);
    const nodes = new Map<string, (typeof tree)[number]>();
    function collect(items: typeof tree) {
      for (const node of items) {
        nodes.set(node.key, node);
        collect(node.nodes ?? []);
      }
    }
    collect(tree);
    assert.equal(nodes.get(`directory:${join(review, 'linked-dir')}`)?.link?.kind, 'directory');
    assert.equal(nodes.get(`directory:${join(review, 'linked-dir/back')}`)?.nodes, undefined);
    assert.deepEqual(nodes.get(`directory:${join(review, 'empty-dir')}`)?.nodes, []);
    const opened = await readManifestFile(review, result.files, 2);
    assert.equal(opened.path, join(review, 'linked-dir/value.ts'));
    assert.match(opened.text, /linkedValue/);
    const feedback = {
      annotations: [{ id: 'link', targets: [target(opened, 'linkedValue')], comment: '' }],
    };
    await unlink(join(review, 'linked-dir'));
    assert.equal(
      validateFeedback.handler(ctx, {
        params: { directories: [review] },
        feedback,
        evidence: { files: [opened] },
      }),
      feedback,
    );
    const explicit = await discoverFiles(review, { files: ['alias.ts', './alias.ts'] });
    assert.deepEqual(explicit.files, ['alias.ts', './alias.ts']);
    assert.equal(explicit.links.length, 1);
    assert.equal(explicit.links[0].kind, 'file');
    const rootLink = await discoverFiles(review, { directories: ['second-dir'] });
    assert.equal(
      rootLink.links.find((link) => link.path === join(review, 'second-dir'))?.kind,
      'directory',
    );
    const combined = await discoverFiles(review, { directories: ['.', 'second-dir'] });
    for (const path of rootLink.paths) assert.ok(combined.paths.includes(path));
    assert.equal(
      combined.links.find((link) => link.path === join(review, 'second-dir/back'))?.cycle,
      false,
      'An explicit root must not inherit cycle restrictions from its parent input',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

void test('directory read failures stay visible without blocking other sources or an empty directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'paneon-file-directory-errors-'));
  try {
    await mkdir(join(root, 'empty'));
    await mkdir(join(root, 'readable'));
    await writeFile(join(root, 'readable/a.ts'), 'const a = 1;');
    await writeFile(join(root, 'plan.md'), '# Plan');
    const result = await discoverFiles(root, {
      files: ['plan.md'],
      directories: ['missing', 'plan.md', 'readable', 'empty'],
    });
    assert.deepEqual(result.files, ['plan.md', 'readable/a.ts']);
    assert.deepEqual(
      result.issues.map(({ path, code }) => [path, code]),
      [
        [join(root, 'missing'), 'ENOENT'],
        [join(root, 'plan.md'), 'ENOTDIR'],
      ],
    );
    assert.deepEqual(await discoverFiles(root, { directories: ['empty'] }), {
      files: [],
      paths: [],
      links: [],
      issues: [],
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

void test('discovered-file feedback keeps the original source after its directory is removed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'paneon-directory-evidence-'));
  try {
    const params = { directories: [root] };
    await writeFile(join(root, 'a.ts'), 'const value = 1;');
    const manifest = await discoverFiles(root, params);
    const file = await readManifestFile(root, manifest.paths, 0);
    const request = {
      params,
      feedback: { annotations: [{ id: 'a', targets: [target(file, 'value')], comment: '' }] },
      evidence: { files: [file] },
    };
    await rm(root, { recursive: true });
    assert.equal(validateFeedback.handler(ctx, request), request.feedback);
    assert.equal(publicFileFeedback(request.feedback, request.evidence).files[0].path, file.path);
    const sibling = structuredClone(request);
    sibling.evidence.files[0].path = root + '-other/a.ts';
    assert.throws(() => validateFeedback.handler(ctx, sibling), /inconsistent/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
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
    assert.deepEqual(await readFile.handler(ctx, { path: file.path, fileIndex: 0 }), {
      ok: true,
      snapshot: { ...file, fileIndex: 0 },
    });
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
    ]) {
      await assert.rejects(readManifestFile(root, [path], 0), { code });
      const result = await readFile.handler(ctx, { path: join(root, path), fileIndex: 0 });
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error.code, code);
    }
    await assert.rejects(readManifestFile(root, [name], 1), /index/);
    const indexed = await readFile.handler(ctx, { path: file.path, fileIndex: 12 });
    assert.equal(indexed.ok && indexed.snapshot.fileIndex, 12);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

void test('file feedback preserves saved quotes and ranges without comparing original text', () => {
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
  assert.equal(validateSources(fileFeedbackSchema.parse(draft), evidence).annotations.length, 2);
  const result = publicFileFeedback(draft, evidence);
  assert.deepEqual(fileReviewSubmittedSchema.parse(result), result);
  assert.equal(result.files.length, 2);
  assert.equal(result.files[0].annotations[0].targets.length, 2);
  assert.equal('id' in result.files[0].annotations[0], false);
  assert.equal('ref' in result.files[0].annotations[0].targets[0], false);
  assert.deepEqual(draft, original);
  const wrong = structuredClone(draft);
  wrong.annotations[0].targets[0].text!.quote = 'wrong';
  assert.equal(validateSources(wrong, evidence), wrong);
  assert.deepEqual(publicFileFeedback(wrong, evidence).files[0].annotations[0].targets[0], {
    text: wrong.annotations[0].targets[0].text,
  });
  const split = structuredClone(draft);
  split.annotations[1].targets[0].text = {
    start: b.text.indexOf('é'),
    end: b.text.indexOf('é') + 1,
    quote: 'e',
  };
  assert.equal(validateSources(split, evidence), split);
  assert.throws(() => validateSources(draft, { files: [a, a] }), /Duplicate/);
  assert.throws(() => validateSources(draft, { files: [a] }), /Missing/);
  assert.throws(() => validateSources({ annotations: [] }, { files: [] }), /at least one/);
  assert.deepEqual(
    publicFileFeedback(validateSources({ annotations: [], replacesEventId: 17 }, { files: [] }), {
      files: [],
    }),
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
  validateSources(draft, evidence);
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

void test('path selections publish their saved quote without comparing the supplied path', () => {
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
  validateSources(draft, evidence);
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
  assert.equal(validateSources(wrong, evidence), wrong);
  const bodyAsPath = structuredClone(draft);
  assert.ok('fileIndex' in bodyAsPath.annotations[1].targets[0].ref);
  bodyAsPath.annotations[1].targets[0].ref.part = 'path';
  assert.equal(validateSources(bodyAsPath, evidence), bodyAsPath);
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

void test('submission uses file metadata without checking the original text or digest', async () => {
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
    for (const patch of [{ path: path + '.other' }, { fileIndex: 9 }]) {
      const changed = structuredClone(request);
      Object.assign(changed.evidence.files[0], patch);
      assert.throws(() => validateFeedback.handler(ctx, changed), /inconsistent/);
    }
    const changedText = structuredClone(request);
    changedText.evidence.files[0].text = 'different text with the same saved metadata';
    assert.equal(validateFeedback.handler(ctx, changedText), changedText.feedback);
    const script = `import {validateFeedback} from ${JSON.stringify(import.meta.resolve('#test-skill/assets/panels/file-review/actions.ts'))}; const request = JSON.parse(process.argv[1]); validateFeedback.handler({signal:new AbortController().signal}, request);`;
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
