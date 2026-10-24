import { useState } from 'react';
import { agent, definePanel, serverAction, useQuery, z } from 'paneon/sdk';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CodeBlock,
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  Page,
  Section,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from 'paneon/ui';
import { releaseCommand } from './business';

export const readRelease = serverAction({
  kind: 'query',
  input: z.object({ environment: z.enum(['staging', 'preview']) }),
  handler: async (_ctx, input) => releaseCommand('status', input.environment),
});
export const integrateBranch = serverAction({
  kind: 'mutation',
  input: z.object({ environment: z.enum(['staging', 'preview']), branch: z.string().min(1) }),
  handler: async (_ctx, input) => releaseCommand('integrate', input.environment, input.branch),
});
export const advanceRelease = serverAction({
  kind: 'mutation',
  input: z.object({ environment: z.enum(['staging', 'preview']) }),
  handler: async (_ctx, input) => releaseCommand('advance', input.environment),
});

function ReleasePanel() {
  const [environment, setEnvironment] = useState<'staging' | 'preview'>('staging');
  const [branch, setBranch] = useState('feature/example');
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [failure, setFailure] = useState('');
  const release = useQuery(readRelease, { environment });
  async function perform(action: () => Promise<unknown>, success: string) {
    setPending(true);
    setFailure('');
    setFeedback('');
    try {
      await action();
      setFeedback(success);
      await release.refetch();
    } catch {
      setFailure(
        'The demo operation failed. Check that --cwd contains fixtures/panels/demo-release-cli.mjs.',
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <Page
      title="Release workspace"
      description="A simulated CLI integration. No application is deployed."
    >
      <Stack>
        <Field>
          <FieldLabel htmlFor="environment">Environment</FieldLabel>
          <Select
            items={{ preview: 'Preview', staging: 'Staging' }}
            value={environment}
            onValueChange={(value) => setEnvironment(value as 'staging' | 'preview')}
          >
            <SelectTrigger id="environment">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="staging">Staging</SelectItem>
              <SelectItem value="preview">Preview</SelectItem>
            </SelectContent>
          </Select>
          <FieldDescription>
            The example CLI owns the state stored in your working directory.
          </FieldDescription>
        </Field>
        <Section title="Integration area">
          <Stack direction="row" wrap>
            <Button
              variant="outline"
              disabled={pending || release.loading}
              onClick={() => void release.refetch()}
            >
              Refresh branches
            </Button>
            <Button
              disabled={pending || !release.data?.branches.length}
              onClick={() =>
                void perform(() => advanceRelease({ environment }), 'Demo step completed.')
              }
            >
              Advance demo step
            </Button>
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() =>
                void perform(
                  () => agent.emit('analyze-requested', { environment }),
                  'Submitted to AI. Resume your agent to read the event.',
                )
              }
            >
              Ask AI to analyze
            </Button>
          </Stack>
          {release.loading && <Spinner aria-label="Loading branches" />}
          {(failure || release.error) && (
            <Alert variant="destructive">
              <AlertTitle>Unable to complete request</AlertTitle>
              <AlertDescription>{failure || 'Unable to read the demo CLI.'}</AlertDescription>
            </Alert>
          )}
          {feedback && (
            <Alert>
              <AlertTitle>Done</AlertTitle>
              <AlertDescription>{feedback}</AlertDescription>
            </Alert>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Branch</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {release.data?.branches.map((name) => (
                <TableRow key={name}>
                  <TableCell>{name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">Integrated</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {release.data && release.data.branches.length === 0 && (
            <p>No integrated branches. Add one below.</p>
          )}
        </Section>
        <Field>
          <FieldLabel htmlFor="branch">Branch to integrate</FieldLabel>
          <Input id="branch" value={branch} onChange={(event) => setBranch(event.target.value)} />
          <Button
            disabled={pending || !branch.trim()}
            onClick={() =>
              void perform(
                () => integrateBranch({ environment, branch: branch.trim() }),
                'Branch added to the demo integration area.',
              )
            }
          >
            Add branch
          </Button>
        </Field>
        <Card>
          <CardHeader>
            <CardTitle>Simulated steps</CardTitle>
          </CardHeader>
          <CardContent>
            <Stack direction="row" wrap>
              {['Merge', 'Build', 'Deploy', 'Verify'].map((step, index) => (
                <Badge
                  key={step}
                  variant={(release.data?.step ?? 0) > index ? 'default' : 'outline'}
                >
                  {step}
                </Badge>
              ))}
            </Stack>
          </CardContent>
        </Card>
        <Section title="Example-owned history">
          <CodeBlock code={release.data?.history.join('\n') || 'No operations yet.'} />
        </Section>
      </Stack>
    </Page>
  );
}
export default definePanel({
  id: 'release-panel',
  requires: { paneon: '0.0.0' },
  input: z.object({}),
  events: { 'analyze-requested': z.object({ environment: z.string() }) },
  render: ReleasePanel,
});
