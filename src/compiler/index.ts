import { createHash } from 'node:crypto';
import {
  mkdirSync,
  writeFileSync,
  renameSync,
  existsSync,
  rmSync,
  readdirSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { join, dirname, resolve, relative, extname } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import semver from 'semver';
import { build, createServer } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { SourceSnapshot } from './source-snapshot.js';
import type { Graph } from './action-transform.js';
import type { Plugin, ViteDevServer } from 'vite';
import { PACKAGE_ROOT, PACKAGE_VERSION } from '../shared/paths.js';
import { PaneonError } from '../shared/types.js';
import type { Manifest, JsonValue } from '../shared/types.js';
import {
  parseModule,
  staticRequirement,
  createGraph,
  resolveThirdParty,
} from './action-transform.js';
const require = createRequire(import.meta.url);
export const sdkPath = join(PACKAGE_ROOT, 'dist/sdk');
const uiEntry = join(PACKAGE_ROOT, 'dist/ui/index.js');
export function validateRequirement(
  entry: string,
  version = PACKAGE_VERSION,
  readSource?: (file: string) => string,
) {
  const range = staticRequirement(parseModule(entry, readSource), version);
  if (!range.trim() || !semver.validRange(range))
    throw new PaneonError(
      'INVALID_PANEON_REQUIREMENT',
      'requires.paneon must be a valid npm semver range.',
      { requiredRange: range, currentVersion: version, entryPath: entry },
    );
  if (!semver.satisfies(version, range))
    throw new PaneonError(
      'PANEON_VERSION_UNSUPPORTED',
      'The panel requires a different Paneon version.',
      { requiredRange: range, currentVersion: version, entryPath: entry },
    );
  return range;
}
function typecheck(entry: string, snapshot: SourceSnapshot) {
  const options: ts.CompilerOptions = {
    noEmit: true,
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX,
    strict: true,
    skipLibCheck: true,
    allowImportingTsExtensions: true,
    types: ['node'],
    typeRoots: [dirname(dirname(require.resolve('@types/node/package.json')))],
    esModuleInterop: true,
  };
  const host = ts.createCompilerHost(options);
  host.readFile = (file) => {
    try {
      return snapshot.text(file);
    } catch {
      return undefined;
    }
  };
  host.resolveModuleNames = (names, containingFile) =>
    names.map((name) => {
      const mapped =
        name === 'paneon/sdk'
          ? join(sdkPath, 'index.d.ts')
          : name === 'paneon/ui'
            ? join(PACKAGE_ROOT, 'dist/ui/index.d.ts')
            : undefined;
      if (mapped && existsSync(mapped))
        return {
          resolvedFileName: mapped,
          extension: ts.Extension.Dts,
          isExternalLibraryImport: true,
        };
      const normal = ts.resolveModuleName(name, containingFile, options, host).resolvedModule;
      if (normal) return normal;
      return ts.resolveModuleName(name, join(PACKAGE_ROOT, 'package.json'), options, host)
        .resolvedModule;
    });
  const program = ts.createProgram(
    [entry, join(dirname(require.resolve('vite/package.json')), 'client.d.ts')],
    options,
    host,
  );
  const errors = ts
    .getPreEmitDiagnostics(program)
    .filter((d) => d.category === ts.DiagnosticCategory.Error);
  if (errors.length) {
    const d = errors[0];
    const location =
      d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start) : undefined;
    throw new PaneonError('BUILD_FAILED', 'Panel TypeScript checking failed.', {
      entryPath: d.file?.fileName ?? entry,
      ...(location ? { line: location.line + 1, column: location.character + 1 } : {}),
      diagnostic: ts.flattenDiagnosticMessageText(d.messageText, ' '),
    });
  }
}
export function panelPlugin(
  entry: string,
  side: 'client' | 'server',
  graph: Graph = createGraph(entry, side),
): Plugin {
  return {
    name: 'paneon-actions',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source === 'paneon/sdk' || source === 'paneon/sdk/client')
        return join(sdkPath, side === 'client' ? 'client.js' : 'server.js');
      if (source === 'paneon/ui')
        return existsSync(uiEntry) ? uiEntry : join(PACKAGE_ROOT, 'src/ui/index.ts');
      if (
        source === 'react' ||
        source.startsWith('react/') ||
        source === 'react-dom' ||
        source.startsWith('react-dom/') ||
        source === 'zod'
      )
        return require.resolve(source);
      if (
        importer &&
        !source.startsWith('.') &&
        !source.startsWith('/') &&
        !source.startsWith('\0') &&
        !source.startsWith('node:') &&
        !source.includes('?') &&
        graph.modules.has(importer.split('?')[0])
      )
        return resolveThirdParty(source, importer);
    },
    transform(_code, id) {
      const file = id.split('?')[0];
      if (graph.sources.has(file)) return { code: graph.sources.get(file)!, map: null };
      return undefined;
    },
  };
}
function files(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? files(join(root, d.name)) : [join(root, d.name)],
  );
}
export type CompiledPanel = { manifest: Manifest; directory: string };
export async function compilePanel(entry: string, panelRoot: string): Promise<CompiledPanel> {
  entry = realpathSync(entry);
  const snapshot = new SourceSnapshot();
  const readSource = (file: string) => snapshot.text(file);
  const range = validateRequirement(entry, PACKAGE_VERSION, readSource);
  typecheck(entry, snapshot);
  const client = createGraph(entry, 'client', readSource);
  const server = createGraph(entry, 'server', readSource);
  const dependencySet = new Set([
    ...client.modules.keys(),
    ...server.modules.keys(),
    ...[...snapshot.files].filter(
      (path) =>
        !path.includes('/node_modules/') && !path.startsWith(join(PACKAGE_ROOT, 'dist') + '/'),
    ),
  ]);
  let dependencies = [...dependencySet].sort();
  const sourceHash = () => {
    const hash = createHash('sha256').update(PACKAGE_VERSION);
    for (const path of dependencies) hash.update(path).update(snapshot.read(path));
    return 'sha256:' + hash.digest('hex');
  };
  let revision = sourceHash();
  let directory = join(panelRoot, revision.replace(':', '-'));
  const temporary = directory + '-build';
  rmSync(temporary, { recursive: true, force: true });
  mkdirSync(temporary, { recursive: true, mode: 0o700 });
  const capturedResources = new Set<string>();
  const captureResource = (path: string) => {
    if (capturedResources.has(path)) return;
    capturedResources.add(path);
    snapshot.read(path);
    dependencySet.add(path);
    if (extname(path) === '.css')
      for (const match of snapshot
        .text(path)
        .matchAll(/(?:url\(|@import\s+)["']?(\.[^"'\s)]+)["']?/g)) {
        const candidate = resolve(dirname(path), match[1].split('?')[0]);
        if (existsSync(candidate) && statSync(candidate).isFile())
          captureResource(realpathSync(candidate));
      }
  };
  const resourceGraph: Plugin = {
    name: 'paneon-resource-graph',
    enforce: 'pre',
    load(id) {
      const raw = id.split('?')[0];
      if (!existsSync(raw) || !statSync(raw).isFile()) return;
      const path = realpathSync(raw);
      if (
        path.includes('/node_modules/') ||
        path.startsWith(realpathSync(temporary) + '/') ||
        path.startsWith(join(PACKAGE_ROOT, 'dist') + '/')
      )
        return;
      captureResource(path);
      if (extname(path) === '.css') return snapshot.text(path);
    },
    generateBundle() {
      for (const file of this.getModuleIds()) {
        const raw = file.split('?')[0];
        if (!existsSync(raw) || !statSync(raw).isFile()) continue;
        const path = realpathSync(raw);
        if (
          path.includes('/node_modules/') ||
          path.startsWith(realpathSync(temporary) + '/') ||
          path.startsWith(join(PACKAGE_ROOT, 'dist') + '/')
        )
          continue;
        snapshot.read(path);
        dependencySet.add(path);
      }
    },
  };
  const common = {
    configFile: false as const,
    root: dirname(entry),
    logLevel: 'silent' as const,
    plugins: [resourceGraph, panelPlugin(entry, 'client', client), tailwindcss()],
    oxc: { jsx: { development: false } },
    resolve: { dedupe: ['react', 'react-dom'] },
  };
  const frameSource = join(temporary, 'frame-source.tsx');
  const nodeSource = join(temporary, 'node-source.ts');
  writeFileSync(
    nodeSource,
    `import definition from ${JSON.stringify(entry)};\n${server.actions.map((a, i) => `import {${a.name} as a${i}} from ${JSON.stringify(a.file)};`).join('\n')}\nexport default definition;export const __paneonActions={${server.actions.map((a, i) => `${JSON.stringify(a.id)}:a${i}`).join(',')}};`,
  );
  const authorCss = join(temporary, 'author.css');
  const authorSource = join(temporary, 'author-source.txt');
  // Tailwind must scan exactly the captured client graph, including shared
  // components outside the entry directory. Transformed sources exclude action
  // implementations and unused exports; scanning the filesystem would include
  // unrelated/server-only content and could race the source snapshot.
  writeFileSync(authorSource, [...client.sources.values()].join('\n'));
  writeFileSync(
    authorCss,
    `@import ${JSON.stringify(require.resolve('tailwindcss/index.css'))} source(none);\n@source ${JSON.stringify(authorSource)};`,
  );
  const theme = join(PACKAGE_ROOT, 'dist/ui/theme.css');
  writeFileSync(
    frameSource,
    `import ${JSON.stringify(authorCss)};${existsSync(theme) ? `import ${JSON.stringify(theme)};` : ''}\nimport React,{useSyncExternalStore} from 'react';import {TooltipProvider,UIProvider} from 'paneon/ui';import {createRoot} from 'react-dom/client';import definition from ${JSON.stringify(entry)};import {initializeBridge,PanelInputContext,getUI,subscribeUI} from 'paneon/sdk/client';\nfunction Environment(){const ui=useSyncExternalStore(subscribeUI,getUI);return React.createElement(UIProvider,{ui},React.createElement(TooltipProvider,null,React.createElement(definition.render)));}let mounted=false;window.addEventListener('message',(event)=>{const m=event.data;if(m?.paneon!==true||m.direction!=='init'||event.source!==parent||mounted)return;mounted=true;initializeBridge(m);createRoot(document.getElementById('root')!).render(React.createElement(PanelInputContext.Provider,{value:m.params},React.createElement(Environment)));});parent.postMessage({paneon:true,direction:'ready'},'*');`,
  );
  try {
    await build({
      ...common,
      define: { 'process.env.NODE_ENV': JSON.stringify('production') },
      build: {
        outDir: join(temporary, 'client'),
        emptyOutDir: true,
        sourcemap: false,
        minify: false,
        lib: { entry: frameSource, formats: ['es'], fileName: 'client' },
        rollupOptions: {
          output: { entryFileNames: 'client.js', assetFileNames: '[name][extname]' },
        },
      },
    });
    await build({
      ...common,
      plugins: [resourceGraph, panelPlugin(entry, 'server', server)],
      build: {
        outDir: join(temporary, 'server'),
        emptyOutDir: true,
        ssr: nodeSource,
        sourcemap: false,
        minify: false,
        rollupOptions: { output: { entryFileNames: 'server.js' } },
      },
      ssr: { noExternal: true, external: [] },
    });
    dependencies = [...dependencySet].sort();
    revision = sourceHash();
    directory = join(panelRoot, revision.replace(':', '-'));
    const serverFile = join(temporary, 'server/server.js');
    // Validation runs in an isolated child, never in the persistent control process.
    const metadata = await inspectServer(serverFile, server.actions);
    const clientFiles = files(join(temporary, 'client')).map((f) =>
      relative(join(temporary, 'client'), f).replaceAll('\\', '/'),
    );
    const css = clientFiles
      .filter((f) => extname(f) === '.css')
      .map((f) => `<link rel="stylesheet" href="./${f}">`)
      .join('');
    writeFileSync(
      join(temporary, 'client/frame.html'),
      `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${css}</head><body style="background:transparent"><div id="root"></div><script type="module" src="./client.js"></script></body></html>`,
    );
    const manifest: Manifest = {
      definitionId: metadata.definitionId,
      inputSchema: metadata.inputSchema,
      requires: { paneon: range },
      paneonVersion: PACKAGE_VERSION,
      revision,
      clientEntry: 'frame.html',
      serverEntry: 'server/server.js',
      assets: [...clientFiles, 'frame.html'],
      dependencies,
      actions: metadata.actions,
      events: metadata.events,
    };
    writeFileSync(join(temporary, 'manifest.json'), JSON.stringify(manifest));
    rmSync(frameSource, { force: true });
    rmSync(nodeSource, { force: true });
    rmSync(authorCss, { force: true });
    rmSync(authorSource, { force: true });
    // Metadata evaluation is asynchronous too: reject a save arriving after the
    // bundles finished rather than publishing old code under a later source hash.
    snapshot.assertUnchanged(dependencies);
    if (existsSync(directory)) rmSync(directory, { recursive: true, force: true });
    renameSync(temporary, directory);
    return { manifest, directory };
  } catch (e) {
    rmSync(temporary, { recursive: true, force: true });
    if (e instanceof PaneonError) throw e;
    throw new PaneonError('BUILD_FAILED', 'Panel compilation failed.', { entryPath: entry });
  }
}
async function inspectServer(
  serverFile: string,
  actions: { id: string; name: string; file: string; kind: 'query' | 'mutation' }[],
): Promise<{
  definitionId: string;
  inputSchema: JsonValue;
  actions: Manifest['actions'];
  events: Record<string, JsonValue>;
}> {
  const { fork } = await import('node:child_process');
  return new Promise((resolvePromise, reject) => {
    const worker = fork(join(PACKAGE_ROOT, 'dist/runtime/worker.js'), [], {
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      execArgv: [],
      env: { ...process.env },
    });
    const killMetadata = () => {
      worker.kill('SIGKILL');
    };
    process.once('exit', killMetadata);
    worker.once('exit', () => process.off('exit', killMetadata));
    const timer = setTimeout(() => {
      worker.kill();
      reject(new PaneonError('BUILD_FAILED', 'Panel metadata evaluation timed out.'));
    }, 15000);
    worker.on('error', () => {
      clearTimeout(timer);
      reject(new PaneonError('BUILD_FAILED', 'The panel validation process could not start.'));
    });
    worker.on('message', (message: unknown) => {
      const m = message as { kind: string; data: never; error?: { code: string; message: string } };
      if (m.kind === 'ready') {
        clearTimeout(timer);
        worker.kill();
        resolvePromise(m.data);
      } else if (m.kind === 'error') {
        clearTimeout(timer);
        worker.kill();
        reject(
          new PaneonError(
            m.error?.code ?? 'BUILD_FAILED',
            m.error?.message ?? 'Panel metadata validation failed.',
          ),
        );
      }
    });
    worker.send({ kind: 'init', serverFile, actions, inspect: true });
  });
}
export async function watchPanel(
  entry: string,
  dependencies: string[],
  onChange: () => Promise<void>,
): Promise<ViteDevServer> {
  const server = await createServer({
    configFile: false,
    root: dirname(entry),
    logLevel: 'silent',
    server: { middlewareMode: true, watch: { ignored: ['**/node_modules/**', '**/.paneon/**'] } },
    plugins: [
      {
        name: 'paneon-source-updates',
        handleHotUpdate: async (context) => {
          if (dependencies.includes(resolve(context.file))) await onChange();
          return [];
        },
      },
    ],
  });
  server.watcher.add(dependencies);
  return server;
}
export function serverUrl(path: string) {
  return pathToFileURL(path).href;
}
