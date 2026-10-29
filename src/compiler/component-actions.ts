import { dirname, isAbsolute, join, resolve } from 'node:path';
import { realpathSync } from 'node:fs';
import { z } from 'zod';
import ts from 'typescript';
import type { OutputBundle } from 'rolldown';
import type { SourceSnapshot } from './source-snapshot.js';
import { PaneonError } from '../shared/types.js';
import type { Graph } from './action-transform.js';

const actionSchema = z
  .object({
    id: z.string().min(1),
    serverModule: z.string().min(1),
    exportName: z.string().regex(/^[A-Za-z_$][\w$]*$/),
    kind: z.enum(['query', 'mutation']),
  })
  .strict();
const manifestSchema = z
  .object({ version: z.literal(1), modules: z.record(z.string(), z.array(actionSchema)) })
  .strict();
type Library = {
  directory: string;
  packageFile: string;
  manifestFile: string;
  modules: Map<string, z.infer<typeof actionSchema>[]>;
};

/** Consume package metadata, independent of the names or business logic of components. */
export class ComponentActions {
  private libraries = new Map<string, Library | undefined>();
  readonly files = new Set<string>();
  readonly actions: Graph['actions'] = [];

  private snapshot: SourceSnapshot;
  constructor(snapshot: SourceSnapshot) {
    this.snapshot = snapshot;
  }

  private library(file: string): Library | undefined {
    let directory = dirname(file);
    const visited: string[] = [];
    let library: Library | undefined;
    while (true) {
      if (this.libraries.has(directory)) {
        library = this.libraries.get(directory);
        break;
      }
      visited.push(directory);
      const packageFile = join(directory, 'package.json');
      if (this.snapshot.exists(packageFile, 'file')) {
        const pkg = JSON.parse(this.snapshot.text(packageFile)) as {
          name?: unknown;
          paneon?: { componentActions?: unknown };
        };
        const location = pkg.paneon?.componentActions;
        if (location !== undefined) {
          if (typeof location !== 'string')
            throw new PaneonError(
              'INVALID_COMPONENT_ACTIONS',
              'Invalid component action metadata.',
            );
          const manifestFile = resolve(directory, location);
          const parsed = manifestSchema.safeParse(JSON.parse(this.snapshot.text(manifestFile)));
          if (!parsed.success)
            throw new PaneonError(
              'INVALID_COMPONENT_ACTIONS',
              'Invalid component action manifest.',
              { file: manifestFile },
            );
          const artifactRoot = dirname(manifestFile);
          library = {
            directory: artifactRoot,
            packageFile,
            manifestFile,
            modules: new Map(
              Object.entries(parsed.data.modules).map(([path, actions]) => [
                resolve(artifactRoot, path),
                actions,
              ]),
            ),
          };
          break;
        }
        // Unnamed scopes (for example dist/esm/package.json) set module type;
        // the named owning package still supplies component action metadata.
        if (typeof pkg.name === 'string') break;
      }
      const parent = dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
    for (const path of visited) this.libraries.set(path, library);
    return library;
  }

  collect(bundle: OutputBundle) {
    const existing = new Map(this.actions.map((action) => [action.id, action]));
    for (const chunk of Object.values(bundle)) {
      if (chunk.type !== 'chunk') continue;
      for (const [id, rendered] of Object.entries(chunk.modules)) {
        const file = id.split('?')[0];
        if (!isAbsolute(file) || rendered.renderedLength === 0) continue;
        const library = this.library(file);
        const declarations = library?.modules.get(file);
        if (!library || !declarations) continue;
        // A module can survive only for an initialization side effect while
        // all its action proxies were shaken out. Register retained proxies.
        const literals = new Set<string>();
        const source = ts.createSourceFile(
          file,
          rendered.code ?? chunk.code,
          ts.ScriptTarget.Latest,
          true,
          ts.ScriptKind.JS,
        );
        const visit = (node: ts.Node) => {
          if (ts.isStringLiteralLike(node)) literals.add(node.text);
          ts.forEachChild(node, visit);
        };
        visit(source);
        for (const declaration of declarations) {
          if (!literals.has(declaration.id)) continue;
          this.files.add(file);
          this.files.add(library.packageFile);
          this.files.add(library.manifestFile);
          const serverFile = realpathSync(resolve(library.directory, declaration.serverModule));
          const action = {
            id: declaration.id,
            file: serverFile,
            name: declaration.exportName,
            kind: declaration.kind,
          };
          const previous = existing.get(action.id);
          if (previous && (previous.file !== action.file || previous.name !== action.name))
            throw new PaneonError(
              'COMPONENT_ACTION_CONFLICT',
              'Component action identities conflict.',
              { actionId: action.id },
            );
          if (!previous) {
            this.actions.push(action);
            existing.set(action.id, action);
          }
          this.snapshot.read(serverFile);
          this.files.add(serverFile);
        }
      }
    }
  }
}
