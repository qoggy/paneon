import { useLocale } from '../../shared/i18n';
import { useState } from 'react';
import { z } from 'zod';
import { definePanel } from 'paneon/sdk';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from 'paneon/ui';
import {
  access,
  BRANCH_TEXT,
  deprecated,
  emptySlots,
  INTERVAL_MS,
  mapping,
  SAMPLE_COUNT,
  SOURCE_COMMIT,
  SOURCE_ROOT,
  values,
  WINDOW_MS,
} from './model';
import type { Slots } from './model';

const STORY = [
  { time: 0, pass: 1, read: false, title: '在 t=0 记录一个 PASS：空槽创建' },
  { time: 100, pass: 1, read: false, title: '到 t=100 再记一个：同一个窗口复用' },
  { time: 500, pass: 1, read: false, title: '到 t=500 记录：刚好跨到下一个窗口' },
  { time: 1500, pass: 1, read: false, title: '跳到 t=1500：没访问的槽位 2 仍然为空' },
  { time: 2000, pass: 0, read: true, title: '只读 values(2000)：start=0 的桶恰好还没过期' },
  { time: 2001, pass: 0, read: true, title: '只读 values(2001)：旧桶被过滤，但没有被清空' },
  { time: 2001, pass: 1, read: false, title: '访问并记录：槽位 0 重置到 start=2000' },
  { time: 100, pass: 1, read: false, title: '回拨到 t=100：返回独立桶，不覆盖环内的新桶' },
] as const;
const SOURCE_FILES = [
  ['base/LeapArray.java', '时间映射、currentWindow 分支、values 与过期判定'],
  ['base/WindowWrap.java', '窗口区间为左闭右开 [start, start + length)'],
  ['metric/BucketLeapArray.java', 'resetTo 后重置 MetricBucket'],
  ['data/MetricBucket.java', 'PASS 计数与 reset'],
  ['metric/ArrayMetric.java', '统计入口先访问 currentWindow 再聚合 values'],
];
function SentinelPanel() {
  const { t, message: translateMessage } = useLocale();
  const [slots, setSlots] = useState<Slots>(emptySlots);
  const [time, setTime] = useState(0);
  const [timeInput, setTimeInput] = useState('0');
  const [step, setStep] = useState(0);
  const [storyActive, setStoryActive] = useState(true);
  const [message, setMessage] = useState(
    '环为空。点击「下一步演示」观察一次完整的创建、复用、过期和重置过程。',
  );
  const [error, setError] = useState('');
  const [returned, setReturned] = useState<string>('尚未调用 currentWindow');
  const [selected, setSelected] = useState(0);
  const mapped = time >= 0 ? mapping(time) : null;
  const valid = values(slots, time);
  const total = valid.reduce((sum, bucket) => sum + bucket.pass, 0);
  function move(next: number, fromStory = false) {
    if (!fromStory) setStoryActive(false);
    setTime(next);
    setTimeInput(String(next));
    setError('');
  }
  function visit(nextTime: number, pass: number, fromStory = false) {
    if (!fromStory) setStoryActive(false);
    const result = access(slots, nextTime, pass);
    setSlots(result.slots);
    setMessage(BRANCH_TEXT[result.branch]);
    setReturned(
      result.returned
        ? `返回桶 start=${result.returned.start}，PASS=${result.returned.pass}${result.branch === 'detached' ? '（独立桶，未写回）' : '（在环内）'}`
        : '返回 null',
    );
    if (nextTime >= 0) setSelected(mapping(nextTime).index);
  }
  function reset() {
    setSlots(emptySlots());
    move(0, true);
    setStep(0);
    setStoryActive(true);
    setReturned('尚未调用 currentWindow');
    setMessage('已重置：四个槽位都为空。');
    setSelected(0);
  }
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <header className="space-y-2">
        <Badge variant="secondary">Sentinel · LeapArray</Badge>
        <h1 className="text-2xl font-semibold">时间在前进，为什么只需要 4 个槽位？</h1>
        <p>
          用一个环保存分桶统计：每桶 500ms，4 桶对应
          2000ms。槽位循环使用，桶里的起始时间决定它代表哪一段时间。
        </p>
      </header>
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={!storyActive || step === STORY.length}
              onClick={() => {
                const action = STORY[step];
                if (!action) return;
                move(action.time, true);
                if (action.read) {
                  setMessage('values 只筛选仍有效的桶，不创建、重置或清空任何槽位。');
                  setReturned('本步没有调用 currentWindow');
                } else visit(action.time, action.pass, true);
                setStep(step + 1);
              }}
            >
              {!storyActive
                ? t('Exploring freely')
                : step === STORY.length
                  ? t('Demo complete')
                  : t('Next demo step {step}/{total}', { step: step + 1, total: STORY.length })}
            </Button>
            <Button variant="outline" onClick={reset}>
              {t('Restart')}
            </Button>
          </div>
          <p>
            {!storyActive
              ? '自由探索会保留当前环；点击「重新开始」可从空环体验完整演示。'
              : (STORY[step]?.title ?? '可以用下方控件继续探索，或重新开始演示。')}
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-2">
              <Label htmlFor="sentinel-time">
                {t('Virtual time (integer ms, can go backwards)')}
              </Label>
              <Input
                id="sentinel-time"
                type="number"
                step={1}
                value={timeInput}
                onChange={(event) => setTimeInput(event.target.value)}
              />
            </div>
            <Button
              variant="outline"
              onClick={() => {
                const next = Number(timeInput);
                if (!timeInput || !Number.isSafeInteger(next) || Math.abs(next) > 1000000) {
                  setError('Please enter an integer from -1000000 to 1000000 milliseconds.');
                  return;
                }
                move(next);
                setMessage('只改变虚拟时钟。环没有被写入；下面的 values 结果按这个时间重新筛选。');
              }}
            >
              {t('Set time')}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                move(time + 100);
                setMessage('推进 100ms，尚未调用 currentWindow；环保持原样。');
              }}
            >
              +100ms
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                move(time < 0 ? 0 : mapping(time).start + WINDOW_MS);
                setMessage('到达下一窗口边界，尚未访问对应槽位。');
              }}
            >
              {t('Next window boundary')}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                move(time + INTERVAL_MS);
                setMessage('跳过一整轮时间，不自动补建中间的桶。');
              }}
            >
              +2000ms
            </Button>
          </div>
          {error && <p role="alert">{translateMessage(error)}</p>}
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => visit(time, 0)}>{t('Visit current window')}</Button>
            <Button onClick={() => visit(time, 1)}>{t('Record 1 PASS')}</Button>
          </div>
          <p className="text-sm text-muted-foreground">
            「记录」先 currentWindow(time)，再给返回桶加 1。设置/推进时间不写环；页面显示的
            values(time) 是只读筛选。ArrayMetric 的统计入口则会先访问 currentWindow，再读取 values。
          </p>
        </CardContent>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>① 时间映射到环形槽位</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p data-testid="sentinel-clock" className="text-lg font-semibold">
              t = {time} ms
            </p>
            <p className="font-mono text-sm">
              windowLength = {INTERVAL_MS} / {SAMPLE_COUNT} = {WINDOW_MS} ms
            </p>
            {mapped ? (
              <div className="space-y-1 text-sm">
                <p>
                  timeId = floor({time} / {WINDOW_MS}) = {Math.floor(time / WINDOW_MS)}
                </p>
                <p>
                  index = timeId % 4 = <strong>{mapped.index}</strong>
                </p>
                <p>
                  windowStart = t − t % 500 = <strong>{mapped.start}</strong>
                </p>
                <p>
                  当前时间属于 [{mapped.start}, {mapped.start + WINDOW_MS})
                </p>
              </div>
            ) : (
              <p>负时间在计算槽位前直接返回 null。</p>
            )}
            <svg
              viewBox="0 0 360 320"
              className="mx-auto w-full max-w-sm"
              role="img"
              aria-label="四个槽位组成的环；强调圈表示当前时间映射到的槽位"
            >
              <circle
                cx="180"
                cy="160"
                r="100"
                fill="none"
                stroke="currentColor"
                opacity="0.2"
                strokeWidth="2"
                strokeDasharray="5 5"
              />
              <text x="180" y="154" textAnchor="middle" fill="currentColor" fontSize="14">
                循环使用槽位
              </text>
              <text x="180" y="176" textAnchor="middle" fill="currentColor" fontSize="12">
                0 → 1 → 2 → 3 → 0
              </text>
              {[
                [180, 55],
                [285, 160],
                [180, 265],
                [75, 160],
              ].map(([x, y], index) => {
                const bucket = slots[index];
                const expired = bucket && deprecated(time, bucket);
                return (
                  <g key={index}>
                    <circle
                      cx={x}
                      cy={y}
                      r="46"
                      fill="var(--card)"
                      stroke={mapped?.index === index ? 'var(--primary)' : 'var(--border)'}
                      strokeWidth={mapped?.index === index ? 4 : 2}
                      opacity={expired ? 0.5 : 1}
                    />
                    <text x={x} y={y - 14} textAnchor="middle" fill="currentColor" fontSize="13">
                      槽位 {index}
                    </text>
                    <text x={x} y={y + 5} textAnchor="middle" fill="currentColor" fontSize="12">
                      {bucket ? `start ${bucket.start}` : 'null'}
                    </text>
                    <text x={x} y={y + 23} textAnchor="middle" fill="currentColor" fontSize="12">
                      {bucket ? `PASS ${bucket.pass}` : '未创建'}
                    </text>
                  </g>
                );
              })}
            </svg>
            <p className="text-xs text-muted-foreground">
              强调圈只表示时间映射，不表示已访问。淡化桶表示 values 会过滤；内容仍保存在环内。
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>② 环里存了什么，统计又用了什么？</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-md border p-3">
                <p className="text-sm">物理桶数（非 null）</p>
                <strong className="text-2xl" data-testid="stored-count">
                  {slots.filter(Boolean).length}
                </strong>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-sm">values({time}) 的 PASS 合计</p>
                <strong className="text-2xl" data-testid="pass-total">
                  {total}
                </strong>
              </div>
            </div>
            <p className="text-sm">
              有效条件：t − start ≤ 2000；源码只在 <strong>大于</strong> 2000
              时判过期。它按桶起点过滤，不是精确到每条事件的最近 2000ms 列表。
            </p>
            <div className="space-y-2">
              {slots.map((bucket, index) => (
                <button
                  type="button"
                  key={index}
                  className={`w-full rounded-md border p-3 text-left text-sm ${selected === index ? 'ring-2 ring-ring' : ''}`}
                  onClick={() => setSelected(index)}
                  aria-pressed={selected === index}
                  data-slot={index}
                >
                  <strong>槽位 {index}</strong> ·{' '}
                  {bucket
                    ? `[${bucket.start}, ${bucket.start + WINDOW_MS}) · PASS ${bucket.pass} · ${time < 0 || deprecated(time, bucket) ? 'values 不纳入' : 'values 纳入'}`
                    : 'null，尚未创建'}
                </button>
              ))}
            </div>
            <p className="text-sm" data-testid="slot-detail">
              {slots[selected]
                ? `选中槽位 ${selected}：t − start = ${time} − ${slots[selected]?.start} = ${time - (slots[selected]?.start ?? 0)}ms。${deprecated(time, slots[selected]) ? '大于 2000，过期但并未删除。' : '未大于 2000；values 不额外排除“未来桶”，回拨时间尤其要留意。'}`
                : `选中槽位 ${selected} 为空；时间跨过它不会自动创建。`}
            </p>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>③ 最近一次操作：为什么走这个分支？</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p role="status" data-testid="branch-message">
            {message}
          </p>
          <p className="font-mono text-sm" data-testid="returned-bucket">
            {returned}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {Object.entries(BRANCH_TEXT).map(([branch, text]) => (
              <p key={branch} className="rounded-md border p-3 text-sm">
                <strong>{branch}</strong>：{text}
              </p>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>公开源码与模拟边界</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p>
            来源固定到 alibaba/Sentinel commit <code className="break-all">{SOURCE_COMMIT}</code>
            。点击文件查看本页核对的实现。
          </p>
          <ul className="list-disc space-y-2 pl-5">
            {SOURCE_FILES.map(([file, description]) => (
              <li key={file}>
                <a
                  className="underline"
                  href={`${SOURCE_ROOT}/${file}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {file}
                </a>{' '}
                — {description}
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">
            这是普通 TypeScript 教学模拟，示范 LeapArray 配合 BucketLeapArray 的顺序操作和单个 PASS
            指标，不执行 Java 库，不测真实性能，也不模拟 CAS 竞争、锁等待或
            OccupiableBucketLeapArray 的预占机制。源码中的 CAS/tryLock/yield
            用于多线程协调，图上一步操作不能证明并发安全性或吞吐量。参数、故事和初始值直接写在源码，供
            agent 参考改造。
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
export default definePanel({
  id: 'sentinel-leap-array-explanation',
  requires: { paneon: '0.0.0' },
  input: z.object({}).strict(),
  render: SentinelPanel,
});
