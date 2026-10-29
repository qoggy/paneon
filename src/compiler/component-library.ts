import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { build } from 'vite';
import type { Plugin } from 'vite';
import { createGraph } from './action-transform.js';
import type { Graph } from './action-transform.js';
import { PACKAGE_ROOT } from '../shared/paths.js';

/** Split ordinary component-owned actions before the library is browser-bundled. */
export function componentActions(options: {
  entry: string;
  packageRoot: string;
  outDir: string;
  emit?: boolean;
}): Plugin {
  const entry = resolve(options.entry);
  const packageRoot = resolve(options.packageRoot);
  const outDir = resolve(options.outDir);
  const pkg = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
    name: string;
    version: string;
  };
  const actionId = (file: string, name: string) =>
    `${pkg.name}@${pkg.version}/${relative(dirname(entry), file)
      .replaceAll('\\', '/')
      .replace(/\.[cm]?[jt]sx?$/, '')}#${name}`;
  let client: Graph;
  let server: Graph;
  let dirty = false;
  const virtualEntry = join(dirname(entry), '.paneon-component-actions.ts');
  const refresh = () => {
    client = createGraph(entry, 'client', undefined, undefined, {
      entryExports: ['*'],
      actionId,
      library: true,
    });
    const source = client.actions
      .map(
        (action, index) =>
          `export {${action.name} as action${index}} from ${JSON.stringify('./' + relative(dirname(entry), action.file).replaceAll('\\', '/'))};`,
      )
      .join('\n');
    server = createGraph(
      virtualEntry,
      'server',
      (file) => (file === virtualEntry ? source : readFileSync(file, 'utf8')),
      undefined,
      { entryExports: ['*'], actionId, library: true },
    );
    dirty = false;
  };

  return {
    name: 'paneon-component-actions',
    enforce: 'pre',
    buildStart: refresh,
    watchChange(id) {
      if (client.sources.has(id.split('?')[0])) dirty = true;
    },
    transform(_code, id) {
      const file = id.split('?')[0];
      // Other application entry points may use additional exports of shared
      // modules. Only replace the component library's own source subtree.
      if (!file.startsWith(dirname(entry) + sep)) return;
      if (dirty) refresh();
      const source = client.sources.get(file);
      return source === undefined ? undefined : { code: source, map: null };
    },
    generateBundle(_output, bundle) {
      if (options.emit === false) return;
      const modules: Record<
        string,
        { id: string; serverModule: string; exportName: string; kind: string }[]
      > = {};
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk') continue;
        const actions = client.actions.flatMap((action, index) =>
          Object.hasOwn(chunk.modules, action.file)
            ? [
                {
                  id: action.id,
                  serverModule: './actions.js',
                  exportName: `action${index}`,
                  kind: action.kind,
                },
              ]
            : [],
        );
        if (actions.length) modules['./' + chunk.fileName] = actions;
      }
      this.emitFile({
        type: 'asset',
        fileName: 'paneon-actions.json',
        source: JSON.stringify({ version: 1, modules }),
      });
    },
    async closeBundle() {
      if (options.emit === false || !client.actions.length) return;
      await build({
        configFile: false,
        root: dirname(entry),
        logLevel: 'silent',
        plugins: [
          {
            name: 'paneon-component-action-server',
            enforce: 'pre',
            resolveId(id) {
              if (id === virtualEntry) return id;
              if (id === '@qoggy/paneon/sdk') return join(PACKAGE_ROOT, 'dist/sdk/server.js');
            },
            load(id) {
              return server.sources.get(id.split('?')[0]);
            },
            transform(_code, id) {
              const source = server.sources.get(id.split('?')[0]);
              return source === undefined ? undefined : { code: source, map: null };
            },
          },
        ],
        build: {
          outDir,
          emptyOutDir: false,
          ssr: virtualEntry,
          minify: false,
          rollupOptions: { output: { entryFileNames: 'actions.js' } },
        },
        ssr: { noExternal: true, external: [] },
      });
    },
  };
}
