import { useLocale } from '../../shared/i18n';
import { useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import { agent, definePanel, feedbackSchema } from 'paneon/sdk';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  FeedbackSurface,
  FeedbackToolbar,
  FeedbackProvider,
  FeedbackTarget,
  FeedbackText,
  Input,
  Label,
  useFeedback,
} from 'paneon/ui';
import { schedule, simulationText, TASKS, taskState } from './model';
import type { SimulationRef } from './model';

const INITIAL_CONCURRENCY = 2;
const refSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('task'),
      taskId: z.enum(['a', 'b', 'c', 'd']),
      concurrency: z.number().int().min(1).max(4),
      atMs: z.number().int().min(0).max(10000),
    })
    .strict(),
  z.object({ kind: z.literal('summary'), concurrency: z.number().int().min(1).max(4) }).strict(),
]);
const eventSchema = feedbackSchema(refSchema);
function Timeline({ concurrency, atMs }: { concurrency: number; atMs: number }) {
  const tasks = schedule(concurrency);
  const summary: SimulationRef = { kind: 'summary', concurrency };
  return (
    <Card data-timeline={concurrency}>
      <CardHeader>
        <CardTitle>
          {concurrency === 1 ? '串行基准' : '当前排程'} · 并发 {concurrency}
        </CardTitle>
        <FeedbackTarget target={summary}>
          <FeedbackText target={summary} text={simulationText(summary)} />
        </FeedbackTarget>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative flex justify-between border-b pb-2 text-xs text-muted-foreground">
          {[0, 2, 4, 6, 8, 10].map((second) => (
            <span key={second}>{second}s</span>
          ))}
        </div>
        {tasks.map((task) => {
          const ref: SimulationRef = { kind: 'task', taskId: task.id, concurrency, atMs };
          return (
            <FeedbackTarget key={task.id} target={ref}>
              <div className="space-y-2" data-task={task.id}>
                <div className="flex items-center justify-between">
                  <strong>
                    {task.label} · {task.durationMs / 1000} 秒
                  </strong>
                  <Badge variant={taskState(task, atMs) === '执行中' ? 'default' : 'secondary'}>
                    {taskState(task, atMs)}
                  </Badge>
                </div>
                <div
                  className="relative h-7 overflow-hidden rounded border bg-muted"
                  aria-label={`${task.label} 时间线`}
                >
                  {task.waitMs > 0 && (
                    <div
                      className="absolute h-full border-r border-dashed bg-muted-foreground/15"
                      style={{ width: `${task.waitMs / 100}%` }}
                    />
                  )}
                  <div
                    className="absolute h-full rounded bg-primary/75"
                    style={{ left: `${task.startMs / 100}%`, width: `${task.durationMs / 100}%` }}
                  />
                  <div
                    className="absolute top-0 h-full border-l-2 border-foreground"
                    style={{ left: `${Math.min(atMs, 9980) / 100}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  <FeedbackText target={ref} text={simulationText(ref)} />
                </p>
              </div>
            </FeedbackTarget>
          );
        })}
        <p className="text-xs text-muted-foreground">
          浅灰段：等待；实色段：执行；竖线：当前虚拟时间。两张图都使用 0–10 秒刻度。
        </p>
      </CardContent>
    </Card>
  );
}
function Playback({
  concurrency,
  setConcurrency,
  atMs,
  setAtMs,
}: {
  concurrency: number;
  setConcurrency: (value: number) => void;
  atMs: number;
  setAtMs: React.Dispatch<React.SetStateAction<number>>;
}) {
  const { t, message: translateMessage } = useLocale();
  const feedback = useFeedback<SimulationRef>();
  const [playing, setPlaying] = useState(false);
  const [input, setInput] = useState(String(concurrency));
  const [error, setError] = useState('');
  const moving = playing && feedback.mode === 'browse' && atMs < 10000;
  useEffect(() => {
    if (feedback.mode === 'select') setPlaying(false);
  }, [feedback.mode]);
  useEffect(() => {
    if (!moving) return;
    const timer = window.setInterval(() => setAtMs((value) => Math.min(10000, value + 100)), 100);
    return () => window.clearInterval(timer);
  }, [moving, setAtMs]);
  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-2">
          <Label htmlFor="concurrency">{t('Concurrency limit (1\u20134)')}</Label>
          <Input
            id="concurrency"
            type="number"
            min={1}
            max={4}
            step={1}
            value={input}
            onChange={(event) => {
              const next = event.target.value;
              setInput(next);
              const value = Number(next);
              if (!next || !Number.isInteger(value) || value < 1 || value > 4) {
                setError('Please enter an integer from 1 to 4; the current schedule is unchanged.');
                return;
              }
              setError('');
              setConcurrency(value);
              setAtMs(0);
              setPlaying(false);
            }}
          />
        </div>
        <Button
          disabled={feedback.mode === 'select'}
          onClick={() => {
            if (atMs >= 10000) setAtMs(0);
            setPlaying(!moving);
          }}
        >
          {moving ? t('Pause') : t('Play')}
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setAtMs(0);
            setPlaying(false);
          }}
        >
          {t('Replay')}
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            setPlaying(false);
            setAtMs((value) => Math.min(10000, value + 1000));
          }}
        >
          {t('Advance 1 second')}
        </Button>
        <strong data-testid="clock">虚拟时间 {(atMs / 1000).toFixed(1)} 秒</strong>
      </div>
      {error && <p role="alert">{translateMessage(error)}</p>}
      <p className="text-sm text-muted-foreground">
        切换并发会重新排程并回到 0 秒。为便于对照，播放至串行结束的 10
        秒；进入选择模式会停住时钟。重播回到开头后点击播放。
      </p>
      <div className="grid gap-6 lg:grid-cols-2">
        <Timeline concurrency={1} atMs={atMs} />
        <Timeline concurrency={concurrency} atMs={atMs} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>为什么继续增加并发也会停止变快？</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p>
            四个任务共需 10 秒工作量，但 A 自己就要 4 秒。并发从 2 提到 3，整批从 5 秒变为 4
            秒；再提到 4，A 仍需跑满 4 秒。
          </p>
          <p>
            所有任务在 t=0 按 A、B、C、D
            同时排队，FIFO、非抢占；同一时刻先统一释放完成任务，再依次启动新任务。
          </p>
          <p className="text-sm text-muted-foreground">
            教学前提：任务时长固定，没有共享资源争用。这是确定性的虚拟排程，不能用作真实系统提速估计。
          </p>
        </CardContent>
      </Card>
    </>
  );
}
function ConcurrencyPanel() {
  const { t } = useLocale();
  const [concurrency, setConcurrency] = useState(INITIAL_CONCURRENCY);
  const [atMs, setAtMs] = useState(0);
  const [receipt, setReceipt] = useState<number>();
  const adapter = useMemo(
    () => ({
      resolve(target: {
        ref: SimulationRef;
        text?: { start: number; end: number; quote: string };
      }) {
        try {
          const text = simulationText(target.ref);
          return { status: 'ready' as const, text };
        } catch {
          return { status: 'missing' as const, message: '无法识别这个模拟情境。' };
        }
      },
      locate(target: { ref: SimulationRef }) {
        setConcurrency(target.ref.concurrency);
        setAtMs(target.ref.kind === 'task' ? target.ref.atMs : 0);
      },
    }),
    [],
  );
  return (
    <FeedbackProvider<SimulationRef>
      adapter={adapter}
      onSubmit={async (value) => {
        if (!value.annotations.length && !value.comment?.trim())
          throw new Error('请先选择关注的位置或填写整体疑问。');
        const result = await agent.emit('explanation-feedback', eventSchema.parse(value));
        setReceipt(result.id);
      }}
    >
      <main className="mx-auto max-w-6xl space-y-6 p-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold">同时跑几个任务，会怎样影响完成时间？</h1>
          <p>任务 A 4 秒、B 2 秒、C 3 秒、D 1 秒。观察谁在等待，谁得到空闲槽位。</p>
        </header>
        <FeedbackSurface />
        <FeedbackToolbar />
        <p className="text-sm text-muted-foreground">
          暂停后划选文字或选择任务来评论，评论会保留当时的并发数和虚拟时间。
        </p>
        <Playback
          key={concurrency}
          concurrency={concurrency}
          setConcurrency={setConcurrency}
          atMs={atMs}
          setAtMs={setAtMs}
        />
        {receipt && (
          <p role="status">
            {t(
              'Saved to the AI as event {id}. Resume the conversation to read it; this page does not wake the AI automatically.',
              { id: receipt },
            )}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          固定任务：{TASKS.map((task) => task.label).join('、')}
          。标题、数据和初始并发直接定义在示例源码，供 agent 复制修改。
        </p>
      </main>
    </FeedbackProvider>
  );
}
export default definePanel({
  id: 'concurrency-explanation',
  requires: { paneon: '0.0.0' },
  input: z.object({}).strict(),
  events: { 'explanation-feedback': eventSchema },
  render: ConcurrencyPanel,
});
