import { useState } from 'react';
import { agent, definePanel, serverAction, z } from 'paneon/sdk';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Field,
  FieldLabel,
  Markdown,
  Page,
  RadioGroup,
  RadioGroupItem,
  Section,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from 'paneon/ui';

export const compareCost = serverAction({
  kind: 'query',
  input: z.object({ requests: z.number().int().min(0), cached: z.boolean() }),
  handler: (_ctx, input) => ({
    originRequests: input.cached ? Math.ceil(input.requests * 0.2) : input.requests,
  }),
});
function DecisionPanel() {
  const [choice, setChoice] = useState('cache');
  const [comment, setComment] = useState('');
  const [cached, setCached] = useState(true);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  async function submit() {
    setPending(true);
    try {
      await agent.emit('decision-submitted', { choice, comment });
      setMessage('Submitted to AI. Your agent can read this choice after it resumes.');
    } catch {
      setMessage('The choice was not saved.');
    } finally {
      setPending(false);
    }
  }
  async function calculate() {
    try {
      const result = await compareCost({ requests: 100, cached });
      setMessage(`Origin requests for 100 reads: ${result.originRequests}.`);
    } catch {
      setMessage('The calculation failed.');
    }
  }
  return (
    <Page
      title="Compare architecture options"
      description="A reusable review interface with a small interactive explanation."
    >
      <Stack>
        <RadioGroup value={choice} onValueChange={setChoice} aria-label="Architecture option">
          <Stack direction="row" wrap>
            {[
              {
                id: 'cache',
                title: 'Read-through cache',
                detail: 'Fewer origin reads; invalidation requires care.',
              },
              {
                id: 'direct',
                title: 'Direct reads',
                detail: 'Fewer moving parts; every read reaches the origin.',
              },
            ].map((option) => (
              <Card key={option.id}>
                <CardHeader>
                  <CardTitle>{option.title}</CardTitle>
                  <CardDescription>{option.detail}</CardDescription>
                </CardHeader>
                <CardContent>
                  <RadioGroupItem id={`option-${option.id}`} value={option.id} />
                  <label htmlFor={`option-${option.id}`}>Choose {option.title}</label>
                </CardContent>
                <CardFooter>
                  <Badge variant="outline">Reviewable option</Badge>
                </CardFooter>
              </Card>
            ))}
          </Stack>
        </RadioGroup>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Option</TableHead>
              <TableHead>Origin load</TableHead>
              <TableHead>Complexity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>Cache</TableCell>
              <TableCell>Lower</TableCell>
              <TableCell>Invalidation</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Direct</TableCell>
              <TableCell>Higher</TableCell>
              <TableCell>Simple</TableCell>
            </TableRow>
          </TableBody>
        </Table>
        <Section title="How a read moves">
          <Stack direction="row">
            <Switch id="cache-enabled" checked={cached} onCheckedChange={setCached} />
            <label htmlFor="cache-enabled">Enable cache in the diagram</label>
          </Stack>
          <svg
            viewBox="0 0 600 100"
            role="img"
            aria-label={cached ? 'Client to cache to origin' : 'Client directly to origin'}
            width="100%"
            height="120"
          >
            <path d="M110 50 H490" stroke="currentColor" fill="none" />
            <rect x="10" y="20" width="100" height="60" rx="8" fill="white" stroke="currentColor" />
            <text x="60" y="55" textAnchor="middle">
              Client
            </text>
            {cached && (
              <g>
                <rect
                  x="250"
                  y="20"
                  width="100"
                  height="60"
                  rx="8"
                  fill="white"
                  stroke="currentColor"
                />
                <text x="300" y="55" textAnchor="middle">
                  Cache
                </text>
              </g>
            )}
            <rect
              x="490"
              y="20"
              width="100"
              height="60"
              rx="8"
              fill="white"
              stroke="currentColor"
            />
            <text x="540" y="55" textAnchor="middle">
              Origin
            </text>
          </svg>
          <Button variant="outline" onClick={() => void calculate()}>
            Calculate example load
          </Button>
        </Section>
        <Accordion type="single" collapsible>
          <AccordionItem value="tradeoffs">
            <AccordionTrigger>Read the trade-offs</AccordionTrigger>
            <AccordionContent>
              <Markdown>
                {
                  '### Questions to review\n\n- How stale may a result be?\n- Which writes must invalidate the cache?\n- Is reduced origin load worth the extra moving parts?\n\n> The diagram illustrates a proposal; it does not run a cache.'
                }
              </Markdown>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
        <Field>
          <FieldLabel htmlFor="feedback">Feedback for AI</FieldLabel>
          <Textarea
            id="feedback"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="What should change in this proposal?"
          />
        </Field>
        <Button disabled={pending} onClick={() => void submit()}>
          Submit decision to AI
        </Button>
        {message && (
          <Alert>
            <AlertTitle>Feedback</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}
      </Stack>
    </Page>
  );
}
export default definePanel({
  id: 'decision-panel',
  requires: { paneon: '0.0.0' },
  input: z.object({}),
  events: { 'decision-submitted': z.object({ choice: z.string(), comment: z.string() }) },
  render: DecisionPanel,
});
