import { definePanel, z } from '@qoggy/paneon/sdk';
import { FileIcon, Page } from '@qoggy/paneon/ui';

const files = [
  'application.properties',
  'data.json',
  'config.yaml',
  'guide.md',
  'main.ts',
  'main.js',
  'main.go',
  'run.sh',
  'main.py',
  'Main.java',
  'app.log',
  'Dockerfile',
  'src/Dockerfile',
  'C:\\workspace\\Dockerfile',
  'lib/index.d.ts',
  'app.component.ts',
  'config.toml',
  'unknown.xyz',
  'CLAUDE.md',
  'CMakePresets.json',
  '.github/FUNDING.yml',
  'Caddyfile',
];

function Panel() {
  return (
    <Page title="FileIcon">
      <div className="space-y-2">
        {files.map((path) => (
          <div key={path} data-file={path} className="flex items-center gap-2 text-sm">
            <FileIcon path={path} />
            <span>{path}</span>
          </div>
        ))}
        <div data-size="tree" className="flex items-center gap-2">
          <FileIcon path="main.ts" className="size-3.5" />
          <span>14px tree icon</span>
        </div>
      </div>
    </Page>
  );
}

export default definePanel({
  id: 'file-icons',
  requires: { paneon: '__PANEON_TEST_VERSION__' },
  input: z.object({}).strict(),
  render: Panel,
});
