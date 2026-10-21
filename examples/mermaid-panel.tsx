import { useState } from 'react';
import { definePanel, z } from 'paneon/sdk';
import {
  Button,
  Field,
  FieldLabel,
  Markdown,
  Mermaid,
  Page,
  Section,
  Stack,
  Textarea,
} from 'paneon/ui';

const initialCode =
  'flowchart LR\n  Request[Human request] --> Agent\n  Agent --> Panel\n  Panel --> Feedback[Human feedback]\n  Feedback --> Agent';
const sequenceCode =
  'sequenceDiagram\n  participant Human\n  participant Agent\n  Human->>Agent: Describe a problem\n  Agent-->>Human: Show an interactive explanation';
const markdown = [
  'A Markdown document can mix diagrams with ordinary text and code.',
  '',
  '```mermaid',
  'flowchart LR',
  '  Question --> Options',
  '  Options --> Review',
  '```',
  '',
  '```mermaid',
  'sequenceDiagram',
  '  Human->>Panel: Choose an option',
  '  Panel-->>Human: Show details',
  '```',
  '',
  'Inline `mermaid` stays text. Other code blocks remain code:',
  '',
  '```typescript',
  'const selected = "Option A";',
  '```',
].join('\n');

function MermaidPanel() {
  const [code, setCode] = useState(initialCode);
  return (
    <Page title="Mermaid diagrams">
      <Stack>
        <Section title="Editable diagram">
          <Field>
            <FieldLabel htmlFor="mermaid-source">Diagram source</FieldLabel>
            <Textarea
              id="mermaid-source"
              value={code}
              rows={7}
              onChange={(event) => setCode(event.target.value)}
            />
          </Field>
          <Stack direction="row" wrap>
            <Button variant="outline" onClick={() => setCode(initialCode)}>
              Flowchart
            </Button>
            <Button variant="outline" onClick={() => setCode(sequenceCode)}>
              Sequence diagram
            </Button>
            <Button variant="outline" onClick={() => setCode('flowchart LR\n  A --> [')}>
              Try invalid source
            </Button>
          </Stack>
          <Mermaid code={code} />
        </Section>
        <Section title="Diagrams in Markdown">
          <Markdown>{markdown}</Markdown>
        </Section>
      </Stack>
    </Page>
  );
}

export default definePanel({
  id: 'mermaid-panel',
  requires: { paneon: '0.0.0' },
  input: z.object({}),
  events: {},
  render: MermaidPanel,
});
