import { useState } from 'react';
import { agent, definePanel, serverAction, usePanelInput, useQuery, z } from '@qoggy/paneon/sdk';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Markdown,
  Page,
  Spinner,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@qoggy/paneon/ui';
import { pullRequestDetail, repositoryPullRequests } from './github';
import type { PullRequestDetail } from './github';

export const listPullRequests = serverAction({
  kind: 'query',
  input: z.object({ repository: z.string().regex(/^[\w.-]+\/[\w.-]+$/) }),
  handler: async (_ctx, input) => repositoryPullRequests(input.repository),
});
export const viewPullRequest = serverAction({
  kind: 'query',
  input: z.object({
    repository: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
    number: z.number().int().positive(),
  }),
  handler: async (_ctx, input) => pullRequestDetail(input.repository, input.number),
});
function GitHubPanel() {
  const { repository } = usePanelInput<{ repository: string }>();
  const result = useQuery(listPullRequests, { repository });
  const [detail, setDetail] = useState<PullRequestDetail | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  async function showDetails(number: number) {
    setPending(true);
    setMessage('');
    try {
      setDetail(await viewPullRequest({ repository, number }));
    } catch {
      setMessage('Could not read PR details. Check gh authentication and repository access.');
    } finally {
      setPending(false);
    }
  }
  async function askAI(number: number) {
    try {
      await agent.emit('review-requested', { repository, number });
      setMessage(`PR #${number} submitted to AI for review.`);
    } catch {
      setMessage('The review request was not saved.');
    }
  }
  return (
    <Page
      title={`Pull requests · ${repository}`}
      description="Real gh CLI reads run directly. Review requests are durable events for your agent."
    >
      <Stack>
        <p>{result.data?.repository.description}</p>
        <Button
          variant="outline"
          disabled={result.loading || pending}
          onClick={() => void result.refetch()}
        >
          Refresh pull requests
        </Button>
        {(result.loading || pending) && <Spinner aria-label="Loading GitHub data" />}
        {result.error && (
          <Alert variant="destructive">
            <AlertTitle>GitHub query failed</AlertTitle>
            <AlertDescription>
              Install gh, run gh auth login, and verify access to this repository.
            </AlertDescription>
          </Alert>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pull request</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.data?.pullRequests.map((pr) => (
              <TableRow key={pr.number}>
                <TableCell>
                  #{pr.number} {pr.title}
                </TableCell>
                <TableCell>{pr.headRefName}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{pr.state}</Badge>
                </TableCell>
                <TableCell>
                  <Stack direction="row" wrap>
                    <Button
                      variant="outline"
                      disabled={pending}
                      onClick={() => void showDetails(pr.number)}
                    >
                      Details #{pr.number}
                    </Button>
                    <Button onClick={() => void askAI(pr.number)}>
                      Ask AI to review #{pr.number}
                    </Button>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {result.data?.pullRequests.length === 0 && <p>No open pull requests.</p>}
        {message && <p role="status">{message}</p>}
        <Dialog
          open={detail !== null}
          onOpenChange={(open) => {
            if (!open) setDetail(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {detail ? `#${detail.number} ${detail.title}` : 'PR details'}
              </DialogTitle>
              <DialogDescription>
                {detail ? `${detail.headRefName} → ${detail.baseRefName}` : 'GitHub pull request'}
              </DialogDescription>
            </DialogHeader>
            <Markdown>{detail?.body || 'No description.'}</Markdown>
          </DialogContent>
        </Dialog>
      </Stack>
    </Page>
  );
}
export default definePanel({
  id: 'gh-panel',
  requires: { paneon: '__PANEON_TEST_VERSION__' },
  input: z.object({ repository: z.string().regex(/^[\w.-]+\/[\w.-]+$/) }),
  events: {
    'review-requested': z.object({ repository: z.string(), number: z.number().int().positive() }),
  },
  render: GitHubPanel,
});
