import { useState } from 'react';
import { agent, annotationValueSchema, definePanel, usePanelInput, z } from '@qoggy/paneon/sdk';
import {
  AnnotationText,
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Image,
  Page,
  useAnnotations,
  usePageAnnotations,
} from '@qoggy/paneon/ui';

const entry = annotationValueSchema(z.literal('source')).shape.annotations.element;
const result = z.object({
  annotations: z.array(z.object({ targets: entry.shape.targets, comment: entry.shape.comment })),
});
function Draft() {
  const { value } = useAnnotations();
  return (
    <output data-testid="draft" hidden>
      {JSON.stringify(value)}
    </output>
  );
}
function Panel() {
  const { excerpt } = usePanelInput<{ excerpt: string }>();
  const [clicks, setClicks] = useState(0);
  const [cardState, setCardState] = useState<'visible' | 'hidden' | 'removed'>('visible');
  usePageAnnotations<'source'>({
    onSubmit: async (value) => {
      await agent.emit('element-feedback', {
        annotations: value.annotations.map(({ targets, comment }) => ({ targets, comment })),
      });
    },
    adapter: {
      locate: () => {},
    },
  });
  return (
    <Page title="Element annotation acceptance">
      <div className="flex gap-2">
        <Button onClick={() => setCardState('hidden')}>Hide card</Button>
        <Button onClick={() => setCardState('visible')}>Show card</Button>
        <Button onClick={() => setCardState('removed')}>Remove card</Button>
      </div>
      {cardState !== 'removed' && (
        <Card data-testid="card" hidden={cardState === 'hidden'}>
          <CardHeader>
            <CardTitle>Unregistered card 👨‍👩‍👧‍👦</CardTitle>
          </CardHeader>
          <CardContent>
            <svg role="img" aria-label={excerpt} viewBox="0 0 400 70" className="h-20 w-full">
              <rect x="1" y="1" width="398" height="68" rx="6" fill="var(--muted)" />
              <text x="20" y="40" fill="currentColor">
                Unregistered SVG
              </text>
            </svg>
            <Button onClick={() => setClicks((count) => count + 1)}>Business action</Button>
            <output data-testid="clicks">{clicks}</output>
          </CardContent>
        </Card>
      )}
      <div data-testid="scroll" className="mt-8 h-40 overflow-auto rounded-md border">
        <div className="h-24" />
        <div data-testid="nested-target" className="m-3 h-16 border p-3">
          Nested scroll target
        </div>
        <div className="h-80" />
      </div>
      <Image
        src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='120'%3E%3Crect width='400' height='120' fill='silver'/%3E%3C/svg%3E"
        alt="Viewer drawing"
        annotationTarget="source"
      />
      <AnnotationText target="source">Original registered text.</AnnotationText>
      <Draft />
      <div className="h-96" />
    </Page>
  );
}
export default definePanel({
  id: 'element-annotation-acceptance',
  requires: { paneon: '__PANEON_TEST_VERSION__' },
  input: z.object({ excerpt: z.string() }),
  events: { 'element-feedback': result },
  render: Panel,
});
