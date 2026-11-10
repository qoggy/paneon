import { mkdirSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const snapshots = [];
const readFailures = [];
const resolutions = [];
let program;
let packageRoot;

// Test-only preload: observe the compiler's own host, not a second resolution pass.
registerHooks({
  resolve(specifier, context, next) {
    const resolved = next(specifier, context);
    if (!context.parentURL?.endsWith('/dist/compiler/index.js')) return resolved;
    let source;
    if (specifier === 'typescript') {
      packageRoot = fileURLToPath(new URL('../../', context.parentURL));
      source = `import ts from ${JSON.stringify(resolved.url)};
import { traceTypeScript } from ${JSON.stringify(import.meta.url)};
export default traceTypeScript(ts);`;
    } else if (specifier === './source-snapshot.js') {
      source = `import { SourceSnapshot } from ${JSON.stringify(resolved.url)};
import { traceSnapshot } from ${JSON.stringify(import.meta.url)};
const TracedSnapshot = traceSnapshot(SourceSnapshot);
export { TracedSnapshot as SourceSnapshot };`;
    }
    return source
      ? { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true }
      : resolved;
  },
});

export function traceSnapshot(Snapshot) {
  return class extends Snapshot {
    constructor(...args) {
      super(...args);
      snapshots.push(this);
    }
    read(file) {
      try {
        return super.read(file);
      } catch (error) {
        readFailures.push({ file, code: error.code, message: error.message });
        throw error;
      }
    }
  };
}

export function traceTypeScript(ts) {
  return new Proxy(ts, {
    get(target, key) {
      if (key === 'createCompilerHost')
        return (...args) =>
          new Proxy(target.createCompilerHost(...args), {
            set(host, property, value) {
              host[property] =
                property === 'resolveModuleNames'
                  ? (names, importer, ...rest) => {
                      const result = value(names, importer, ...rest);
                      if (
                        importer.startsWith(join(packageRoot, 'dist')) ||
                        !importer.includes('/node_modules/')
                      )
                        resolutions.push({
                          importer,
                          modules: names.map((name, i) => ({
                            name,
                            file: result[i]?.resolvedFileName ?? null,
                          })),
                        });
                      return result;
                    }
                  : value;
              return true;
            },
          });
      if (key === 'createProgram')
        return (...args) => {
          program = target.createProgram(...args);
          return program;
        };
      return Reflect.get(target, key);
    },
  });
}

const send = process.send;
if (send)
  process.send = function (message, ...args) {
    if (
      message?.error?.code === 'BUILD_FAILED' &&
      message.error.details?.stage === 'typecheck' &&
      process.env.PANEON_TEST_ARTIFACTS
    ) {
      try {
        const directory = process.env.PANEON_TEST_ARTIFACTS;
        mkdirSync(directory, { recursive: true });
        writeFileSync(
          join(directory, `compiler-inputs-${process.pid}.json`),
          JSON.stringify(
            {
              error: message.error,
              packageRoot,
              readFailures,
              resolutions,
              probes: snapshots.map((snapshot) => snapshot.paths),
              files: program
                ?.getSourceFiles()
                .filter(
                  (file) =>
                    file.fileName.startsWith(join(packageRoot, 'dist')) ||
                    !file.fileName.includes('/node_modules/'),
                )
                .map((file) => ({ path: file.fileName, text: file.text })),
            },
            null,
            2,
          ),
        );
      } catch (error) {
        console.error('Could not preserve compiler inputs:', error);
      }
    }
    return send.call(this, message, ...args);
  };
