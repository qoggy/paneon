import { useState } from 'react';
import { definePanel, z } from 'paneon/sdk';
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
  Label,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'paneon/ui';

type InstallKey = 'a' | 'b' | 'global';
type CwdKey = 'a' | 'b' | 'child' | 'empty';
type Target = { path: string; kind: 'directory' | 'symlink'; target?: string };
const OLD = '1.0.0';
const LATEST = '1.1.0';
const RECORD_PATH = '~/.paneon/skill-installations.json';
const CONTEXTS: { id: CwdKey; label: string; path: string }[] = [
  { id: 'a', label: '项目 A', path: '/work/project-a' },
  { id: 'b', label: '项目 B', path: '/work/project-b' },
  { id: 'child', label: '项目 A 的子目录', path: '/work/project-a/src' },
  { id: 'empty', label: '没有安装过的目录', path: '/work/new-project' },
];
const INSTALLS: {
  id: InstallKey;
  name: string;
  root: string;
  method: 'symlink' | 'copy';
  agents: string[];
  targets: Target[];
}[] = [
  {
    id: 'a',
    name: '项目 A',
    root: '/work/project-a',
    method: 'symlink',
    agents: ['codex', 'cursor', 'claude-code'],
    targets: [
      { path: '.agents/skills/paneon', kind: 'directory' },
      { path: '.claude/skills/paneon', kind: 'symlink', target: '.agents/skills/paneon' },
    ],
  },
  {
    id: 'b',
    name: '项目 B',
    root: '/work/project-b',
    method: 'copy',
    agents: ['codex', 'cursor', 'claude-code'],
    targets: [
      { path: '.agents/skills/paneon', kind: 'directory' },
      { path: '.claude/skills/paneon', kind: 'directory' },
    ],
  },
  {
    id: 'global',
    name: '用户级',
    root: '~',
    method: 'copy',
    agents: ['codex', 'cursor'],
    targets: [{ path: '.agents/skills/paneon', kind: 'directory' }],
  },
];
function UpdatePreview() {
  const [cwdKey, setCwdKey] = useState<CwdKey>('a');
  const [scope, setScope] = useState<'project' | 'global'>('project');
  const [versions, setVersions] = useState<Record<InstallKey, string>>({
    a: OLD,
    b: OLD,
    global: OLD,
  });
  const [cliVersion, setCliVersion] = useState(OLD);
  const [receipt, setReceipt] = useState('');
  const [showAllRecords, setShowAllRecords] = useState(false);
  const [steps, setSteps] = useState<string[]>([]);
  const cwd = CONTEXTS.find((item) => item.id === cwdKey) ?? CONTEXTS[0];
  const install = INSTALLS.find((item) =>
    scope === 'global' ? item.id === 'global' : item.id !== 'global' && item.root === cwd.path,
  );
  const key = install?.id ?? null;
  const base = scope === 'global' ? '~' : cwd.path;
  const command = `cd ${cwd.path}\npaneon update${scope === 'global' ? ' --global' : ''}`;
  const registry = {
    schemaVersion: 1,
    installations: INSTALLS.map((item) => ({
      scope: item.id === 'global' ? 'global' : 'project',
      ...(item.id === 'global' ? {} : { projectPath: item.root }),
      paneonVersion: versions[item.id],
      agents: item.agents,
      method: item.method,
      targets: item.targets,
    })),
  };
  const record = install
    ? registry.installations.find((item) =>
        scope === 'global'
          ? item.scope === 'global'
          : item.scope === 'project' && item.projectPath === cwd.path,
      )
    : null;
  function clearResult() {
    setReceipt('');
    setSteps([]);
  }
  function run() {
    const log = [
      cliVersion === LATEST
        ? `CLI ${LATEST} 已是最新；继续检查 skill。`
        : `将 CLI 从 ${cliVersion} 升级到 ${LATEST}。`,
      `读取 ${RECORD_PATH}`,
      scope === 'global'
        ? '匹配 scope=global 的记录。'
        : `匹配 scope=project 且 projectPath=${cwd.path} 的记录。`,
    ];
    setCliVersion(LATEST);
    if (!install) {
      log.push('集中记录中没有当前目录的登记项，不更新任何 skill，也不转去更新用户级。');
      setReceipt(
        cwdKey === 'child'
          ? 'CLI 检查已完成。请先 cd /work/project-a，再执行更新；这里不自动查找父目录。'
          : 'CLI 检查已完成。这个目录没有已安装的 skill；需要安装时运行 paneon init。',
      );
    } else {
      log.push(`沿用记录的 agents 和 ${install.method} 方式；不重新猜测安装目标。`);
      if (versions[install.id] === LATEST) log.push('这个范围的 skill 已是配套版本，无需改动。');
      else {
        for (const target of install.targets)
          log.push(
            target.kind === 'symlink'
              ? `保留链接 ${base}/${target.path} → ${base}/${target.target ?? ''}`
              : `删除并重建 ${base}/${target.path}，再复制当前 CLI 包内完整 skill`,
          );
        log.push(`成功后将这份记录的 paneonVersion 更新为 ${LATEST}。`);
        setVersions((previous) => ({ ...previous, [install.id]: LATEST }));
      }
      setReceipt(`本次只处理${install.name}的 skill；其他范围的副本保持原版本。`);
    }
    setSteps(log);
  }
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">更新方案演示 · 待讨论</Badge>
          <span className="text-sm text-muted-foreground">
            所有目录和版本均为模拟，不读写实际安装
          </span>
        </div>
        <h1 className="text-2xl font-semibold">记录装在哪，更新就只管选定范围</h1>
        <p className="text-sm leading-7 text-muted-foreground">
          安装记录统一保存在 ~/.paneon；项目级按 cwd
          匹配对应的项目路径，只处理选中范围。项目内只安装 skill 资源，不添加 .paneon 元数据目录。
        </p>
      </header>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>1. 从哪里执行？更新哪个范围？</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cwd">执行命令时的 cwd</Label>
              <Select
                value={cwdKey}
                onValueChange={(value) => {
                  setCwdKey(value as CwdKey);
                  clearResult();
                }}
              >
                <SelectTrigger id="cwd" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTEXTS.map((context) => (
                    <SelectItem key={context.id} value={context.id}>
                      {context.label} · {context.path}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <RadioGroup
              value={scope}
              onValueChange={(value) => {
                setScope(value as 'project' | 'global');
                clearResult();
              }}
            >
              <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
                <RadioGroupItem value="project" className="mt-1" />
                <span>
                  <strong>Project（默认）</strong>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    从集中记录中匹配 cwd，只更新这一个项目。
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
                <RadioGroupItem value="global" className="mt-1" />
                <span>
                  <strong>Global（--global）</strong>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    从同一文件中匹配 Global 记录，与 cwd 无关。
                  </span>
                </span>
              </label>
            </RadioGroup>
            <CodeBlock code={command} language="bash" />
            <p className="text-xs text-muted-foreground">
              paneon update 是未来命令建议，目前尚未实现；本期安装器仍不包含 update。
            </p>
            <Button onClick={run}>模拟执行 update</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>2. 同一份集中记录，按范围匹配</CardTitle>
            <code className="text-xs break-all text-muted-foreground">{RECORD_PATH}</code>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              当前匹配：{scope === 'global' ? 'Global' : `Project · ${cwd.path}`}
              。下面默认仅展示匹配项。
            </p>
            <Button
              variant="outline"
              size="sm"
              aria-expanded={showAllRecords}
              onClick={() => setShowAllRecords(!showAllRecords)}
            >
              {showAllRecords ? '只看本次匹配项' : '查看全部登记记录'}
            </Button>
            {showAllRecords ? (
              <CodeBlock code={JSON.stringify(registry, null, 2)} language="json" />
            ) : record ? (
              <>
                <CodeBlock code={JSON.stringify(record, null, 2)} language="json" />
                <p className="text-sm text-muted-foreground">
                  projectPath：项目绝对路径，用来匹配 cwd。agents / method /
                  targets：原安装配置。targets 中的路径相对该项目根；Global 则相对用户主目录。
                </p>
              </>
            ) : (
              <Alert>
                <AlertTitle>集中记录中没有匹配项</AlertTitle>
                <AlertDescription>
                  {cwdKey === 'child'
                    ? '已登记的是 /work/project-a；当前 cwd 是它的 src 子目录，不做父目录猜测，先回到安装目录。'
                    : '这个 cwd 尚未登记；需要新安装或重新登记时走 paneon init。'}
                  不会扫描其他项目或自动改为 Global。
                </AlertDescription>
              </Alert>
            )}
            <p className="text-xs text-muted-foreground">
              记录位置已按你的要求固定在 ~/.paneon；具体文件名和 JSON 字段仍是方案示意。切换 cwd
              只是匹配另一条记录，不会在项目内创建元数据文件。
            </p>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>3. 看看哪些真的变了</CardTitle>
          <p className="text-sm text-muted-foreground">
            CLI 程序只有当前演示中的一份；项目 A、B 和用户级 skill 是三份各自安装的资源。
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>CLI {cliVersion}</Badge>
            <span className="text-sm text-muted-foreground">模拟可用版本：{LATEST}</span>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {INSTALLS.map((item) => (
              <div
                key={item.id}
                className={`space-y-2 rounded-md border p-4 ${key === item.id ? 'border-primary bg-muted/40' : ''}`}
                data-testid={`installation-${item.id}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>{item.name}</strong>
                  {key === item.id && <Badge variant="secondary">本次范围</Badge>}
                </div>
                <code className="block text-xs break-all">{item.root}</code>
                <p className="text-sm">
                  Skill <span data-testid={`version-${item.id}`}>{versions[item.id]}</span> ·{' '}
                  {item.method}
                </p>
                <p className="text-xs text-muted-foreground">{item.agents.join(', ')}</p>
              </div>
            ))}
          </div>
          {steps.length > 0 && (
            <div className="space-y-3 rounded-md border p-4">
              <ol className="list-decimal space-y-2 pl-5 text-sm leading-6">
                {steps.map((text, index) => (
                  <li key={index} className="break-words">
                    {text}
                  </li>
                ))}
              </ol>
              <p role="status" className="text-sm font-medium">
                {receipt}
              </p>
            </div>
          )}
          <Button
            variant="outline"
            onClick={() => {
              setVersions({ a: OLD, b: OLD, global: OLD });
              setCliVersion(OLD);
              clearResult();
            }}
          >
            重置模拟版本
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>普通目录与链接，更新动作不同</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-7">
          <p>
            <strong>Symlink 模式：</strong>删除并重建
            .agents/skills/paneon，复制新版全部内容；.claude/skills/paneon
            已经指向它时保留链接。链接缺失或目标改变时才修复。
          </p>
          <p>
            <strong>Copy 模式：</strong>分别清理
            .agents/skills/paneon、.claude/skills/paneon，再各复制一份新版，确保新版删除的旧文件不残留。
          </p>
          <p className="text-muted-foreground">
            清理仅限每个 paneon 目录，不删除整个 skills 目录或其他
            skill。普通目录按实际路径去重；已存在的正确链接不会被当作普通目录清理。同步成功后才改安装记录。
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>这套建议解决什么？</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-5 text-sm leading-7 md:grid-cols-2">
          <div className="space-y-2">
            <strong>保存原安装方式，不靠猜</strong>
            <p className="text-muted-foreground">
              A 原来用 Symlink，更新时只刷新中央内容并维持链接。B 原来用
              Copy，就逐份刷新目录。不会因为这次机器检测到了另一个 agent，就给它额外安装。
            </p>
          </div>
          <div className="space-y-2">
            <strong>项目各管各的，不全盘扫描</strong>
            <p className="text-muted-foreground">
              在 A 更新不动 B 或用户级；到 B 再执行一次时，即使 CLI 已是最新，也继续同步 B 的
              skill。集中记录保存了项目绝对路径；项目搬家后需要在新位置运行 init
              重新登记，不自动追踪或扫描。
            </p>
          </div>
          <div className="space-y-2">
            <strong>全局副本也走同一规则</strong>
            <p className="text-muted-foreground">
              显式 --global 后，从同一份集中文件中选择 Global
              条目；其目标路径以用户主目录为基准，不顺便更新当前项目。
            </p>
          </div>
          <div className="space-y-2">
            <strong>和参考实现的关系</strong>
            <p className="text-muted-foreground">
              Vercel 的项目锁文件记录来源和摘要，更新会复用 add；普通 agent
              并未完整记录原来的列表和方式。本页提出保存这些配置以便复用，是 Paneon
              的待讨论补充，不把它说成参考项目已经具备。
            </p>
          </div>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        本页只演示范围和记录；真实安装仍沿用已经采纳的汇总与覆盖确认。当前没有执行 CLI
        升级、创建目录、复制资源、修改链接或写入安装记录。
      </p>
    </main>
  );
}
export default definePanel({
  id: 'skill-update-proposal',
  requires: { paneon: '0.0.0' },
  input: z.object({}).strict(),
  events: {},
  render: UpdatePreview,
});
