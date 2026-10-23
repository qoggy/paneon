import { useState } from 'react';
import { definePanel, usePanelInput, z } from 'paneon/sdk';
import {
  GitBranches,
  GitCommitGraph,
  GitChangedFiles,
} from '../../panels/git-review/components.tsx';
import type { GitSnapshot } from '../../panels/git-review/git.ts';
import { DiffView } from '../../shared/diff.tsx';
const input = z
  .object({ repositoryPath: z.string().min(1), branch: z.string().optional() })
  .strict();
function Example() {
  const params = usePanelInput<z.infer<typeof input>>();
  const [branch, setBranch] = useState(params.branch),
    [commit, setCommit] = useState<string>();
  const [snapshot, setSnapshot] = useState<GitSnapshot>();
  return (
    <main className="grid min-h-screen grid-cols-3 gap-3 p-3">
      <GitBranches
        repositoryPath={params.repositoryPath}
        selected={branch}
        onSelect={(ref) => {
          setBranch(ref);
          setCommit(undefined);
          setSnapshot(undefined);
        }}
      />
      <section className="min-h-0 overflow-auto">
        <GitCommitGraph
          repositoryPath={params.repositoryPath}
          branch={branch}
          selected={commit}
          onSelect={(next) => {
            setCommit(next.oid);
            setSnapshot(undefined);
          }}
        />
      </section>
      <section>
        <GitChangedFiles
          repositoryPath={params.repositoryPath}
          view={commit ? { type: 'history', commit } : { type: 'changes', area: 'unstaged' }}
          selected={snapshot?.fileId}
          onSelectFile={setSnapshot}
        />
      </section>
      <section className="col-span-3">
        <DiffView
          oldText={snapshot?.model.oldText ?? 'old text\n'}
          newText={snapshot?.model.newText ?? 'new text\n'}
          oldPath={snapshot?.source.old?.path}
          newPath={snapshot?.source.new?.path}
          defaultExpanded
        />
      </section>
    </main>
  );
}
export default definePanel({
  id: 'git-components-example',
  requires: { paneon: '0.0.0' },
  input,
  events: {},
  render: Example,
});
