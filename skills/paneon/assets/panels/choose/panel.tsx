import { useLocale } from '../../shared/i18n';
import { useRef, useState } from 'react';
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
  Markdown,
  RadioGroup,
  RadioGroupItem,
  Textarea,
} from '@qoggy/paneon/ui';
import { useSubmission } from '../../shared/submission';
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
  const [hasReviewed, setHasReviewed] = useState(false);
  const reviewError = useRef<HTMLParagraphElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
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
  const submission = useSubmission<{ answers: ChoiceAnswer[] }>((value) =>
    agent.emit('answers-submitted', completeAnswersSchema(params).parse(value)),
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
    setHasReviewed(true);
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
      <Markdown className="text-sm! leading-relaxed! break-words [&_h1]:mt-5! [&_h1]:border-0! [&_h1]:pb-0! [&_h1]:text-base! [&_h2]:mt-5! [&_h2]:border-0! [&_h2]:pb-0! [&_h2]:text-sm! [&_h3]:text-sm! [&_h4]:text-sm! [&_h5]:text-sm! [&_h6]:text-sm! [&_pre]:max-w-full! [&_pre]:overflow-x-auto!">
        {detail.details}
      </Markdown>
    </div>
  );
  return (
    <div>
      <main className="mx-auto w-full max-w-xl space-y-6 px-4 py-8 sm:py-12">
        <fieldset disabled={submission.pending} className="min-w-0 space-y-5">
          <header className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <h1 className="max-w-full font-medium break-words">{params.title}</h1>
              </div>
              {!reviewing && (
                <p aria-live="polite" className="ml-auto shrink-0 whitespace-nowrap tabular-nums">
                  {index + 1} / {params.questions.length}
                </p>
              )}
            </div>
            {params.description && (
              <div aria-label={t('Questionnaire description')}>
                <Markdown className="text-sm! leading-relaxed! break-words text-muted-foreground! [&_h1]:text-base! [&_h2]:text-sm! [&_h3]:text-sm! [&_h4]:text-sm! [&_h5]:text-sm! [&_h6]:text-sm! [&_p]:my-2! [&_pre]:max-w-full! [&_pre]:overflow-x-auto!">
                  {params.description}
                </Markdown>
              </div>
            )}
            <h2
              ref={heading}
              tabIndex={-1}
              className="text-lg font-semibold tracking-tight break-words"
            >
              {reviewing ? t('Review all answers') : question.title}
            </h2>
            {!reviewing && question.description && (
              <Markdown className="space-y-2 text-sm! break-words text-muted-foreground! [&_p]:my-0!">
                {question.description}
              </Markdown>
            )}
          </header>
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
                          <span id={labelId} className="max-w-full min-w-0 font-medium break-words">
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
                            className="h-auto p-0 text-xs text-muted-foreground"
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
                              setDetailId((current) => (current === option.id ? null : option.id));
                            }}
                          >
                            {t(detailId === option.id ? 'Close details' : 'View details')}
                            <span aria-hidden="true">{detailId === option.id ? ' ×' : ' ↗'}</span>
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
                    className="min-h-9 min-w-0 resize-none border-0 px-0 text-sm shadow-none focus-visible:ring-0"
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
                        ...(event.target.value.trim() ? { customSelected: true } : {}),
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
            <section aria-label={t('Answer summary')} className="overflow-hidden rounded-xl border">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-4 py-3">
                <h3 className="text-sm font-medium">{t('Answers')}</h3>
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
                        className="flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:relative focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset data-[answer-incomplete=true]:bg-destructive/5"
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
                              className="flex items-center gap-1.5 text-xs font-medium text-destructive"
                            >
                              <span
                                aria-hidden="true"
                                className="inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-current"
                              >
                                !
                              </span>
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
                        <span aria-hidden="true" className="self-center text-muted-foreground">
                          →
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </section>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3" data-choice-actions="">
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
            {!reviewing && hasReviewed && (
              <Button variant="ghost" onClick={review}>
                {t('Return to summary')}
              </Button>
            )}
            {reviewing ? (
              <Button disabled={submission.pending} onClick={submit}>
                {submission.pending
                  ? t('Saving…')
                  : submission.hasReceipt
                    ? t('Submit corrected answers')
                    : t('Submit all answers')}
              </Button>
            ) : (
              <Button onClick={next}>{t('Next')}</Button>
            )}
          </div>
        </fieldset>
        {submission.message && (
          <Alert role={submission.failed ? 'alert' : 'status'}>
            <AlertTitle>{t('Submission')}</AlertTitle>
            <AlertDescription>{submission.message}</AlertDescription>
          </Alert>
        )}
      </main>
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
  requires: { paneon: '>=0.0.1 <0.1.0' },
  input: chooseParamsSchema,
  events: { 'answers-submitted': answersSubmittedSchema },
  render: ChoosePanel,
});
