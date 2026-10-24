import { useMemo, useRef, useState } from 'react';
import { agent, definePanel, annotationValueSchema, serverAction, z } from 'paneon/sdk';
import { Page, Card, AnnotationMenu, AnnotationRoot, AnnotationText } from 'paneon/ui';
import type { AnnotationAdapter } from 'paneon/ui';

const source = 'Use Redis for shared cache storage.';
const refSchema = z.literal('redis-plan');
type Ref = z.infer<typeof refSchema>;
const resultSchema = annotationValueSchema(refSchema);

export const validateAnnotations = serverAction({
  kind: 'query',
  input: resultSchema,
  handler: (_ctx, input) => {
    const boundaries = new Set([
      ...Array.from(
        new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(source),
        (part) => part.index,
      ),
      source.length,
    ]);
    for (const entry of input.annotations) {
      for (const target of entry.targets) {
        const range = target.text;
        if (
          range &&
          (!boundaries.has(range.start) ||
            !boundaries.has(range.end) ||
            source.slice(range.start, range.end) !== range.quote)
        ) {
          throw new Error('The selected text does not match this plan.');
        }
      }
    }
    return input;
  },
});

function Panel() {
  const card = useRef<HTMLDivElement>(null);
  const [saved, setSaved] = useState('');
  const adapter = useMemo<AnnotationAdapter<Ref>>(
    () => ({
      resolve(target) {
        return refSchema.safeParse(target.ref).success
          ? { status: 'ready', text: source }
          : { status: 'missing', message: 'Unknown plan.' };
      },
      locate() {
        card.current?.scrollIntoView({ block: 'center' });
      },
    }),
    [],
  );
  return (
    <Page title="Annotation example">
      <AnnotationRoot<Ref>
        adapter={adapter}
        onSubmit={async (value) => {
          setSaved('');
          const checked = await validateAnnotations(value);
          const receipt = await agent.emit('annotations-submitted', checked);
          setSaved(`Saved as event ${receipt.id}.`);
        }}
      >
        <AnnotationMenu />

        <Card ref={card} className="p-4">
          <AnnotationText target="redis-plan">{source}</AnnotationText>
        </Card>

        {saved && <p role="status">{saved}</p>}
      </AnnotationRoot>
    </Page>
  );
}

export default definePanel({
  id: 'custom-annotations',
  requires: { paneon: '0.0.0' },
  input: z.object({}).strict(),
  events: { 'annotations-submitted': resultSchema },
  render: Panel,
});
