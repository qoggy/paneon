import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  cpSync,
  rmSync,
  realpathSync,
  existsSync,
} from 'node:fs';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import type { Diagnostic } from '../src/shared/types.js';
type LocatedTypeScriptError = {
  code: number;
  message: string;
  file: string;
  line: number;
  column: number;
  frame: string;
};
const { buildDiagnostic, boundedText, stderrTail } = (await import(
  '../dist/compiler/' + 'diagnostics.js'
)) as typeof import('../src/compiler/diagnostics.js');
const { PaneonError, diagnostic, jsonValue } = (await import(
  '../dist/shared/' + 'types.js'
)) as typeof import('../src/shared/types.js');
const { compilePanel } = (await import(
  '../dist/compiler/' + 'index.js'
)) as typeof import('../src/compiler/index.js');
const { CompilerProcess } = (await import(
  '../dist/compiler/' + 'process.js'
)) as typeof import('../src/compiler/process.js');
const rootOfPackage = join(import.meta.dirname, '..');
const source = (extra = '') => `import{definePanel,serverAction,z}from'@qoggy/paneon/sdk';${extra}
export const call=serverAction({input:z.object({}),handler:()=>value});
function Panel(){return <h1>Working panel</h1>}
export default definePanel({id:'diagnostics',requires:{paneon:'*'},input:z.object({}),render:Panel});`;
async function fixture(run: (root: string, entry: string) => Promise<void> | void) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'paneon-diagnostics-')));
  try {
    await run(root, join(root, '中文 面板.tsx'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
function failure(error: unknown): Diagnostic {
  const value = error as Diagnostic;
  return typeof value?.code === 'string'
    ? {
        code: value.code,
        message: value.message,
        ...(value.details ? { details: value.details } : {}),
      }
    : diagnostic(error);
}
void test('build boundary retains domain codes/details, aggregates, cyclic causes, and plain JSON', () => {
  const cycle = new Error('original reason');
  cycle.cause = cycle;
  const error = new AggregateError(
    [
      Object.assign(cycle, {
        loc: { file: '/中文/面板.tsx', line: 4, column: 0 },
        frame: '4 | bad()',
      }),
    ],
    'outer summary',
  );
  const result = buildDiagnostic(error, 'client-build', '/entry.tsx');
  assert.equal(result.message, 'original reason');
  assert.equal(result.details?.file, '/中文/面板.tsx');
  assert.equal(result.details?.column, 1);
  assert.equal(result.details?.frame, '4 | bad()');
  assert.deepEqual(jsonValue(JSON.parse(JSON.stringify(result))), result);
  const domain = buildDiagnostic(
    new PaneonError('BUILD_SOURCE_CHANGED', 'source changed', { paths: ['/x'] }),
    'server-build',
  );
  assert.equal(domain.code, 'BUILD_SOURCE_CHANGED');
  assert.deepEqual(domain.details?.paths, ['/x']);
  assert.equal(buildDiagnostic(new Error('no position'), 'metadata').details?.file, undefined);
});
void test('UTF-8 limits keep valid characters across chunk boundaries and label truncation', () => {
  for (const tail of [false, true]) {
    const result = boundedText('中文🙂'.repeat(5000), 127, tail);
    assert.ok(Buffer.byteLength(result.text) <= 127);
    assert.ok(result.text.includes('[truncated]'));
    assert.ok(!result.text.includes('\ufffd'));
  }
  const stderr = stderrTail();
  const bytes = Buffer.from('中文🙂'.repeat(30000));
  for (let i = 0; i < bytes.length; i += 127) stderr.write(bytes.subarray(i, i + 127));
  const result = stderr.read();
  assert.ok(Buffer.byteLength(result.stderr) <= 64 * 1024);
  assert.equal(result.truncated, true);
  assert.ok(!result.stderr.includes('\ufffd'));
  const large = buildDiagnostic(
    Object.assign(new Error('中'.repeat(20000)), {
      frame: '片'.repeat(20000),
      stack: '栈'.repeat(20000),
    }),
    'client-build',
  );
  assert.ok(Buffer.byteLength(large.message) <= 8192);
  assert.ok(Buffer.byteLength(large.details?.frame as string) <= 16384);
  assert.ok(Buffer.byteLength(large.details?.stack as string) <= 32768);
  assert.equal(large.details?.truncated, true);
});
void test(
  'real TypeScript failure and compiler IPC preserve original reason and source coordinates',
  { timeout: 60000 },
  async () => {
    await fixture(async (root, entry) => {
      writeFileSync(entry, source("const value:number='wrong';"));
      const compiler = new CompilerProcess(entry, join(root, 'build'));
      await assert.rejects(compiler.result, (error: unknown) => {
        const d = failure(error);
        assert.equal(d.code, 'BUILD_FAILED');
        assert.match(d.message, /not assignable/);
        assert.equal(d.details?.stage, 'typecheck');
        assert.equal(d.details?.file, entry);
        assert.equal(d.details?.line, 1);
        assert.ok(Number(d.details?.column) > 1);
        assert.match(d.details?.frame as string, /wrong/);
        assert.equal(d.details?.diagnostic, d.message);
        return true;
      });
    });
  },
);
void test(
  'all TypeScript errors across source files survive compiler IPC in one failure',
  { timeout: 60000 },
  async () => {
    await fixture(async (root, entry) => {
      const dependency = join(root, 'dependency.ts');
      writeFileSync(dependency, "export const enabled:boolean='wrong';\n");
      writeFileSync(
        entry,
        source(
          "import {enabled} from './dependency';\nconst value:number='wrong';\nconst label:string=enabled;",
        ),
      );
      const compiler = new CompilerProcess(entry, join(root, 'build'));
      await assert.rejects(compiler.result, (error: unknown) => {
        const d = failure(error);
        const errors = d.details?.diagnostics as LocatedTypeScriptError[];
        assert.equal(d.code, 'BUILD_FAILED');
        assert.equal(d.details?.stage, 'typecheck');
        assert.equal(errors.length, 3);
        assert.deepEqual(
          errors.map(({ file, line, code }) => ({ file, line, code })),
          [
            { file: dependency, line: 1, code: 2322 },
            { file: entry, line: 2, code: 2322 },
            { file: entry, line: 3, code: 2322 },
          ],
        );
        for (const issue of errors) {
          assert.ok(Number(issue.column) > 0);
          assert.match(issue.message, /not assignable/);
          assert.match(issue.frame, /\^/);
          assert.ok(d.message.includes(issue.message));
          assert.ok(d.message.includes(`${issue.file}:${issue.line}:${issue.column}`));
        }
        assert.deepEqual(jsonValue(JSON.parse(JSON.stringify(d))), d);
        return true;
      });
    });
  },
);
void test(
  'all TypeScript errors remain structured when the existing summary length limit is reached',
  { timeout: 60000 },
  async () => {
    await fixture(async (root, entry) => {
      const expectedType = '中文'.repeat(150);
      const declarations = Array.from(
        { length: 25 },
        (_, index) => `const item${index}: '${expectedType}' = 'wrong';`,
      ).join('\n');
      writeFileSync(entry, source(`const value=1;\n${declarations}`));
      await assert.rejects(
        new CompilerProcess(entry, join(root, 'build')).result,
        (error: unknown) => {
          const d = failure(error);
          const errors = d.details?.diagnostics as LocatedTypeScriptError[];
          assert.equal(errors.length, 25);
          assert.equal(d.details?.truncated, true);
          assert.ok(Buffer.byteLength(d.message) <= 8192);
          assert.ok(!d.message.includes('\ufffd'));
          for (const [index, issue] of errors.entries()) {
            assert.equal(issue.code, 2322);
            assert.equal(issue.file, entry);
            assert.equal(issue.line, index + 2);
            assert.ok(issue.message.includes(expectedType));
          }
          return true;
        },
      );
    });
  },
);
void test(
  'dependency graph errors follow typecheck, survive IPC, and stop before bundling',
  { timeout: 60000 },
  async () => {
    await fixture(async (root, entry) => {
      const content = (value: string) => `
import {definePanel,z} from '@qoggy/paneon/sdk';
import {readFileSync} from 'node:fs';
import {basename} from 'node:path';
const value:number=${value};
function Panel(){return <div>{value+readFileSync('x','utf8')+basename('x')}</div>}
export default definePanel({id:'dependency-errors',requires:{paneon:'*'},input:z.object({}),render:Panel});`;
      const buildRoot = join(root, 'build');
      writeFileSync(entry, content("'wrong'"));
      await assert.rejects(new CompilerProcess(entry, buildRoot).result, (error: unknown) => {
        const d = failure(error);
        assert.equal(d.details?.stage, 'typecheck');
        assert.doesNotMatch(d.message, /Browser code cannot import/);
        return true;
      });
      writeFileSync(entry, content('1'));
      await assert.rejects(new CompilerProcess(entry, buildRoot).result, (error: unknown) => {
        const d = failure(error);
        const errors = d.details?.diagnostics as Record<string, string | number>[];
        assert.equal(d.details?.stage, 'dependency-graph');
        assert.deepEqual(
          errors.map((issue) => issue.dependency),
          ['node:fs', 'node:path'],
        );
        assert.deepEqual(
          errors.map((issue) => issue.line),
          [3, 4],
        );
        assert.ok(d.message.includes('node:fs'));
        assert.ok(d.message.includes('node:path'));
        assert.deepEqual(jsonValue(JSON.parse(JSON.stringify(d))), d);
        return true;
      });
      assert.equal(existsSync(buildRoot), false, 'invalid graphs must not enter bundling');
    });
  },
);
void test(
  'a missing runtime dependency does not hide an independent browser Node import',
  { timeout: 60000 },
  async () => {
    await fixture(async (root, entry) => {
      // TypeScript can read declarations even when the runtime source is missing.
      writeFileSync(join(root, 'missing.d.ts'), 'export const missing:string;');
      writeFileSync(
        join(root, 'available.ts'),
        "import {basename} from 'node:path';\nexport const value=basename('x');",
      );
      writeFileSync(
        entry,
        `import {definePanel,z} from '@qoggy/paneon/sdk';
import {missing} from './missing.js';
import {value} from './available';
function Panel(){return <div>{missing+value}</div>}
export default definePanel({id:'missing-runtime',requires:{paneon:'*'},input:z.object({}),render:Panel});`,
      );
      await assert.rejects(
        new CompilerProcess(entry, join(root, 'build')).result,
        (error: unknown) => {
          const d = failure(error);
          const errors = d.details?.diagnostics as Record<string, string | number>[];
          assert.equal(d.details?.stage, 'dependency-graph');
          assert.deepEqual(
            errors.map((issue) => issue.dependency),
            ['./missing.js', 'node:path'],
          );
          assert.deepEqual(
            errors.map((issue) => issue.file),
            [entry, join(root, 'available.ts')],
          );
          return true;
        },
      );
    });
  },
);
void test(
  'real dependency build and module initialization failures retain tool errors without fabricated TSX positions',
  { timeout: 120000 },
  async () => {
    await fixture(async (root, entry) => {
      writeFileSync(entry, source("import './missing.css';const value=1;"));
      await assert.rejects(compilePanel(entry, join(root, 'build')), (error: unknown) => {
        const d = failure(error);
        assert.equal(d.details?.stage, 'client-build');
        assert.match(d.message, /missing.css/);
        return true;
      });
      writeFileSync(
        entry,
        source("const value=(()=>{throw new Error('module initialization 中文 failed')})();"),
      );
      await assert.rejects(compilePanel(entry, join(root, 'build')), (error: unknown) => {
        const d = failure(error);
        assert.equal(d.details?.stage, 'metadata');
        assert.match(d.message, /module initialization 中文 failed/);
        assert.match(d.details?.stack as string, /server.js/);
        assert.notEqual(
          d.details?.file,
          entry,
          'generated bundle stack must not become a TSX position',
        );
        return true;
      });
    });
  },
);
void test(
  'abnormal process keeps exit/signal and bounded stderr; structured IPC wins over stderr and cleanup failure',
  { timeout: 30000 },
  async () => {
    await fixture(async (root) => {
      // A minimal separate package exercises the actual process implementation with
      // a controlled compiler executable, without changing the repository worker.
      const pkg = join(root, 'package');
      mkdirSync(join(pkg, 'dist/compiler'), { recursive: true });
      mkdirSync(join(pkg, 'dist/shared'), { recursive: true });
      writeFileSync(join(pkg, 'package.json'), '{"type":"module","version":"0.0.0"}');
      for (const file of [
        'compiler/process.js',
        'compiler/diagnostics.js',
        'shared/types.js',
        'shared/paths.js',
      ])
        cpSync(join(rootOfPackage, 'dist', file), join(pkg, 'dist', file));
      const { CompilerProcess: FakeCompiler } = (await import(
        join(pkg, 'dist/compiler/process.js')
      )) as { CompilerProcess: typeof CompilerProcess };
      const worker = join(pkg, 'dist/compiler/worker.js');
      writeFileSync(
        worker,
        "process.on('message',()=>{process.stderr.write('中文🙂'.repeat(30000),()=>process.exit(23));});",
      );
      const exited = new FakeCompiler('/entry.tsx', join(root, 'build'));
      Object.assign(exited, {
        cleanup: () => {
          throw new Error('cleanup failure');
        },
      });
      await assert.rejects(exited.result, (error: unknown) => {
        const d = failure(error);
        assert.equal(d.details?.exitCode, 23);
        assert.equal(d.details?.stage, 'process');
        assert.equal(d.details?.truncated, true);
        assert.ok(Buffer.byteLength(d.details?.stderr as string) <= 65536);
        assert.ok(!(d.details?.stderr as string).includes('\ufffd'));
        assert.doesNotMatch(d.message, /cleanup/);
        return true;
      });
      writeFileSync(worker, "process.on('message',()=>process.kill(process.pid,'SIGTERM'));");
      await assert.rejects(new FakeCompiler('/entry.tsx', root).result, (error: unknown) => {
        assert.equal(failure(error).details?.signal, 'SIGTERM');
        return true;
      });
      writeFileSync(
        worker,
        "process.on('message',()=>{process.stderr.write('must not replace structured failure');process.send({ok:false,error:{code:'BUILD_SOURCE_CHANGED',message:'specific failure',details:{stage:'server-build',file:'/a.tsx',line:2,column:3}}},()=>process.exit(1));});",
      );
      const structured = new FakeCompiler('/entry.tsx', root);
      Object.assign(structured, {
        cleanup: () => {
          throw new Error('cleanup failure');
        },
      });
      await assert.rejects(structured.result, (error: unknown) => {
        assert.deepEqual(failure(error), {
          code: 'BUILD_SOURCE_CHANGED',
          message: 'specific failure',
          details: { stage: 'server-build', file: '/a.tsx', line: 2, column: 3 },
        });
        return true;
      });
      assert.ok(readFileSync(worker, 'utf8').includes('specific failure'));
    });
  },
);

void test('actual Rolldown and esbuild error locations normalize their documented column units', async () => {
  await fixture(async (root) => {
    const input = join(root, 'invalid.js');
    writeFileSync(input, 'export const = ;');
    const { build } = await import('vite');
    await assert.rejects(
      build({
        configFile: false,
        logLevel: 'silent',
        build: { write: false, lib: { entry: input, formats: ['es'] } },
      }),
      (error: unknown) => {
        const value = buildDiagnostic(error, 'client-build');
        assert.equal(value.details?.file, input);
        assert.equal(value.details?.line, 1);
        assert.equal(value.details?.column, 14);
        assert.match(value.message, /Unexpected token/);
        assert.ok(
          !value.message.includes('\u001b'),
          'terminal color escapes must not leak into the browser message',
        );
        return true;
      },
    );
    const esbuild = await import('esbuild');
    await assert.rejects(
      esbuild.transform('const 中文 = ;', { sourcefile: input, logLevel: 'silent' }),
      (error: unknown) => {
        const value = buildDiagnostic(error, 'client-build');
        assert.equal(value.details?.file, input);
        assert.equal(value.details?.column, 12);
        assert.equal(value.details?.frame, 'const 中文 = ;');
        return true;
      },
    );
  });
});
void test(
  'metadata process exit retains stderr immediately and compiler cleanup cannot replace a bundling error',
  { timeout: 60000 },
  async () => {
    await fixture(async (root, entry) => {
      writeFileSync(
        entry,
        source(
          "const value=(()=>{process.stderr.write('metadata abnormal 中文 exit');process.exit(29)})();",
        ),
      );
      await assert.rejects(compilePanel(entry, join(root, 'build')), (error: unknown) => {
        const value = failure(error);
        assert.equal(value.details?.stage, 'metadata');
        assert.equal(value.details?.exitCode, 29);
        assert.match(value.details?.stderr as string, /metadata abnormal 中文 exit/);
        return true;
      });
      writeFileSync(entry, source("import './missing.css';const value=1;"));
      const script = `import fs from 'node:fs';import{syncBuiltinESMExports}from'node:module';
      const original=fs.rmSync;fs.rmSync=(path,options)=>{if(String(path).endsWith('-build')&&fs.existsSync(path))throw new Error('injected cleanup failure');return original(path,options)};syncBuiltinESMExports();
      const {compilePanel}=await import(${JSON.stringify(pathToFileURL(join(rootOfPackage, 'dist/compiler/index.js')).href)});
      try{await compilePanel(${JSON.stringify(entry)},${JSON.stringify(join(root, 'cleanup-build'))});process.exitCode=1}catch(error){console.log(JSON.stringify({code:error.code,message:error.message,details:error.details}))}`;
      const result = await promisify(execFile)(
        process.execPath,
        ['--input-type=module', '-e', script],
        { timeout: 30000 },
      );
      const value = JSON.parse(result.stdout) as Diagnostic;
      assert.equal(value.code, 'BUILD_FAILED');
      assert.equal(value.details?.stage, 'client-build');
      assert.match(value.message, /missing.css/);
      assert.doesNotMatch(value.message, /cleanup failure/);
    });
  },
);

void test('aggregate sibling locations, frames and stacks cannot be attached to another error message', () => {
  const first = new Error('Dependency A could not resolve');
  const second = Object.assign(new Error('CSS B is invalid'), {
    loc: { file: '/work/b.css', line: 3, column: 0 },
    frame: '3 | broken css',
    stack: 'CSS B stack',
  });
  const result = buildDiagnostic(
    new AggregateError([first, second], 'Build failed'),
    'client-build',
  );
  assert.equal(result.message, first.message);
  assert.equal(result.details?.file, undefined);
  assert.equal(result.details?.line, undefined);
  assert.equal(result.details?.frame, undefined);
  assert.equal(result.details?.stack, first.stack);
  assert.equal(result.details?.cause, undefined);
  const positioned = buildDiagnostic(
    new AggregateError([second, first], 'Build failed'),
    'client-build',
  );
  assert.equal(positioned.message, second.message);
  assert.equal(positioned.details?.file, '/work/b.css');
  assert.equal(positioned.details?.column, 1);
  assert.equal(positioned.details?.frame, second.frame);
  assert.equal(positioned.details?.stack, second.stack);
});
