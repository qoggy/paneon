import { createHash } from 'node:crypto';
export type PRFixtureState = {
  version?: number;
  headVersion?: number;
  fail?: string;
  coverage?: boolean;
  truncatedTree?: boolean;
  corruptBlob?: boolean;
  paginateChecks?: boolean;
};
export const ids = {
  base: 'a'.repeat(40),
  head: 'b'.repeat(40),
  merge: 'c'.repeat(40),
  newer: 'd'.repeat(40),
  second: 'e'.repeat(40),
};
export const body = (version = 0) =>
  version
    ? '# Updated\n\n新的说明，缓存已经变化。\n'
    : '# PR 说明\n\n重复 缓存 缓存🙂，含 **强调**、[链接](https://example.com) &amp; 原文。\n';
const oldText = 'const 标题 = "缓存 缓存🙂";\r\nconst n = 1;\r\nlast';
export const code = (value: number) => oldText.replace('n = 1', `n = ${value}`);
const gitBlobOID = (bytes: Buffer) =>
  createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
function fixtureObjects() {
  const blobs = new Map<string, Buffer>();
  const add = (value: string | Buffer) => {
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value),
      sha = gitBlobOID(bytes);
    blobs.set(sha, bytes);
    return sha;
  };
  const file = (path: string, value: string | Buffer, mode = '100644') => ({
    path,
    mode,
    type: 'blob' as const,
    sha: add(value),
  });
  const gitlink = { path: 'module', mode: '160000', type: 'commit' as const, sha: 'f'.repeat(40) };
  const rootCommon = [
    file('binary.bin', Buffer.from([0, 255, 1])),
    file('link', '/private/outside', '120000'),
    gitlink,
    file('invalid.txt', Buffer.from([0xc3, 0x28])),
  ];
  const oldRoot = [
    { path: 'src', mode: '040000', type: 'tree', sha: '5'.repeat(40) },
    file('binary.bin', Buffer.from([0, 254, 1])),
    file('link', '/private/old', '120000'),
    gitlink,
    file('invalid.txt', 'before'),
    file('deleted.txt', 'deleted\n'),
  ];
  const trees = new Map<string, unknown[]>([
    ['1'.repeat(40), oldRoot],
    [
      '2'.repeat(40),
      [
        { path: 'src', mode: '040000', type: 'tree', sha: '6'.repeat(40) },
        ...rootCommon,
        file('added.txt', 'added\n'),
      ],
    ],
    [
      '3'.repeat(40),
      [
        { path: 'src', mode: '040000', type: 'tree', sha: '7'.repeat(40) },
        ...rootCommon,
        file('added.txt', 'added\n'),
      ],
    ],
    ['4'.repeat(40), [{ path: 'src', mode: '040000', type: 'tree', sha: '8'.repeat(40) }]],
    ['5'.repeat(40), [file('a.ts', code(1)), file('old name\n.ts', 'rename content\n')]],
    ['6'.repeat(40), [file('a.ts', code(2)), file('new name\n.ts', 'rename content\n')]],
    ['7'.repeat(40), [file('a.ts', code(3)), file('new name\n.ts', 'rename content\n')]],
    ['8'.repeat(40), [file('a.ts', 'server-side PR\n')]],
    ['9'.repeat(40), [file('a.ts', 'wrong base branch content\n')]],
  ]);
  return { blobs, trees, file };
}
export function fixtureDetail(number: number, state: PRFixtureState = {}) {
  const second = number === 202;
  return {
    number,
    title: second ? '第二个 PR' : 'Review cache behavior',
    state: 'OPEN',
    headRefName: second ? 'server' : 'feature',
    baseRefName: 'main',
    isDraft: false,
    updatedAt: `2026-10-21T10:00:0${state.version ?? 0}Z`,
    url: `https://github.com/example/project/pull/${number}`,
    author: { login: 'fixture-author' },
    body: second ? '第二个 PR 的说明。\n' : body(state.version),
    baseRefOid: ids.base,
    headRefOid: second ? ids.second : state.headVersion ? ids.newer : ids.head,
    changedFiles: second ? 1 : state.coverage ? 301 : 8,
    mergeStateStatus: 'CLEAN',
    mergeable: 'MERGEABLE',
    reviewDecision: 'REVIEW_REQUIRED',
    headRepository: { name: 'project' },
    headRepositoryOwner: { login: 'example' },
  };
}
export function routeGh(args: string[], state: PRFixtureState = {}): unknown {
  const objects = fixtureObjects();
  const arg = (flag: string) => args[args.indexOf(flag) + 1];
  if (args[0] === 'pr' && args[1] === 'list') {
    if (state.fail === 'list') throw new Error('fixture gh list failure');
    const list = [101, 202, ...Array.from({ length: 29 }, (_, i) => 303 + i)].map((n) =>
      fixtureDetail(n, state),
    );
    const search = args.includes('--search') ? arg('--search') : '';
    return list
      .filter((item) => item.title.includes(search))
      .slice(0, Number(arg('--limit')))
      .map((item) => ({
        ...item,
        state:
          arg('--state') === 'merged' ? 'MERGED' : arg('--state') === 'closed' ? 'CLOSED' : 'OPEN',
      }));
  }
  if (args[0] === 'pr' && args[1] === 'view') {
    if (state.fail === 'detail') throw new Error('fixture gh detail failure');
    return fixtureDetail(Number(args[2]), state);
  }
  if (args[0] !== 'api')
    throw new Error('Fixture rejects commands other than read-only pr list/view and API queries.');
  if (args[1] === 'graphql') {
    if (state.fail === 'checks') throw new Error('fixture gh checks failure');
    const query = args.find((value) => value.startsWith('query=')) ?? '';
    if (!query.includes('query PaneonPRChecks') || query.includes('mutation'))
      throw new Error('Only the fixed read-only checks query is permitted.');
    const after = args.find((value) => value.startsWith('after='));
    const nodes = [
      {
        __typename: 'CheckRun',
        id: 'CR_NODE_1',
        name: 'lint',
        status: 'COMPLETED',
        conclusion: state.version ? 'SUCCESS' : 'FAILURE',
        detailsUrl: 'https://github.com/example/project/actions/runs/1/job/1',
      },
      {
        __typename: 'CheckRun',
        id: 'CR_NODE_2',
        name: 'lint',
        status: 'IN_PROGRESS',
        conclusion: null,
        detailsUrl: 'https://github.com/example/project/actions/runs/1/job/2',
      },
      {
        __typename: 'StatusContext',
        id: 'SC_NODE_1',
        context: 'legacy ci',
        state: 'PENDING',
        targetUrl: 'https://ci.example.test/build/1',
      },
    ];
    return {
      data: {
        repository: {
          object: {
            statusCheckRollup: {
              contexts: {
                nodes:
                  state.paginateChecks && !after
                    ? nodes.slice(0, 1)
                    : state.paginateChecks
                      ? nodes.slice(1)
                      : nodes,
                pageInfo: {
                  hasNextPage: !!state.paginateChecks && !after,
                  endCursor: state.paginateChecks && !after ? 'cursor-1' : null,
                },
              },
            },
          },
        },
      },
    };
  }
  if (arg('--method') !== 'GET') throw new Error('Fixture rejects non-GET REST requests.');
  const endpoint = args.at(-1) ?? '';
  if (!endpoint.startsWith('repos/example/project/')) throw new Error('Unexpected repository.');
  const path = endpoint.slice('repos/example/project/'.length);
  if (path.startsWith('compare/')) {
    if (state.fail === 'compare') throw new Error('fixture gh compare failure');
    const head = path.split('...')[1].split('?')[0];
    const newCode =
      head === ids.newer ? code(3) : head === ids.second ? 'server-side PR\n' : code(2);
    const sha = (value: string | Buffer) =>
      gitBlobOID(Buffer.isBuffer(value) ? value : Buffer.from(value));
    const files = [
      {
        filename: 'src/a.ts',
        status: 'modified',
        sha: sha(newCode),
        patch: 'not used; generated from blobs',
      },
      {
        filename: 'src/new name\n.ts',
        previous_filename: 'src/old name\n.ts',
        status: 'renamed',
        sha: sha('rename content\n'),
      },
      { filename: 'binary.bin', status: 'modified', sha: sha(Buffer.from([0, 255, 1])) },
      { filename: 'added.txt', status: 'added', sha: sha('added\n') },
      { filename: 'deleted.txt', status: 'removed', sha: sha('deleted\n') },
      { filename: 'link', status: 'modified', sha: sha('/private/outside') },
      { filename: 'module', status: 'modified', sha: 'f'.repeat(40) },
      { filename: 'invalid.txt', status: 'modified', sha: sha(Buffer.from([0xc3, 0x28])) },
    ];
    if (head === ids.second) files.splice(1);
    if (state.coverage)
      while (files.length < 300)
        files.push({
          filename: `extra-${files.length}.txt`,
          status: 'modified',
          sha: '0'.repeat(40),
        });
    return { base_commit: { sha: ids.base }, merge_base_commit: { sha: ids.merge }, files };
  }
  if (path.startsWith('git/commits/')) {
    const oid = path.slice('git/commits/'.length),
      tree = (
        {
          [ids.base]: '9',
          [ids.merge]: '1',
          [ids.head]: '2',
          [ids.newer]: '3',
          [ids.second]: '4',
        } as Record<string, string>
      )[oid];
    if (!tree) throw new Error('Unexpected fixed commit.');
    return { sha: oid, tree: { sha: tree.repeat(40) } };
  }
  if (path.startsWith('git/trees/')) {
    const oid = path.slice('git/trees/'.length),
      entries = objects.trees.get(oid);
    if (!entries) throw new Error('Unexpected fixed tree.');
    return { sha: oid, truncated: !!state.truncatedTree, tree: entries };
  }
  if (path.startsWith('git/blobs/')) {
    if (state.fail === 'blob') throw new Error('fixture gh blob failure');
    const oid = path.slice('git/blobs/'.length),
      bytes = objects.blobs.get(oid);
    if (!bytes) throw new Error('Unexpected fixed blob.');
    return {
      sha: oid,
      size: bytes.length + (state.corruptBlob ? 1 : 0),
      encoding: 'base64',
      content: bytes.toString('base64'),
    };
  }
  throw new Error(`Unexpected read endpoint: ${path}`);
}
