import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDiffModel } from '../src/shared/diff-model.ts';
import { diffPresentation } from '../src/ui/diff-presentation.ts';

const present = (old: string, next: string) => diffPresentation(createDiffModel(old, next).rows);

void test('replacement highlights changed words on both sides without coloring their common suffix', () => {
  const { split } = present(
    '生成的 `get{InterfaceName}` 是纯工厂函数\n',
    '生成的 `build{InterfaceName}` 是纯工厂函数\n',
  );
  assert.equal(split[0].old?.kind, 'modify');
  assert.equal(split[0].new?.kind, 'modify');
  for (const [side, expected] of [
    ['old', 'get'],
    ['new', 'build'],
  ] as const) {
    const cell = split[0][side];
    assert.ok(cell);
    assert.deepEqual(
      cell.spans.map((s) => [s.kind, cell.line.text.slice(s.start, s.end)]),
      [['modify', expected]],
    );
  }
});

void test('one modified line distinguishes local deletion, insertion and replacement', () => {
  const { split } = present(
    '注意：连接内网，使用 JDK8。\n',
    '连接内网，使用 Java11。并记录日志。\n',
  );
  const left = split[0].old,
    right = split[0].new;
  assert.ok(left && right);
  assert.deepEqual(
    left.spans.map((s) => [s.kind, left.line.text.slice(s.start, s.end)]),
    [
      ['delete', '注意：'],
      ['modify', 'JDK8'],
    ],
  );
  assert.deepEqual(
    right.spans.map((s) => [s.kind, right.line.text.slice(s.start, s.end)]),
    [
      ['modify', 'Java11'],
      ['add', '并记录日志。'],
    ],
  );
});

void test('block matching aligns changed code around an inserted line and a removed command', () => {
  const inserted = present(
    'const first = 1;\nconst second = 2;\n',
    '// added comment\nconst first = 10;\nconst second = 20;\n',
  ).split;
  assert.equal(inserted[0].old, undefined);
  assert.equal(inserted[0].new?.kind, 'add');
  assert.deepEqual(
    inserted.slice(1).map((row) => [row.old?.line.number, row.new?.line.number]),
    [
      [1, 2],
      [2, 3],
    ],
  );
  const removed = present(
    '# macOS 安装 JDK 8 示例\nbrew install --cask temurin@8\nexport JAVA_HOME=$(/usr/libexec/java_home -v 1.8)\n',
    '# macOS 选择已安装的 Java11\nexport JAVA_HOME=$(/usr/libexec/java_home -v 11)\n',
  ).split;
  assert.equal(removed[1].old?.kind, 'delete');
  assert.equal(removed[1].new, undefined);
  assert.equal(removed[2].old?.line.number, 3);
  assert.equal(removed[2].new?.line.number, 2);
});

void test('pure additions and deletions use block colors; unchanged content has no marks', () => {
  for (const [old, next, side, kind] of [
    ['', '新增\n', 'new', 'add'],
    ['删除\n', '', 'old', 'delete'],
    ['相同\n', '相同\n', 'new', 'context'],
  ] as const) {
    const cell = present(old, next).split[0][side];
    assert.equal(cell?.kind, kind);
    assert.deepEqual(cell?.spans, []);
  }
});

void test('wrapping and joining retain modified line types for words matched across row boundaries', () => {
  const wrapped = present(
    '  const result = await client.request(method, url, payload);\n',
    '  const result = await client.request(\n    method,\n    url,\n    payload,\n  );\n',
  );
  assert.equal(wrapped.split.length, 5);
  assert.ok(wrapped.split.every((row) => row.new?.kind === 'modify'));
  assert.ok(wrapped.split.slice(1).some((row) => row.new?.spans.length));
  const joined = present('  call(\n    alpha,\n    beta,\n  );\n', '  call(alpha, beta);\n');
  assert.equal(joined.split.length, 4);
  assert.ok(joined.split.every((row) => row.old?.kind === 'modify'));
  assert.equal(joined.split.filter((row) => row.new).length, 1);
});

void test('presentation preserves every UTF-16 source coordinate, CRLF and Unicode grapheme', () => {
  const old = '前文\r\nconst label = "重复 é🙂";\r\n末尾无换行';
  const next = '前文\r\nconst label = "重复 é🚀 新增";\r\n末尾已修改';
  const result = present(old, next);
  for (const [side, source] of [
    ['old', old],
    ['new', next],
  ] as const) {
    const cells = result.split.flatMap((row) => (row[side] ? [row[side]] : []));
    assert.equal(cells.map((cell) => cell.line.text).join(''), source);
    assert.equal(
      result.unified
        .filter((row) => row.side === side || row.cell.kind === 'context')
        .map((row) => row.cell.line.text)
        .join(''),
      source,
    );
    for (const cell of cells) {
      assert.equal(source.slice(cell.line.start, cell.line.end), cell.line.text);
      const boundaries = new Set([
        0,
        ...Array.from(
          new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(cell.line.text),
          (p) => p.index + p.segment.length,
        ),
      ]);
      for (const span of cell.spans) {
        assert.ok(boundaries.has(span.start) && boundaries.has(span.end));
        assert.equal(
          source.slice(cell.line.start + span.start, cell.line.start + span.end),
          cell.line.text.slice(span.start, span.end),
        );
      }
    }
  }
});

void test('large unrelated blocks remain exact when detailed comparison reaches its limit', () => {
  const old = Array.from({ length: 1200 }, (_, i) => `old_${i} value_${i}\n`).join('');
  const next = Array.from({ length: 1200 }, (_, i) => `new_${i} other_${i}\n`).join('');
  const result = present(old, next);
  assert.equal(result.split.flatMap((r) => r.old?.line.text ?? []).join(''), old);
  assert.equal(result.split.flatMap((r) => r.new?.line.text ?? []).join(''), next);
  assert.ok(result.split.every((r) => r.old?.kind === 'modify' && r.new?.kind === 'modify'));
});

void test('random line edits never lose or reorder source text', () => {
  let seed = 314159;
  const random = (n: number) => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed % n;
  };
  for (let round = 0; round < 100; round++) {
    const lines = Array.from(
      { length: 20 },
      (_, i) => `const value${i} = "中文 ${random(8)} 🙂";\r\n`,
    );
    const next = [...lines];
    for (let edit = 0; edit < 8; edit++) {
      const index = random(next.length);
      switch (random(3)) {
        case 0:
          next.splice(index, 0, `// inserted ${edit}\n`);
          break;
        case 1:
          next.splice(index, 1);
          break;
        case 2:
          next[index] = next[index].replace('const', 'let');
          break;
      }
    }
    const result = present(lines.join(''), next.join(''));
    for (const [side, source] of [
      ['old', lines.join('')],
      ['new', next.join('')],
    ] as const)
      assert.equal(result.split.flatMap((r) => r[side]?.line.text ?? []).join(''), source);
  }
});
