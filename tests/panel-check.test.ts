import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

// Run the built CLI from a directory without node_modules, as an installed skill does.
const cli = resolve('dist/cli/index.js');
type Finding = { location: string; message: string; excerpt: string };
type Data = {
  summary: string;
  next: string;
  nativeControls: Finding[];
  annotations: {
    status: 'enabled' | 'disabled' | 'undetermined';
    missingTargets: Finding[];
    unannotatedText: Finding[];
    unchecked: Finding[];
  };
};
type Report = Omit<Data, 'annotations'> & Data['annotations'];

async function run(source: string, modules: Record<string, string> = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'paneon-panel-check-'));
  try {
    for (const [name, content] of Object.entries({ 'panel.tsx': source, ...modules }))
      await writeFile(join(directory, name), content);
    const result = spawnSync(process.execPath, [cli, 'panel', 'check', 'panel.tsx', '--json'], {
      cwd: directory,
      encoding: 'utf8',
    });
    assert.equal(result.stderr, '');
    const envelope = JSON.parse(result.stdout) as { ok: boolean; data: Data };
    assert.equal(envelope.ok, true);
    const { annotations, ...rest } = envelope.data;
    return { status: result.status, report: { ...rest, ...annotations } as Report };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
/** Annotation-focused pages contain no native controls, so the command succeeds. */
async function check(source: string, modules: Record<string, string> = {}) {
  const { status, report } = await run(source, modules);
  assert.equal(status, 0);
  assert.deepEqual(report.nativeControls, []);
  return report;
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
  assert.match(
    report.summary,
    /7 component\(s\) or heading\(s\) have no original-source annotation/,
  );
  assert.equal(report.status, 'enabled');
  assert.match(report.next, /may question word by word/);
  assert.match(report.next, /put the state in the ref/);
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
  assert.equal(
    report.summary,
    'No native control with a Paneon component equivalent was found. Every checked component and heading has an annotation target.',
  );
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

void test('a page that never reaches usePageAnnotations skips the annotation check', async () => {
  const report = await check(
    `import {Markdown} from '@qoggy/paneon/ui';
import {definePanel} from '@qoggy/paneon/sdk';
function Panel(){return (<><Markdown>Plan</Markdown><p>Plain text</p></>);}
export default definePanel({render: Panel});`,
  );
  assert.equal(report.status, 'disabled');
  assert.deepEqual(report.missingTargets, []);
  assert.deepEqual(report.unannotatedText, []);
  assert.deepEqual(report.unchecked, []);
  assert.match(
    report.summary,
    /never calls usePageAnnotations, so the annotation check was skipped/,
  );
  assert.equal(report.next, 'Nothing to fix.');
});

void test('a hook the walk cannot follow keeps the annotation check undetermined', async () => {
  const cases: [string, string, string][] = [
    ['alias', 'const useFeedback = usePageAnnotations;', 'useFeedback({});'],
    ['unused function', 'function Unused(){usePageAnnotations({}); return null;}', ''],
  ];
  for (const [label, declarations, hook] of cases) {
    const report = await check(panel('<Markdown>Plan</Markdown>', declarations, hook));
    assert.equal(report.status, 'undetermined', label);
    assert.deepEqual(
      messages(report.missingTargets),
      ['Markdown has no annotation target.'],
      label,
    );
    assert.ok(
      messages(report.unchecked).some((message) => message.includes('usePageAnnotations')),
      label,
    );
  }
  // The hook name never appears; a namespace import hides which exports the page uses.
  const hidden = await check(`import * as UI from '@qoggy/paneon/ui';
import {definePanel} from '@qoggy/paneon/sdk';
const name = 'usePage' + 'Annotations';
function Panel(){(UI as any)[name]({}); return <UI.Markdown>Plan</UI.Markdown>;}
export default definePanel({render: Panel});`);
  assert.equal(hidden.status, 'undetermined');
  assert.deepEqual(messages(hidden.missingTargets), ['Markdown has no annotation target.']);
});

void test('a hook from another package keeps the annotation check undetermined', async () => {
  const page = (imports: string, call: string) => `import {Markdown} from '@qoggy/paneon/ui';
import {definePanel} from '@qoggy/paneon/sdk';
${imports}
function Panel(){${call} return <Markdown>Plan</Markdown>;}
export default definePanel({render: Panel});`;
  const cases: [string, string, string, Record<string, string>?][] = [
    ['named import', `import {useFeedback} from 'feedback-kit';`, 'useFeedback();'],
    ['namespace import', `import * as kit from '@team/feedback-kit';`, 'kit.useFeedback();'],
    ['default import', `import kit from 'feedback-kit';`, 'kit.useFeedback();'],
    [
      'local re-export',
      `import {useFeedback} from './kit';`,
      'useFeedback();',
      { 'kit.ts': `export {useFeedback} from 'feedback-kit';` },
    ],
    [
      'local star re-export',
      `import {useFeedback} from './kit';`,
      'useFeedback();',
      { 'kit.ts': `export * from 'feedback-kit';` },
    ],
  ];
  for (const [label, imports, call, modules] of cases) {
    const report = await check(page(imports, call), modules);
    assert.equal(report.status, 'undetermined', label);
    assert.deepEqual(
      messages(report.missingTargets),
      ['Markdown has no annotation target.'],
      label,
    );
  }
  // React's and Paneon's own hooks, and non-hook package exports, do not open annotations.
  const plain = await check(
    page(
      `import {useState} from 'react';
import * as React from 'react';
import {useQuery} from '@qoggy/paneon/sdk';
import {Check} from 'lucide-react';
import yaml from 'yaml';`,
      `useState(0); React.useMemo(() => 0, []); void useQuery; void Check; yaml.parse('a: 1');`,
    ),
  );
  assert.equal(plain.status, 'disabled');
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
    '<canvas> has no original-source mapping; whole-element picking remains available when page annotations are enabled.',
    'Cannot inspect component External.',
  ]);
  assert.match(report.summary, /6 item\(s\) could not be checked statically/);
  assert.match(report.next, /Inspect the unchecked items in source/);
});

void test('a missing session is unchecked rather than certain when a component is opaque', async () => {
  const report = await check(panel('<External />', 'declare const External: unknown;', ''));
  assert.deepEqual(report.missingTargets, []);
  assert.equal(report.status, 'undetermined');
  assert.ok(messages(report.unchecked).some((message) => message.includes('usePageAnnotations')));
});

void test('a missing entry fails with a structured error', () => {
  const result = spawnSync(
    process.execPath,
    [cli, 'panel', 'check', join(tmpdir(), 'paneon-missing-panel.tsx'), '--json'],
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

void test('reports native controls with a Paneon equivalent and exits with 1, even without annotations', async () => {
  const { status, report } = await run(
    `import {definePanel} from '@qoggy/paneon/sdk';
import {Filter} from './filter';
function Panel(){return (<form>
  <select aria-label="Report" value="a" onChange={() => {}}><option value="a">A</option></select>
  <textarea defaultValue="Notes" />
  <input placeholder="Name" />
  <input type={'number'} />
  <Filter />
</form>);}
export default definePanel({render: Panel});`,
    { 'filter.tsx': `export const Filter = () => <input type="search" />;` },
  );
  assert.equal(status, 1);
  assert.deepEqual(
    report.nativeControls.map((item) => [item.location, item.message]),
    [
      [
        'filter.tsx:1:29',
        'Native <input type="search"> has a Paneon equivalent: use Input from @qoggy/paneon/ui.',
      ],
      [
        'panel.tsx:4:3',
        'Native <select> has a Paneon equivalent: use Select from @qoggy/paneon/ui and pass items so it shows labels for values.',
      ],
      [
        'panel.tsx:5:3',
        'Native <textarea> has a Paneon equivalent: use Textarea from @qoggy/paneon/ui.',
      ],
      [
        'panel.tsx:6:3',
        'Native <input type="text"> has a Paneon equivalent: use Input from @qoggy/paneon/ui.',
      ],
      [
        'panel.tsx:7:3',
        'Native <input type="number"> has a Paneon equivalent: use Input from @qoggy/paneon/ui.',
      ],
    ],
  );
  assert.equal(report.status, 'disabled');
  assert.match(report.summary, /^5 native control\(s\) have a Paneon component equivalent\./);
  assert.match(report.next, /^Replace each listed native control with the named component\./);
});

void test('never reports native elements without a certain one-to-one replacement', async () => {
  const report = await check(
    `import {definePanel} from '@qoggy/paneon/sdk';
import {Select, Input, Textarea, Button} from '@qoggy/paneon/ui';
const props = {type: 'text'};
const kind = Math.random() > 0.5 ? 'text' : 'checkbox';
function Panel(){return (<>
  <select multiple><option>A</option></select>
  <select size={4}><option>A</option></select>
  <select {...props}><option>A</option></select>
  <input type="checkbox" /><input type="radio" /><input type="range" /><input type="file" />
  <input type="hidden" /><input type="color" /><input type="date" />
  <input type={kind} /><input {...props} /><input hidden /><input aria-hidden="true" />
  <textarea {...props} />
  <button type="button">Row</button><table><tbody><tr><td>Cell</td></tr></tbody></table>
  <Select items={[]} /><Input /><Textarea /><Button>Save</Button>
</>);}
export default definePanel({render: Panel});`,
  );
  assert.deepEqual(report.nativeControls, []);
});
