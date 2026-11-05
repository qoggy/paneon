import { projectHistory } from './history-filter.ts';
import type { GitAuthor, HistoryFilter } from './history-filter.ts';
import type { GitCommit } from './git.ts';

type RunGit = (args: string[], input?: string) => Promise<Buffer>;
const records = (value: Buffer, width: number) => {
  const fields = value.toString('utf8').split('\0');
  const result: string[][] = [];
  for (let i = 0; i + width - 1 < fields.length; i += width)
    result.push([fields[i].trim(), ...fields.slice(i + 1, i + width)]);
  return result;
};

export async function historyAuthors(run: RunGit, tip?: string) {
  const [log, configuration] = await Promise.all([
    tip ? run(['log', '--format=%an%x00%ae%x00', tip, '--']) : Promise.resolve(Buffer.alloc(0)),
    run(['config', '--get', '--default', '', 'user.email']),
  ]);
  const authors = new Map<string, GitAuthor>();
  for (const [name, email] of records(log, 2))
    authors.set(JSON.stringify([name, email]), { name, email });
  return {
    authors: [...authors.values()].sort(
      (a, b) => a.name.localeCompare(b.name) || a.email.localeCompare(b.email),
    ),
    me: configuration.toString('utf8').trim(),
  };
}

export async function filteredHistory(
  run: RunGit,
  tip: string,
  filter: HistoryFilter,
  offset: number,
) {
  const [ancestry, textMatches, me] = await Promise.all([
    run(['log', '--date-order', '--format=%H%x00%P%x00%an%x00%ae%x00', tip, '--']),
    filter.text
      ? run([
          'log',
          '--format=%H',
          filter.regex ? '--extended-regexp' : '--fixed-strings',
          ...(filter.matchCase ? [] : ['--regexp-ignore-case']),
          `--grep=${filter.text}`,
          tip,
          '--',
        ])
      : Promise.resolve(Buffer.alloc(0)),
    filter.author === 'me'
      ? run(['config', '--get', '--default', '', 'user.email'])
      : Promise.resolve(Buffer.alloc(0)),
  ]);
  const textIds = new Set(textMatches.toString('utf8').trim().split('\n'));
  const prefix =
    filter.text && /^[a-f\d]{4,}$/i.test(filter.text) ? filter.text.toLowerCase() : undefined;
  const ownEmail = me.toString('utf8').trim();
  const nodes = records(ancestry, 4).map(([oid, parents, name, email]) => ({
    oid,
    parents: parents.split(' ').filter(Boolean),
    name,
    email,
  }));
  const matched = nodes.filter(
    (node) =>
      (!filter.text || textIds.has(node.oid) || (prefix && node.oid.startsWith(prefix))) &&
      (!filter.author ||
        (filter.author === 'me'
          ? !!ownEmail && node.email === ownEmail
          : node.name === filter.author.name && node.email === filter.author.email)),
  );
  const edges = projectHistory(nodes, new Set(matched.map((node) => node.oid)));
  const page = matched.slice(offset, offset + 50);
  const values = page.length
    ? records(
        await run(
          [
            'log',
            '--no-walk=unsorted',
            '--stdin',
            '--format=%H%x00%P%x00%s%x00%an%x00%aI%x00%B%x00',
            '--',
          ],
          page.map((node) => node.oid).join('\n') + '\n',
        ),
        6,
      )
    : [];
  const commits: GitCommit[] = values.map(([oid, parents, subject, author, date, message]) => ({
    oid,
    parents: parents.split(' ').filter(Boolean),
    subject,
    author,
    date,
    refs: [],
    ...edges.get(oid),
    ...(filter.text && textIds.has(oid) ? { matchedMessage: message } : {}),
  }));
  return { commits, hasMore: matched.length > offset + 50 };
}
