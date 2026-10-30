import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

// Run the built CLI from a directory without node_modules, as an installed skill does.
const cli = resolve('dist/cli/index.js');
type Finding = { location: string; message: string; excerpt: string };
type Report = {
  summary: string;
  next: string;
  missingTargets: Finding[];
  unannotatedText: Finding[];
  unchecked: Finding[];
};

async function check(source: string, modules: Record<string, string> = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'paneon-annotation-check-'));
  try {
    for (const [name, content] of Object.entries({ 'panel.tsx': source, ...modules }))
      await writeFile(join(directory, name), content);
    const result = spawnSync(
      process.execPath,
      [cli, 'panel', 'check-annotations', 'panel.tsx', '--json'],
      { cwd: directory, encoding: 'utf8' },
    );
    assert.equal(result.stderr, '');
    assert.equal(result.status, 0);
    const envelope = JSON.parse(result.stdout) as { ok: boolean; data: Report };
    assert.equal(envelope.ok, true);
    return envelope.data;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
const messages = (items: Finding[]) => items.map((item) => item.message);

const imports = `import {Page, Section, Markdown, CodeBlock, Image, Mermaid, DiffView, AnnotationText, Alert, AlertTitle, Empty, EmptyDescription, Badge, Button, Input, Spinner, Tooltip, TooltipContent, usePageAnnotations} from '@qoggy/paneon/ui';
import {definePanel} from '@qoggy/paneon/sdk';`;
const panel = (
  body: string,
  declarations = '',
  hook = 'usePageAnnotations({onSubmit: async () => {}});',
) =>
  `${imports}\n${declarations}\nfunction Panel(){${hook}return (${body});}\nexport default definePanel({render: Panel});`;

void test('reports content components and headings without targets, with locations relative to cwd', async () => {
  const report = await check(
    panel(`<Page title="Plan" annotationTarget="plan">
    <Section title="Risks">
      <Markdown>{'Details'}</Markdown>
      <CodeBlock code="example" />
      <Image src="diagram.png" />
      <Mermaid code="graph TD; A-->B" />
      <DiffView oldText="a" newText="b" annotationTargets={{old: 'old'}} />
      <AnnotationText>Body</AnnotationText>
    </Section>
  </Page>`),
  );
  assert.deepEqual(messages(report.missingTargets), [
    'Section title has no annotation target.',
    'Markdown has no annotation target.',
    'CodeBlock has no annotation target.',
    'Image has no annotation target.',
    'Mermaid has no annotation target.',
    'DiffView new side has no annotation target.',
    'AnnotationText has no annotation target.',
  ]);
  assert.match(report.missingTargets[0].location, /^panel\.tsx:5:5$/);
  assert.deepEqual(report.unannotatedText, []);
  assert.match(report.summary, /^7 annotatable component\(s\) or heading\(s\) have no annotation/);
  assert.match(report.next, /Add a target to each listed item/);
});

void test('a fully covered page reports nothing, including falsy targets and spreads', async () => {
  const report = await check(
    panel(
      `<Page title="Plan" {...heading}>
    <Section title="Risks" annotationTarget={false}>
      <p><AnnotationText target={0}>Maintain two configurations.</AnnotationText></p>
      {risks.map((risk) => <AnnotationText key={risk} target={\`risk:\${risk}\`}>{risk}</AnnotationText>)}
      <Markdown {...document}>{'Details'}</Markdown>
      <CodeBlock code="example" annotationTarget={null} />
      <Image src="diagram.png" annotationTarget="image" />
      <Mermaid code="graph TD; A-->B" annotationTarget="flow" />
      <DiffView oldText="a" newText="b" annotationTargets={{old: 'o', new: 'n'}} />
    </Section>
  </Page>`,
      `const heading = {annotationTarget: 'heading'};
const document = {...heading, annotationTarget: 'document'};
const risks = ['Stale prices'];`,
    ),
  );
  assert.deepEqual(report.missingTargets, []);
  assert.deepEqual(report.unannotatedText, []);
  assert.deepEqual(report.unchecked, []);
  assert.equal(report.summary, 'Every checked component and heading has an annotation target.');
  assert.equal(report.next, 'Nothing to fix.');
});

void test('ignores controls, status components, decorative markup and text without letters', async () => {
  const report = await check(
    panel(
      `<>
    <Button>Submit</Button><Input placeholder="Name" /><button>Cancel</button>
    <Alert><AlertTitle>Request failed</AlertTitle></Alert>
    <Empty><EmptyDescription>No items.</EmptyDescription></Empty>
    <Spinner /><Badge>Recommended</Badge>
    <Tooltip><TooltipContent>Hint</TooltipContent></Tooltip>
    <svg aria-hidden="true"><text>Decoration</text></svg>
    <p role="status">Saved.</p>
    <p>{count + 1} / {total}</p><p> · </p>
  </>`,
      'const count = 1; const total = 2;',
    ),
  );
  assert.deepEqual(report.missingTargets, []);
  assert.deepEqual(report.unannotatedText, []);
  assert.deepEqual(report.unchecked, []);
});

void test('reports plain text separately and only when an expression is always a string', async () => {
  const report = await check(
    panel(
      `<>
    <p>Maintain two configurations.</p>
    <p>{title}</p>
    <p children="Explicit child" />
    {rows.map((row) => <p>{row.label}</p>)}
    <Slot content={<Markdown annotationTarget="slot">Inside</Markdown>} />
  </>`,
      `import type {ReactNode} from 'react';
const title = 'Plan'; const rows = [{label: 'Risk'}];
function Slot({content}: {content: ReactNode}) { return <div>{content}</div>; }`,
    ),
  );
  assert.deepEqual(report.missingTargets, []);
  assert.deepEqual(
    report.unannotatedText.map((item) => item.excerpt),
    ['Maintain two configurations.', '{title}', '<p children="Explicit child" />', '{row.label}'],
  );
  assert.match(report.next, /leave interface text such as labels and status messages as is/);
});

void test('follows local components, imported modules, aliases, re-exports and namespaces', async () => {
  const report = await check(
    panel(
      `<>
    <Note annotationTarget="note">Covered</Note>
    <Note>Uncovered</Note>
    <Wrapper><Article>Missing</Article></Wrapper>
    <parts.Diagram />
  </>`,
      `import {Note, Wrapper} from './note';
import {Article} from './facade';
import * as parts from './parts';`,
    ),
    {
      'note.tsx': `import {Markdown as Doc} from '@qoggy/paneon/ui';
export function Note({annotationTarget: target, children}) {
  return <Doc annotationTarget={target}>{children}</Doc>;
}
export const Wrapper = ({children}) => <section>{children}</section>;`,
      'facade.ts': `export { Markdown as Article } from '@qoggy/paneon/ui';`,
      'parts.tsx': `import * as UI from '@qoggy/paneon/ui';
export const Diagram = () => <UI.Mermaid code="graph TD; A-->B" />;`,
    },
  );
  assert.deepEqual(
    report.missingTargets.map((item) => [item.location.split(':')[0], item.message]),
    [
      ['note.tsx', 'Markdown has no annotation target.'],
      ['panel.tsx', 'Markdown has no annotation target.'],
      ['parts.tsx', 'Mermaid has no annotation target.'],
    ],
  );
  assert.deepEqual(report.unchecked, []);
});

void test('respects spread order and explicit undefined targets', async () => {
  const report = await check(
    panel(
      `<>
    <Markdown annotationTarget="before" {...off}>A</Markdown>
    <Markdown {...off} annotationTarget="after">B</Markdown>
    <CodeBlock code="x" annotationTarget={undefined} />
  </>`,
      'const off = {annotationTarget: undefined};',
    ),
  );
  assert.equal(report.missingTargets.length, 2);
  assert.deepEqual(report.unchecked, []);
});

void test('a page without usePageAnnotations is reported, and unused code does not count', async () => {
  const report = await check(
    panel(
      '<Markdown annotationTarget="plan">Plan</Markdown>',
      'function Unused(){usePageAnnotations({}); return <p>Not rendered</p>;}',
      '',
    ),
  );
  assert.deepEqual(messages(report.missingTargets), [
    'The rendered page never calls usePageAnnotations, so nothing on it can be annotated.',
  ]);
  assert.deepEqual(report.unannotatedText, []);
});

void test('a session opened through a local hook counts', async () => {
  const report = await check(
    panel(
      '<Markdown annotationTarget="plan">Plan</Markdown>',
      'function useFeedback(){usePageAnnotations({onSubmit: async () => {}});}',
      'useFeedback();',
    ),
  );
  assert.deepEqual(report.missingTargets, []);
});

void test('reports undeterminable targets and opaque renderers as unchecked without executing code', async () => {
  const report = await check(
    panel(
      `<>
    <Markdown {...dynamic}>Unknown</Markdown>
    <Markdown annotationTarget="known" components={renderers}>Custom renderer</Markdown>
    <DiffView oldText="a" newText="b" annotationTargets={sides()} />
    <canvas /><External />
  </>`,
      `function load(){throw new Error('must never execute');}
const dynamic = load();
function sides(){return load();}
declare const renderers: unknown;
declare const External: unknown;`,
    ),
  );
  assert.deepEqual(report.missingTargets, []);
  assert.deepEqual(messages(report.unchecked), [
    'Cannot determine the annotation target of Markdown.',
    'Markdown with custom components may not map annotations.',
    'Cannot determine the annotation target of DiffView old side.',
    'Cannot determine the annotation target of DiffView new side.',
    '<canvas> cannot be annotated; use Image or Mermaid if it is content.',
    'Cannot inspect component External.',
  ]);
  assert.match(report.summary, /6 item\(s\) could not be checked statically/);
  assert.match(report.next, /Inspect the unchecked items in source/);
});

void test('a missing session is unchecked rather than certain when a component is opaque', async () => {
  const report = await check(panel('<External />', 'declare const External: unknown;', ''));
  assert.deepEqual(report.missingTargets, []);
  assert.ok(messages(report.unchecked).some((message) => message.includes('usePageAnnotations')));
});

void test('a missing entry fails with a structured error', () => {
  const result = spawnSync(
    process.execPath,
    [cli, 'panel', 'check-annotations', join(tmpdir(), 'paneon-missing-panel.tsx'), '--json'],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 1);
  const envelope = JSON.parse(result.stdout) as { ok: boolean; error: { code: string } };
  assert.equal(envelope.ok, false);
  assert.equal(envelope.error.code, 'INVALID_ARGUMENT');
});

void test('follows JSX passed through props, render functions and unused props', async () => {
  const report = await check(
    panel(
      `<>
    <Slot content={<Markdown>Slot plan</Markdown>} />
    <Slot content={ready ? <CodeBlock code="a" /> : null} />
    <List render={() => <Mermaid code="graph TD; A-->B" />} />
    <Ignores content={<Markdown>Never rendered</Markdown>} />
    <Card title={<Markdown>Header</Markdown>} />
  </>`,
      `import type {ReactNode} from 'react';
const ready = Math.random() > 0.5;
function Slot({content}: {content: ReactNode}) { return <div>{content}</div>; }
function List({render}: {render: () => ReactNode}) { return <div>{render()}</div>; }
function Ignores(_: {content: ReactNode}) { return <div />; }
declare const Card: (props: {title: ReactNode}) => ReactNode;`,
    ),
  );
  assert.deepEqual(
    report.missingTargets.map((item) => item.excerpt),
    ['<Markdown>', '<CodeBlock code="a" />', '<Mermaid code="graph TD; A-->B" />', '<Markdown>'],
  );
  assert.ok(report.missingTargets.every((item) => !item.excerpt.includes('Never')));
});

void test('checks content wrapped by menus and tooltips while skipping their popups', async () => {
  const report =
    await check(`import {Markdown, ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, Tooltip, TooltipTrigger, TooltipContent, Button, usePageAnnotations} from '@qoggy/paneon/ui';
export default function Panel(){usePageAnnotations({}); return <>
  <ContextMenu><ContextMenuTrigger><Markdown>Menu plan</Markdown></ContextMenuTrigger>
    <ContextMenuContent><ContextMenuItem>Copy section</ContextMenuItem></ContextMenuContent></ContextMenu>
  <DropdownMenu><DropdownMenuTrigger><Button>Actions</Button></DropdownMenuTrigger>
    <DropdownMenuContent><DropdownMenuItem>Delete item</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
  <Tooltip><TooltipTrigger><Markdown>Hover plan</Markdown></TooltipTrigger><TooltipContent>Hint text</TooltipContent></Tooltip>
</>}`);
  assert.deepEqual(messages(report.missingTargets), [
    'Markdown has no annotation target.',
    'Markdown has no annotation target.',
  ]);
  assert.deepEqual(report.unannotatedText, []);
});

void test('React fragments are transparent and inline svg is not reported', async () => {
  const report = await check(`import {Fragment} from 'react';
import * as React from 'react';
import {Markdown, usePageAnnotations} from '@qoggy/paneon/ui';
export default function Panel(){usePageAnnotations({}); return <>
  <Fragment key="a"><Markdown>A</Markdown></Fragment>
  <React.Fragment key="b"><p>Plain</p></React.Fragment>
  <svg viewBox="0 0 1 1"><path d="M0 0" /></svg>
</>}`);
  assert.deepEqual(messages(report.missingTargets), ['Markdown has no annotation target.']);
  assert.equal(report.unannotatedText.length, 1);
  assert.deepEqual(report.unchecked, []);
});

void test('quoted and numeric property names match unquoted ones', async () => {
  const report = await check(
    panel(
      `<>
    <Markdown {...quoted}>A</Markdown>
    <Note {...quoted}>B</Note>
  </>`,
      `import {Markdown as Doc} from '@qoggy/paneon/ui';
const quoted = {'annotationTarget': 'plan'};
function Note({'annotationTarget': target, children}) { return <Doc annotationTarget={target}>{children}</Doc>; }`,
    ),
  );
  assert.deepEqual(report.missingTargets, []);
  assert.deepEqual(report.unchecked, []);
});
