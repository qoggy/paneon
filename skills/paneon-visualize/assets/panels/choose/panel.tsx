import { useLocale } from '../../shared/i18n';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import { agent, definePanel, usePanelInput } from '@qoggy/paneon/sdk';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  Checkbox,
  Sheet,
  SheetContent,
  SheetTitle,
  Spinner,
  Markdown,
  Page,
  RadioGroup,
  RadioGroupItem,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@qoggy/paneon/ui';
import { useSubmission } from '../../shared/submission';
import { ArrowRight, ArrowUpRight, Check, X } from '../../shared/icons';
import {
  answerSchema,
  answersSubmittedSchema,
  chooseParamsSchema,
  completeAnswersSchema,
} from './schema';
import type { ChoiceAnswer, ChooseParams } from './schema';

type Draft = {
  selectedIds: string[];
  comments: Record<string, string>;
  customSelected: boolean;
  text: string;
};
function MultipleChoiceGroup({ children, 'aria-label': label }: ComponentProps<typeof RadioGroup>) {
  return (
    <div role="group" aria-label={label} className="grid gap-2">
      {children}
    </div>
  );
}
function QuestionDirectoryItem({
  at,
  title,
  answered,
  current,
  onClick,
}: {
  at: number;
  title: string;
  answered: boolean;
  current: boolean;
  onClick: () => void;
}) {
  const { t } = useLocale();
  const titleRef = useRef<HTMLSpanElement>(null);
  const [truncated, setTruncated] = useState(false);
  function measure() {
    const element = titleRef.current;
    if (element) setTruncated(element.scrollWidth > element.clientWidth);
  }
  useLayoutEffect(() => {
    const element = titleRef.current;
    if (!element) return;
    const update = () => setTruncated(element.scrollWidth > element.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [title, current]);
  return (
    <Tooltip disabled={!truncated}>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            aria-current={current ? 'step' : undefined}
            className="grid h-auto w-full grid-cols-[1.25rem_minmax(0,1fr)_auto] items-baseline gap-2 px-2 py-2 text-left font-normal whitespace-normal text-muted-foreground hover:text-foreground aria-[current=step]:font-semibold aria-[current=step]:text-blue-600 aria-[current=step]:hover:text-blue-600 dark:aria-[current=step]:text-blue-400 dark:aria-[current=step]:hover:text-blue-400"
            style={{ backgroundColor: 'transparent' }}
            onClick={onClick}
            onTransitionEnd={measure}
          >
            <span aria-hidden="true" className="text-xs text-muted-foreground tabular-nums">
              {at + 1}
            </span>
            <span ref={titleRef} className="min-w-0 truncate">
              {title}
            </span>
            <span
              id={`directory-status-${at}`}
              className="inline-flex h-5 w-4 items-center justify-center self-start text-muted-foreground"
            >
              {answered && <Check className="size-3.5" />}
              <span className="sr-only">{t(answered ? 'Answered' : 'Unanswered')}</span>
            </span>
          </Button>
        }
      />
      {truncated && (
        <TooltipContent role="tooltip" side="right" className="max-w-sm break-words">
          {title}
        </TooltipContent>
      )}
    </Tooltip>
  );
}
function ChoosePanel() {
  const { t } = useLocale();
  const params = usePanelInput<ChooseParams>();
  const [index, setIndex] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const detailTrigger = useRef<HTMLButtonElement | null>(null);
  const detailContent = useRef<HTMLDivElement | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    params.questions.map((question) => ({
      selectedIds: question.selectedIds ?? [],
      comments: Object.fromEntries(question.options.map((option) => [option.id, ''])),
      customSelected: false,
      text: '',
    })),
  );
  const [showReviewError, setShowReviewError] = useState(false);
  const reviewError = useRef<HTMLParagraphElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const directory = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const list = directory.current;
    const current = list?.querySelector<HTMLElement>('[aria-current="step"]');
    if (list && current) {
      const bounds = list.getBoundingClientRect();
      const item = current.getBoundingClientRect();
      if (item.top < bounds.top) list.scrollTop += item.top - bounds.top;
      else if (item.bottom > bounds.bottom) list.scrollTop += item.bottom - bounds.bottom;
    }
  }, [index, reviewing]);
  const question = params.questions[index];
  const detail = question.options.find((option) => option.id === detailId);
  function changeQuestion(at: number) {
    setReviewing(false);
    setShowReviewError(false);
    setDetailId(null);
    setIndex(at);
  }
  const multiple = question.mode === 'multiple';
  const ChoiceGroup = multiple ? MultipleChoiceGroup : RadioGroup;
  const draft = drafts[index];
  const submission = useSubmission<{ answers: ChoiceAnswer[] }>(
    (value) => agent.emit('answers-submitted', completeAnswersSchema(params).parse(value)),
    { successToast: 'Submitted.' },
  );
  function update(patch: Partial<Draft>) {
    setDrafts((previous) =>
      previous.map((value, at) => (at === index ? { ...value, ...patch } : value)),
    );
    setShowReviewError(false);
  }
  function answer(at: number): ChoiceAnswer {
    const value = drafts[at];
    const item = params.questions[at];
    return {
      questionId: item.id,
      selections: [
        ...item.options
          .filter(
            (option) =>
              (item.mode === 'multiple' || !value.customSelected) &&
              value.selectedIds.includes(option.id),
          )
          .map((option) => ({
            kind: 'option' as const,
            optionId: option.id,
            comment: value.comments[option.id],
          })),
        ...(value.customSelected ? [{ kind: 'custom' as const, text: value.text }] : []),
      ],
    };
  }
  const answers = params.questions.map((_question, at) => answer(at));
  const complete = params.questions.map(
    (item, at) => answerSchema(item).safeParse(answers[at]).success,
  );
  const incompleteCount = complete.filter((valid) => !valid).length;
  function review() {
    setDetailId(null);
    setShowReviewError(false);
    setReviewing(true);
    requestAnimationFrame(() => heading.current?.focus());
  }
  function next() {
    if (index === params.questions.length - 1) review();
    else changeQuestion(index + 1);
  }
  function submit() {
    if (incompleteCount) {
      setShowReviewError(true);
      requestAnimationFrame(() => reviewError.current?.focus());
      return;
    }
    const result = completeAnswersSchema(params).parse({ answers });
    void submission.submit(result);
  }
  const detailBody = detail?.details && (
    <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-5 pt-12">
      <Markdown className="bg-transparent! text-sm! leading-relaxed! break-words [&_h1]:mt-5! [&_h1]:border-0! [&_h1]:pb-0! [&_h1]:text-base! [&_h2]:mt-5! [&_h2]:border-0! [&_h2]:pb-0! [&_h2]:text-sm! [&_h3]:text-sm! [&_h4]:text-sm! [&_h5]:text-sm! [&_h6]:text-sm! [&_pre]:max-w-full! [&_pre]:overflow-x-auto!">
        {detail.details}
      </Markdown>
    </div>
  );
  return (
    <div>
      <Page className="max-w-[56rem] space-y-6 p-[2rem_1rem] sm:py-12 md:p-[3rem_1rem]">
        <fieldset
          disabled={submission.pending}
          className="grid min-w-0 items-start gap-8 md:grid-cols-[17rem_minmax(0,1fr)]"
        >
          <nav
            aria-label={t('Question directory')}
            className="flex min-h-0 min-w-0 flex-col border-b pb-5 md:sticky md:top-12 md:max-h-[calc(100dvh-6rem)] md:border-r md:border-b-0 md:pr-6 md:pb-0"
          >
            <h2 className="mb-4 shrink-0 px-2 text-sm font-semibold">{t('Questions')}</h2>
            <ol ref={directory} className="min-h-0 space-y-1 overflow-y-auto overscroll-contain">
              {params.questions.map((item, at) => (
                <li key={item.id}>
                  <QuestionDirectoryItem
                    at={at}
                    title={item.title}
                    answered={complete[at]}
                    current={!reviewing && index === at}
                    onClick={() => {
                      changeQuestion(at);
                      requestAnimationFrame(() => heading.current?.focus());
                    }}
                  />
                </li>
              ))}
            </ol>
            <div className="mt-4 shrink-0 border-t pt-4">
              <Button
                variant="ghost"
                aria-current={reviewing ? 'step' : undefined}
                className="w-full justify-between font-normal text-muted-foreground hover:text-foreground has-[>svg]:px-2 aria-[current=step]:font-semibold aria-[current=step]:text-blue-600 aria-[current=step]:hover:text-blue-600 dark:aria-[current=step]:text-blue-400 dark:aria-[current=step]:hover:text-blue-400"
                style={{ backgroundColor: 'transparent' }}
                onClick={review}
              >
                {t('Answer summary')}
                <ArrowRight />
              </Button>
            </div>
          </nav>
          <div data-choice-content="" className="min-w-0 space-y-5">
            {!reviewing && (
              <header className="space-y-2">
                <h1
                  ref={heading}
                  tabIndex={-1}
                  className="text-lg font-semibold tracking-tight break-words"
                >
                  {question.title}
                </h1>
                {question.description && (
                  <Markdown className="space-y-2 bg-transparent! text-sm! break-words text-muted-foreground! [&_p]:my-0!">
                    {question.description}
                  </Markdown>
                )}
              </header>
            )}
            {!reviewing && (
              <ChoiceGroup
                value={
                  multiple
                    ? undefined
                    : draft.customSelected
                      ? 'custom'
                      : draft.selectedIds[0] === undefined
                        ? ''
                        : `option:${draft.selectedIds[0]}`
                }
                onValueChange={(value) =>
                  update(
                    value === 'custom'
                      ? { customSelected: true }
                      : { selectedIds: [value.slice('option:'.length)], customSelected: false },
                  )
                }
                aria-label={question.title}
                className="gap-2"
              >
                {question.options.map((option, optionIndex) => {
                  const selected =
                    (multiple || !draft.customSelected) && draft.selectedIds.includes(option.id);
                  const controlId = `choice-${index}-${optionIndex}`;
                  const labelId = `${controlId}-label`;
                  const descriptionId = `${controlId}-description`;
                  const commentId = `comment-${index}-${optionIndex}`;
                  return (
                    <Card
                      key={option.id}
                      data-choice-option={option.id}
                      data-selected={selected}
                      className="gap-0 py-0 shadow-none transition-colors hover:bg-muted/30 data-[selected=true]:border-foreground/50 data-[selected=true]:bg-muted/50"
                    >
                      <label
                        htmlFor={controlId}
                        className="flex cursor-pointer items-start gap-3 p-3"
                      >
                        {multiple ? (
                          <Checkbox
                            id={controlId}
                            aria-labelledby={labelId}
                            aria-describedby={option.description ? descriptionId : undefined}
                            className="mt-0.5"
                            checked={selected}
                            onCheckedChange={(checked) =>
                              update({
                                selectedIds:
                                  checked === true
                                    ? [...draft.selectedIds, option.id]
                                    : draft.selectedIds.filter((id) => id !== option.id),
                              })
                            }
                          />
                        ) : (
                          <RadioGroupItem
                            id={controlId}
                            aria-labelledby={labelId}
                            aria-describedby={option.description ? descriptionId : undefined}
                            className="mt-0.5"
                            value={`option:${option.id}`}
                          />
                        )}
                        <span className="min-w-0 flex-1 space-y-1 text-sm">
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span
                              id={labelId}
                              className="max-w-full min-w-0 font-medium break-words"
                            >
                              {option.label}
                            </span>
                            {option.recommended && (
                              <Badge variant="secondary" className="font-normal">
                                {t('Recommended')}
                              </Badge>
                            )}
                          </span>
                          {option.description && (
                            <span
                              id={descriptionId}
                              className="block break-words text-muted-foreground"
                            >
                              {option.description}
                            </span>
                          )}
                        </span>
                      </label>
                      {(option.details || selected) && (
                        <div className="space-y-3 pr-3 pb-3 pl-10">
                          {option.details && (
                            <Button
                              variant="link"
                              size="sm"
                              className="h-auto p-0 text-xs text-muted-foreground has-[>svg]:px-0"
                              aria-label={t(
                                detailId === option.id
                                  ? 'Close details: {label}'
                                  : 'View details: {label}',
                                { label: option.label },
                              )}
                              aria-expanded={detailId === option.id}
                              aria-controls={detailId === option.id ? 'option-details' : undefined}
                              aria-haspopup="dialog"
                              onClick={(event) => {
                                detailTrigger.current = event.currentTarget;
                                setDetailId((current) =>
                                  current === option.id ? null : option.id,
                                );
                              }}
                            >
                              {t(detailId === option.id ? 'Close details' : 'View details')}
                              {detailId === option.id ? <X /> : <ArrowUpRight />}
                            </Button>
                          )}
                          {selected && (
                            <div>
                              <label htmlFor={commentId} className="sr-only">
                                {t('Additional explanation for')} {option.label} {t('(optional)')}
                              </label>
                              <Textarea
                                id={commentId}
                                rows={1}
                                placeholder={t('Add an explanation (optional)…')}
                                className="min-h-9 resize-none bg-background text-sm"
                                value={draft.comments[option.id]}
                                onKeyDown={(event) => {
                                  if (event.key.startsWith('Arrow')) event.stopPropagation();
                                }}
                                onChange={(event) =>
                                  update({
                                    comments: {
                                      ...draft.comments,
                                      [option.id]: event.target.value,
                                    },
                                  })
                                }
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </Card>
                  );
                })}
                <div className="space-y-1.5 pt-1" data-custom-answer="">
                  <div
                    data-selected={draft.customSelected}
                    className="flex items-start gap-3 rounded-lg border px-3 transition-colors focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 data-[selected=true]:border-foreground/50 data-[selected=true]:bg-muted/50"
                  >
                    <label htmlFor={`custom-choice-${index}`} className="sr-only">
                      {t('Other')}
                    </label>
                    {multiple ? (
                      <Checkbox
                        id={`custom-choice-${index}`}
                        aria-label={t('Other')}
                        className="mt-2.5"
                        checked={draft.customSelected}
                        onCheckedChange={(checked) => update({ customSelected: checked === true })}
                      />
                    ) : (
                      <RadioGroupItem
                        id={`custom-choice-${index}`}
                        aria-label={t('Other')}
                        className="mt-2.5"
                        value="custom"
                      />
                    )}
                    <label htmlFor={`custom-answer-${index}`} className="sr-only">
                      {t('My answer')}
                    </label>
                    <Textarea
                      id={`custom-answer-${index}`}
                      rows={1}
                      placeholder={t('Write your own answer…')}
                      className="min-h-9 min-w-0 resize-none border-0 px-0 text-sm shadow-none focus-visible:ring-0 dark:bg-transparent"
                      value={draft.text}
                      onKeyDown={(event) => {
                        if (event.key.startsWith('Arrow')) event.stopPropagation();
                      }}
                      aria-describedby={
                        !draft.customSelected && draft.text
                          ? `custom-description-${index}`
                          : undefined
                      }
                      onChange={(event) =>
                        update({
                          text: event.target.value,
                          customSelected: true,
                        })
                      }
                    />
                  </div>
                  {!draft.customSelected && draft.text && (
                    <p id={`custom-description-${index}`} className="text-xs text-muted-foreground">
                      {t('Draft kept. Select Other to include it.')}
                    </p>
                  )}
                </div>
              </ChoiceGroup>
            )}
            {reviewing && showReviewError && incompleteCount > 0 && (
              <p
                ref={reviewError}
                tabIndex={-1}
                role="alert"
                className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive"
              >
                {t('Complete all answers before submitting ({count} incomplete).', {
                  count: incompleteCount,
                })}
              </p>
            )}
            {reviewing && (
              <section
                aria-label={t('Answer summary')}
                className="overflow-hidden rounded-xl border"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-4 py-3">
                  <h1 ref={heading} tabIndex={-1} className="text-lg font-semibold tracking-tight">
                    {t('Answer summary')}
                  </h1>
                  <span className="text-xs text-muted-foreground">
                    {params.questions.length - incompleteCount}
                    {' / '}
                    {params.questions.length} {t('answered')}
                  </span>
                </div>
                <ol className="divide-y">
                  {params.questions.map((item, at) => {
                    const result = answers[at];
                    const invalid = !complete[at];
                    const visibleSelections = result.selections.filter(
                      (selection) => selection.kind !== 'custom' || selection.text.trim(),
                    );
                    const statusId = `answer-status-${at}`;
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          aria-label={t('Edit answer: {question}', { question: item.title })}
                          aria-describedby={invalid ? statusId : undefined}
                          data-answer-incomplete={invalid}
                          data-answer-error={invalid && showReviewError}
                          className="flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:relative focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset data-[answer-error=true]:bg-destructive/5"
                          onClick={() => {
                            changeQuestion(at);
                            requestAnimationFrame(() => heading.current?.focus());
                          }}
                        >
                          <span
                            aria-hidden="true"
                            className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground"
                          >
                            {at + 1}
                          </span>
                          <span className="min-w-0 flex-1 space-y-1.5">
                            <span className="block text-xs leading-5 break-words text-muted-foreground">
                              {item.title}
                            </span>
                            {invalid && (
                              <span
                                id={statusId}
                                data-error={showReviewError}
                                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground data-[error=true]:text-destructive"
                              >
                                {showReviewError && (
                                  <span
                                    aria-hidden="true"
                                    className="inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-current"
                                  >
                                    !
                                  </span>
                                )}
                                <span>
                                  {t(
                                    result.selections.length
                                      ? 'Enter your own answer'
                                      : 'Not answered',
                                  )}
                                </span>
                              </span>
                            )}
                            {visibleSelections.length > 0 && (
                              <span className="block space-y-2">
                                {visibleSelections.map((selection) => (
                                  <span
                                    key={
                                      selection.kind === 'custom'
                                        ? 'custom'
                                        : `option:${selection.optionId}`
                                    }
                                    className="block text-sm break-words whitespace-pre-wrap"
                                  >
                                    {selection.kind === 'custom' ? (
                                      <span className="block font-medium">
                                        <span className="text-xs font-normal text-muted-foreground">
                                          {t('Other:')}
                                        </span>{' '}
                                        {selection.text}
                                      </span>
                                    ) : (
                                      <>
                                        <span className="block font-medium">
                                          {
                                            item.options.find(
                                              (option) => option.id === selection.optionId,
                                            )?.label
                                          }
                                        </span>
                                        {selection.comment && (
                                          <span className="mt-1 block border-l-2 pl-3 leading-relaxed text-muted-foreground">
                                            {selection.comment}
                                          </span>
                                        )}
                                      </>
                                    )}
                                  </span>
                                ))}
                              </span>
                            )}
                          </span>
                          <ArrowRight className="self-center text-muted-foreground" />
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </section>
            )}
            <div
              className="flex flex-wrap items-center justify-between gap-3"
              data-choice-actions=""
            >
              <Button
                variant="outline"
                className={index === 0 && !reviewing ? 'invisible' : undefined}
                disabled={(index === 0 && !reviewing) || submission.pending}
                onClick={() => {
                  changeQuestion(reviewing ? index : index - 1);
                  requestAnimationFrame(() => heading.current?.focus());
                }}
              >
                {t('Previous')}
              </Button>
              {reviewing ? (
                <Button
                  disabled={submission.pending}
                  aria-busy={submission.pending || undefined}
                  aria-label={t(
                    submission.hasReceipt ? 'Submit corrected answers' : 'Submit all answers',
                  )}
                  className="relative transition-colors disabled:pointer-events-auto disabled:opacity-100"
                  onClick={submit}
                >
                  <span className={submission.pending ? 'invisible grid' : 'grid'}>
                    <span
                      aria-hidden={submission.hasReceipt}
                      className={
                        submission.hasReceipt
                          ? 'invisible col-start-1 row-start-1'
                          : 'col-start-1 row-start-1'
                      }
                    >
                      {t('Submit all answers')}
                    </span>
                    <span
                      aria-hidden={!submission.hasReceipt}
                      className={
                        submission.hasReceipt
                          ? 'col-start-1 row-start-1'
                          : 'invisible col-start-1 row-start-1'
                      }
                    >
                      {t('Submit corrected answers')}
                    </span>
                  </span>
                  {submission.pending && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-0 flex items-center justify-center gap-2"
                    >
                      <Spinner aria-hidden="true" />
                      {t('Saving…')}
                    </span>
                  )}
                </Button>
              ) : (
                <Button onClick={next}>{t('Next')}</Button>
              )}
            </div>
          </div>
        </fieldset>
        {submission.message && (
          <Alert role={submission.failed ? 'alert' : 'status'}>
            <AlertTitle>{t('Submission')}</AlertTitle>
            <AlertDescription>{submission.message}</AlertDescription>
          </Alert>
        )}
      </Page>
      <Sheet
        open={!!detail}
        onOpenChange={(open) => {
          if (!open) setDetailId(null);
        }}
      >
        <SheetContent
          ref={detailContent}
          id="option-details"
          tabIndex={-1}
          aria-describedby={undefined}
          side="right"
          className="w-[min(64rem,85vw)] gap-0 overflow-hidden outline-none sm:max-w-none"
          initialFocus={detailContent}
          finalFocus={detailTrigger}
        >
          <SheetTitle className="sr-only">{detail?.label}</SheetTitle>
          {detailBody}
        </SheetContent>
      </Sheet>
    </div>
  );
}
export default definePanel({
  id: 'choose',
  requires: { paneon: '>=0.4.0 <0.5.0' },
  input: chooseParamsSchema,
  events: { 'answers-submitted': answersSubmittedSchema },
  render: ChoosePanel,
});
