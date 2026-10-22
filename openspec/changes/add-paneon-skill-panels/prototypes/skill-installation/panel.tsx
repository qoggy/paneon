import { useState } from 'react';
import { definePanel, z } from 'paneon/sdk';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  CodeBlock,
  RadioGroup,
  RadioGroupItem,
} from 'paneon/ui';

// Prompt order and English copy follow vercel-labs/skills src/add.ts at a80e4c9.
// The three displayed agents are a subset of its registry, not the final Paneon list.
const PROJECT = '/work/my-project';
const UNIVERSAL = ['Codex', 'Cursor'];
const SOURCE =
  'https://github.com/vercel-labs/skills/blob/a80e4c9d12d607631249d4d7d059f835d4b2f13a/src/add.ts';
type Step = 'agents' | 'scope' | 'method' | 'summary';
function InstallationPreview() {
  const [claude, setClaude] = useState(false);
  const [global, setGlobal] = useState(false);
  const [method, setMethod] = useState<'symlink' | 'copy'>('symlink');
  const [step, setStep] = useState<Step>('agents');
  const [exists, setExists] = useState(false);
  const [confirm, setConfirm] = useState('yes');
  const [result, setResult] = useState<'installed' | 'cancelled' | null>(null);
  const steps: Step[] = claude
    ? ['agents', 'scope', 'method', 'summary']
    : ['agents', 'scope', 'summary'];
  const index = steps.indexOf(step);
  const effectiveMethod = claude ? method : 'copy';
  const root = global ? '~' : PROJECT;
  const canonical = `${root}/.agents/skills/paneon`;
  const claudePath = `${root}/.claude/skills/paneon`;
  const names = [...UNIVERSAL, ...(claude ? ['Claude Code'] : [])];
  const titles: Record<Step, string> = {
    agents: 'Which agents do you want to install to?',
    scope: 'Installation scope',
    method: 'Installation method',
    summary: 'Installation Summary',
  };
  const summary = [
    canonical,
    ...(effectiveMethod === 'symlink'
      ? [`  universal: ${UNIVERSAL.join(', ')}`, '  symlink → Claude Code']
      : [`  copy → ${names.join(', ')}`]),
    ...(exists ? [`  overwrites: ${names.join(', ')}`] : []),
  ].join('\n');
  const terminal = result
    ? `$ paneon init\n\n${summary}\n\n${result === 'installed' ? 'Installation complete' : 'Installation cancelled'}`
    : `$ paneon init\n\n${titles[step]}\n\n` +
      (step === 'agents'
        ? `Universal\n  [■] Codex\n  [■] Cursor\n\n  [${claude ? '■' : ' '}] Claude Code\n\nSpace to toggle, Enter to continue`
        : step === 'scope'
          ? `${!global ? '●' : '○'} Project\n  Install in current directory (committed with your project)\n${global ? '●' : '○'} Global\n  Install in home directory (available across all projects)`
          : step === 'method'
            ? `${method === 'symlink' ? '●' : '○'} Symlink (Recommended)\n  Single source of truth, easy updates\n${method === 'copy' ? '●' : '○'} Copy to all agents\n  Independent copies for each agent`
            : `${summary}\n\nProceed with installation?\n${confirm === 'yes' ? '●' : '○'} Yes / ${confirm === 'no' ? '●' : '○'} No`);
  const command = `paneon init --agent codex cursor${claude ? ' claude-code' : ''}${global ? ' --global' : ''}${effectiveMethod === 'copy' ? ' --copy' : ''} --yes --json`;
  function restart() {
    setStep('agents');
    setResult(null);
    setConfirm('yes');
  }
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">流程演示</Badge>
          <span className="text-sm text-muted-foreground">参考 Vercel Skills · 不实际写入文件</span>
        </div>
        <h1 className="text-2xl font-semibold">Paneon skill 安装</h1>
        <p className="text-sm text-muted-foreground">
          沿用已有流程和英文提示：选择 agent → 安装范围 → 安装方式 → 确认。默认
          Project；多个不同目录时才询问安装方式。
        </p>
      </header>
      <div className="grid min-w-0 grid-cols-1 items-start gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              {result
                ? result === 'installed'
                  ? 'Installation complete'
                  : 'Installation cancelled'
                : titles[step]}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {result ? '演示结果，没有执行实际安装。' : `Step ${index + 1} / ${steps.length}`}
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            {result ? (
              <>
                <p className="text-sm">
                  {result === 'installed' ? '已模拟确认安装。' : '已模拟取消安装。'}
                </p>
                <Button onClick={restart}>重新体验</Button>
              </>
            ) : (
              <>
                {step === 'agents' && (
                  <>
                    <div className="space-y-3 rounded-md border p-4">
                      <strong className="text-sm">Universal</strong>
                      {UNIVERSAL.map((name) => (
                        <label key={name} className="flex items-center gap-3">
                          <Checkbox checked disabled aria-label={name} />
                          <span>{name}</span>
                        </label>
                      ))}
                      <code className="text-xs text-muted-foreground">.agents/skills</code>
                    </div>
                    <label className="flex cursor-pointer items-center gap-3 rounded-md border p-4">
                      <Checkbox
                        aria-label="Claude Code"
                        checked={claude}
                        onCheckedChange={(checked) => setClaude(checked === true)}
                      />
                      <span>Claude Code</span>
                      <code className="ml-auto text-xs text-muted-foreground">.claude/skills</code>
                    </label>
                    <p className="text-sm text-muted-foreground">
                      参考实现将 Universal 目标固定选中。这里仅列三个 agent 作为演示；选中 Claude
                      Code 可以体验多个目录时的安装方式选择。
                    </p>
                  </>
                )}
                {step === 'scope' && (
                  <>
                    <RadioGroup
                      value={global ? 'global' : 'project'}
                      onValueChange={(value) => setGlobal(value === 'global')}
                    >
                      <label className="flex cursor-pointer items-start gap-3 rounded-md border p-4">
                        <RadioGroupItem value="project" className="mt-1" />
                        <span>
                          <strong>Project</strong>
                          <span className="mt-1 block text-sm text-muted-foreground">
                            Install in current directory (committed with your project)
                          </span>
                        </span>
                      </label>
                      <label className="flex cursor-pointer items-start gap-3 rounded-md border p-4">
                        <RadioGroupItem value="global" className="mt-1" />
                        <span>
                          <strong>Global</strong>
                          <span className="mt-1 block text-sm text-muted-foreground">
                            Install in home directory (available across all projects)
                          </span>
                        </span>
                      </label>
                    </RadioGroup>
                    <p className="text-xs text-muted-foreground">演示当前目录：{PROJECT}</p>
                  </>
                )}
                {step === 'method' && (
                  <RadioGroup
                    value={method}
                    onValueChange={(value) => setMethod(value as 'symlink' | 'copy')}
                  >
                    <label className="flex cursor-pointer items-start gap-3 rounded-md border p-4">
                      <RadioGroupItem value="symlink" className="mt-1" />
                      <span>
                        <strong>Symlink (Recommended)</strong>
                        <span className="mt-1 block text-sm text-muted-foreground">
                          Single source of truth, easy updates
                        </span>
                      </span>
                    </label>
                    <label className="flex cursor-pointer items-start gap-3 rounded-md border p-4">
                      <RadioGroupItem value="copy" className="mt-1" />
                      <span>
                        <strong>Copy to all agents</strong>
                        <span className="mt-1 block text-sm text-muted-foreground">
                          Independent copies for each agent
                        </span>
                      </span>
                    </label>
                  </RadioGroup>
                )}
                {step === 'summary' && (
                  <>
                    <div className="space-y-3 rounded-md border p-4">
                      <code className="block text-xs break-all">{canonical}</code>
                      {claude && (
                        <p className="text-xs break-all">
                          {effectiveMethod === 'symlink'
                            ? `${claudePath} → ${canonical}`
                            : claudePath}
                        </p>
                      )}
                      <p className="text-sm">
                        {effectiveMethod === 'symlink'
                          ? '包内 skill 复制到中央目录，其他目标链接到这里。'
                          : '包内 skill 完整复制到各目标目录；相同路径只写一次。'}
                      </p>
                      {exists && (
                        <p className="text-sm font-medium">overwrites: {names.join(', ')}</p>
                      )}
                    </div>
                    <label className="flex cursor-pointer items-center gap-3 text-sm">
                      <Checkbox
                        aria-label="演示已有安装"
                        checked={exists}
                        onCheckedChange={(checked) => setExists(checked === true)}
                      />
                      <span>演示条件：目标目录已有安装</span>
                    </label>
                    <div className="space-y-3">
                      <p className="font-medium">Proceed with installation?</p>
                      <RadioGroup className="flex gap-6" value={confirm} onValueChange={setConfirm}>
                        <label className="flex items-center gap-2">
                          <RadioGroupItem value="yes" />
                          Yes
                        </label>
                        <label className="flex items-center gap-2">
                          <RadioGroupItem value="no" />
                          No
                        </label>
                      </RadioGroup>
                    </div>
                    {exists && (
                      <p className="text-sm text-muted-foreground">
                        沿用参考实现：在汇总中标明覆盖目标，由这次确认授权覆盖；不增加备份、自动合并或内容冲突分类。
                      </p>
                    )}
                  </>
                )}
                <div className="flex flex-wrap gap-2 border-t pt-4">
                  <Button
                    variant="outline"
                    disabled={index === 0}
                    onClick={() => setStep(steps[index - 1] ?? 'agents')}
                  >
                    Back
                  </Button>
                  <Button
                    onClick={() => {
                      if (step === 'summary')
                        setResult(confirm === 'yes' ? 'installed' : 'cancelled');
                      else setStep(steps[index + 1] ?? 'summary');
                    }}
                  >
                    {step === 'summary' ? 'Continue' : 'Next'}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>终端预览</CardTitle>
            </CardHeader>
            <CardContent>
              <pre
                aria-label="终端模拟"
                className="overflow-x-auto rounded-md border bg-muted/50 p-4 text-xs leading-6 break-words whitespace-pre-wrap"
              >
                {terminal}
              </pre>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>非交互调用</CardTitle>
              <p className="text-sm text-muted-foreground">
                拟定命令，安装器尚未实现。项目级使用当前工作目录。
              </p>
            </CardHeader>
            <CardContent>
              <CodeBlock code={command} language="bash" />
            </CardContent>
          </Card>
        </div>
      </div>
      <p className="text-sm leading-7 text-muted-foreground">
        英文提示和顺序参考{' '}
        <a className="underline" href={SOURCE} target="_blank" rel="noreferrer">
          Vercel Skills 的固定版本源码
        </a>
        。Paneon 只安装包内一份
        skill，省去远程来源和技能挑选；本页用网页控件展示终端选择，检测和目标名单也只做演示。链接目标使用稳定中央副本，不指向
        npm / npx 缓存。未来 update 不在本期范围。
      </p>
    </main>
  );
}
export default definePanel({
  id: 'skill-installation-proposal',
  requires: { paneon: '0.0.0' },
  input: z.object({}).strict(),
  events: {},
  render: InstallationPreview,
});
