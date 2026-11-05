import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import manifest from 'material-icon-theme/dist/material-icons.json' with { type: 'json' };
import { fileIconAsset, resolveFileIcon } from '../src/ui/file-icon-model.ts';

void test('file icons cover the requested types and extensionless Dockerfile', () => {
  const cases = {
    'application.properties': 'settings',
    'data.json': 'json',
    'config.yaml': 'yaml',
    'guide.md': 'markdown',
    'main.ts': 'typescript',
    'main.js': 'javascript',
    'main.go': 'go',
    'run.sh': 'console',
    'main.py': 'python',
    'Main.java': 'java',
    'app.log': 'log',
    Dockerfile: 'docker',
  };
  for (const theme of ['light', 'dark'] as const)
    for (const [path, expected] of Object.entries(cases))
      assert.equal(resolveFileIcon(path, theme), expected, `${theme}: ${path}`);
});

void test('file matching normalizes paths and case, prioritizes names and compound suffixes', () => {
  for (const path of ['/workspace/src/Dockerfile', 'C:\\workspace\\Dockerfile', 'DOCKERFILE'])
    assert.equal(resolveFileIcon(path, 'dark'), 'docker');
  assert.equal(resolveFileIcon('src/README.md', 'dark'), 'readme');
  assert.equal(resolveFileIcon('src/SETTINGS.JSON', 'dark'), 'json');
  assert.equal(resolveFileIcon('lib/index.d.ts', 'dark'), 'typescript-def');
  assert.equal(resolveFileIcon('src/bashly-strings.yaml', 'dark'), 'bashly-strings');
  assert.equal(resolveFileIcon('other/bashly-strings.yaml', 'dark'), 'yaml');
  for (const name of ['unknown.xyz', 'constructor', 'toString', '__proto__', ''])
    assert.equal(resolveFileIcon(name, 'dark'), manifest.file);
});

void test('theme overrides and icon aliases resolve to shipped SVGs', () => {
  assert.equal(resolveFileIcon('config.toml', 'light'), 'toml_light');
  assert.equal(resolveFileIcon('config.toml', 'dark'), 'toml');
  assert.equal(fileIconAsset('angular-component'), 'angular-component.clone.svg');
  const icons = new Set([
    manifest.file,
    ...Object.values(manifest.fileNames),
    ...Object.values(manifest.fileExtensions),
    ...Object.values(manifest.light.fileNames),
    ...Object.values(manifest.light.fileExtensions),
  ]);
  for (const icon of icons) {
    const asset = fileIconAsset(icon);
    assert.ok(!asset.startsWith('folder'), `File association points to folder asset: ${icon}`);
    assert.ok(
      existsSync(new URL(`../node_modules/material-icon-theme/icons/${asset}`, import.meta.url)),
      `Missing SVG for ${icon}: ${asset}`,
    );
  }
});

void test('mixed-case upstream associations match names, parent paths and extensions', () => {
  const cases = {
    'CLAUDE.md': 'claude',
    'CLAUDE.local.md': 'claude',
    'GEMINI.md': 'gemini-ai',
    'CMakePresets.json': 'cmake',
    '.github/FUNDING.yml': 'github-sponsors',
    Caddyfile: 'caddy',
    PKGBUILD: 'console',
    'sample.tmLanguage': 'xml',
    'sample.YAML-tmLanguage': 'yaml',
  };
  for (const theme of ['light', 'dark'] as const)
    for (const [path, expected] of Object.entries(cases))
      for (const variant of [path, path.toLowerCase(), path.toUpperCase()])
        assert.equal(resolveFileIcon(variant, theme), expected, `${theme}: ${variant}`);
});
