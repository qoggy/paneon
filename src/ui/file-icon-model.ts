import manifest from 'material-icon-theme/dist/material-icons.json' with { type: 'json' };

type Associations = Record<string, string>;
type Tables = Record<'fileNames' | 'fileExtensions', Associations>;
let normalizedTables: Record<'light' | 'dark', Tables> | undefined;

function normalize(table: Associations): Associations {
  return Object.fromEntries(Object.entries(table).map(([key, icon]) => [key.toLowerCase(), icon]));
}

function associations(theme: 'light' | 'dark'): Tables {
  // Initialize only when FileIcon is used, so other UI consumers can remove
  // the complete manifest and SVG graph during tree-shaking.
  if (!normalizedTables) {
    const dark = {
      fileNames: normalize(manifest.fileNames),
      fileExtensions: normalize(manifest.fileExtensions),
    };
    normalizedTables = {
      dark,
      light: {
        fileNames: { ...dark.fileNames, ...normalize(manifest.light.fileNames) },
        fileExtensions: { ...dark.fileExtensions, ...normalize(manifest.light.fileExtensions) },
      },
    };
  }
  return normalizedTables[theme];
}

export function fileIconAsset(icon: string): string {
  const definitions: Record<string, { iconPath: string }> = manifest.iconDefinitions;
  const path = definitions[icon].iconPath;
  return path.slice(path.lastIndexOf('/') + 1);
}

function lookup(field: 'fileNames' | 'fileExtensions', key: string, theme: 'light' | 'dark') {
  const table = associations(theme)[field];
  return Object.hasOwn(table, key) ? table[key] : undefined;
}

/** Resolve names only: no filesystem access or language-service inference. */
export function resolveFileIcon(path: string, theme: 'light' | 'dark'): string {
  const parts = path.replaceAll('\\', '/').toLowerCase().split('/');
  const name = parts.pop() ?? '';
  const parent = parts.pop();
  const exact =
    (parent ? lookup('fileNames', `${parent}/${name}`, theme) : undefined) ??
    lookup('fileNames', name, theme);
  if (exact) return exact;
  const segments = name.split('.');
  for (let index = 1; index < segments.length; index++) {
    const suffix = segments.slice(index).join('.');
    const match =
      (parent ? lookup('fileExtensions', `${parent}/${suffix}`, theme) : undefined) ??
      lookup('fileExtensions', suffix, theme);
    if (match) return match;
  }
  return manifest.file;
}
