import { useState } from 'react';
import { agent, definePanel, serverAction, usePanelInput, useQuery, z } from '@qoggy/paneon/sdk';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Field,
  FieldLabel,
  Input,
  Page,
  Spinner,
  Stack,
} from '@qoggy/paneon/ui';

export const readCounter = serverAction({
  kind: 'query',
  input: z.object({ baseUrl: z.string().url() }),
  handler: async (ctx, input) => {
    const response = await fetch(`${input.baseUrl}/counter`, { signal: ctx.signal });
    if (!response.ok) throw new Error('Demo HTTP query failed.');
    return (await response.json()) as { counter: number };
  },
});
export const incrementCounter = serverAction({
  kind: 'mutation',
  input: z.object({ baseUrl: z.string().url(), amount: z.number().int().min(1).max(10) }),
  handler: async (ctx, input) => {
    const response = await fetch(`${input.baseUrl}/counter`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amount: input.amount }),
      signal: ctx.signal,
    });
    if (!response.ok) throw new Error('Demo HTTP mutation failed.');
    return (await response.json()) as { counter: number };
  },
});
function HttpPanel() {
  const { baseUrl } = usePanelInput<{ baseUrl: string }>();
  const counter = useQuery(readCounter, { baseUrl });
  const [amount, setAmount] = useState(1);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function increment() {
    setPending(true);
    setError('');
    setMessage('');
    try {
      const result = await incrementCounter({ baseUrl, amount });
      setMessage(`Counter updated to ${result.counter}.`);
      await counter.refetch();
    } catch {
      setError('Could not update counter. Start the demo HTTP server and check its URL.');
    } finally {
      setPending(false);
    }
  }
  async function requestAnalysis() {
    try {
      await agent.emit('counter-analysis-requested', { counter: counter.data?.counter ?? 0 });
      setMessage('Submitted to AI.');
    } catch {
      setError('The event was not saved.');
    }
  }
  return (
    <Page
      title="HTTP counter"
      description="The author uses fetch; Paneon provides the function bridge."
    >
      <Stack>
        {counter.loading && <Spinner aria-label="Loading counter" />}
        {(error || counter.error) && (
          <Alert variant="destructive">
            <AlertTitle>Request failed</AlertTitle>
            <AlertDescription>
              {error || 'Start the demo HTTP server to read its counter.'}
            </AlertDescription>
          </Alert>
        )}
        <p aria-live="polite">Counter: {counter.data?.counter ?? '—'}</p>
        <Field>
          <FieldLabel htmlFor="amount">Increment amount</FieldLabel>
          <Input
            id="amount"
            type="number"
            min={1}
            max={10}
            value={amount}
            onChange={(event) => setAmount(Number(event.target.value))}
          />
        </Field>
        <Stack direction="row" wrap>
          <Button
            disabled={pending || !Number.isInteger(amount) || amount < 1 || amount > 10}
            onClick={() => void increment()}
          >
            Increment directly
          </Button>
          <Button variant="outline" onClick={() => void counter.refetch()}>
            Refresh counter
          </Button>
          <Button variant="secondary" onClick={() => void requestAnalysis()}>
            Ask AI about counter
          </Button>
        </Stack>
        {message && <p role="status">{message}</p>}
      </Stack>
    </Page>
  );
}
export default definePanel({
  id: 'http-panel',
  requires: { paneon: '__PANEON_TEST_VERSION__' },
  input: z.object({ baseUrl: z.string().url() }),
  events: { 'counter-analysis-requested': z.object({ counter: z.number() }) },
  render: HttpPanel,
});
