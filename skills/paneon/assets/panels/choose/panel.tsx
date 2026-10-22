import { useLocale } from '../../shared/i18n';
import { useRef, useState, useSyncExternalStore } from 'react';
import type { ComponentProps } from 'react';
import { agent, definePanel, usePanelInput } from 'paneon/sdk';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  Checkbox,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Markdown,
  Popover,
  PopoverContent,
  PopoverTrigger,
  RadioGroup,
  RadioGroupItem,
  Textarea,
} from 'paneon/ui';
import { useSubmission } from '../../shared/submission';
import {
  answerSchema,
  answersSubmittedSchema,
  chooseParamsSchema,
  completeAnswersSchema,
} from './schema';
import type { ChoiceAnswer, ChooseParams } from './schema';

const detailMediaQuery = '(min-width: 1024px)';
function subscribeDetailViewport(onChange: () => void) {
  const media = window.matchMedia(detailMediaQuery);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}
function isWideViewport() {
  return window.matchMedia(detailMediaQuery).matches;
}

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
  const { t, message } = useLocale();
  const params = usePanelInput<ChooseParams>();
  const [index, setIndex] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const detailTrigger = useRef<HTMLButtonElement | null>(null);
  const wide = useSyncExternalStore(subscribeDetailViewport, isWideViewport, () => false);
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    params.questions.map((question) => ({
      selectedIds: question.selectedIds ?? [],
      comments: Object.fromEntries(question.options.map((option) => [option.id, ''])),
      customSelected: false,
      text: '',
    })),
  );
  const [error, setError] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const question = params.questions[index];
  const detail = question.options.find((option) => option.id === detailId);
  function changeQuestion(at: number) {
    setReviewing(false);
    setError('');
    setDetailId(null);
    setIndex(at);
  }
  function closeDetails() {
    setDetailId(null);
    detailTrigger.current?.focus();
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
    setError('');
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
  function validate(at: number) {
    const value = answer(at);
    const parsed = answerSchema(params.questions[at]).safeParse(value);
    if (!parsed.success) {
      changeQuestion(at);
      setError(
        drafts[at].customSelected && !drafts[at].text.trim()
          ? params.questions[at].mode === 'multiple'
            ? 'Enter your own answer or deselect Other.'
            : 'Enter your own answer or select a different answer.'
          : value.selections.length === 0
            ? 'Select an option or enter your own answer.'
            : 'Check your answer before continuing.',
      );
      requestAnimationFrame(() => heading.current?.focus());
    }
    return parsed.success;
  }
  function next() {
    if (index === params.questions.length - 1) {
      setDetailId(null);
      setError('');
      setReviewing(true);
      requestAnimationFrame(() => heading.current?.focus());
    } else {
      changeQuestion(index + 1);
    }
  }
  function submit() {
    for (let at = 0; at < params.questions.length; at++) if (!validate(at)) return;
    const result = completeAnswersSchema(params).parse({
      answers: params.questions.map((_question, at) => answer(at)),
    });
    void submission.submit(result);
  }
  const detailBody = detail?.details && (
    <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-5">
      <Markdown className="text-sm! leading-relaxed! break-words [&_h1]:mt-5! [&_h1]:border-0! [&_h1]:pb-0! [&_h1]:text-base! [&_h2]:mt-5! [&_h2]:border-0! [&_h2]:pb-0! [&_h2]:text-sm! [&_h3]:text-sm! [&_h4]:text-sm! [&_h5]:text-sm! [&_h6]:text-sm! [&_pre]:max-w-full! [&_pre]:overflow-x-auto!">
        {detail.details}
      </Markdown>
    </div>
  );
  return (
    <div
      className={
        detail && wide
          ? 'mx-auto grid w-full max-w-6xl items-start gap-8 px-4 lg:grid-cols-[minmax(0,36rem)_minmax(0,1fr)]'
          : undefined
      }
      onKeyDown={(event) => {
        if (wide && detail && event.key === 'Escape' && !event.defaultPrevented) {
          event.preventDefault();
          closeDetails();
        }
      }}
    >
      <main className="mx-auto w-full max-w-xl space-y-6 px-4 py-8 sm:py-12">
        <fieldset disabled={submission.pending} className="min-w-0 space-y-5">
          <header className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <h1 className="max-w-full font-medium break-words">{params.title}</h1>
                {params.description && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto shrink-0 p-0 text-xs text-muted-foreground underline underline-offset-4"
                      >
                        {t('Description')}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      aria-label={t('Questionnaire description')}
                      className="max-h-[var(--radix-popover-content-available-height)] max-w-[calc(100vw-2rem)] overflow-y-auto"
                    >
                      <Markdown className="text-sm! leading-relaxed! break-words [&_h1]:text-base! [&_h2]:text-sm! [&_h3]:text-sm! [&_h4]:text-sm! [&_h5]:text-sm! [&_h6]:text-sm! [&_p]:my-2! [&_pre]:max-w-full! [&_pre]:overflow-x-auto!">
                        {params.description}
                      </Markdown>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
              <p aria-live="polite" className="ml-auto shrink-0 whitespace-nowrap tabular-nums">
                {reviewing
                  ? t('Answer summary')
                  : `${multiple ? t('Multiple choice') : t('Single choice')} · ${index + 1} / ${params.questions.length}`}
              </p>
            </div>
            <h2
              ref={heading}
              tabIndex={-1}
              className="text-lg font-semibold tracking-tight break-words"
            >
              {reviewing ? t('Review all answers') : question.title}
            </h2>
            {reviewing ? (
              <p className="text-sm text-muted-foreground">
                {t('Check your answers before submitting.')}
              </p>
            ) : (
              question.description && (
                <Markdown className="space-y-2 text-sm! break-words text-muted-foreground! [&_p]:my-0!">
                  {question.description}
                </Markdown>
              )
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
                            aria-label={t('View details: {label}', { label: option.label })}
                            aria-expanded={detailId === option.id}
                            aria-controls={detailId === option.id ? 'option-details' : undefined}
                            aria-haspopup={wide ? undefined : 'dialog'}
                            onClick={(event) => {
                              detailTrigger.current = event.currentTarget;
                              setDetailId(option.id);
                            }}
                          >
                            {t('View details')}
                            <span aria-hidden="true"> ↗</span>
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
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {message(error)}
            </p>
          )}
          {reviewing && (
            <section aria-label={t('Answer summary')} className="overflow-hidden rounded-xl border">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-4 py-3">
                <h3 className="text-sm font-medium">{t('Answers')}</h3>
                <span className="text-xs text-muted-foreground">
                  {
                    params.questions.filter(
                      (item, at) => answerSchema(item).safeParse(answer(at)).success,
                    ).length
                  }
                  {' / '}
                  {params.questions.length} {t('answered')}
                </span>
              </div>
              <ol className="divide-y">
                {params.questions.map((item, at) => {
                  const result = answer(at);
                  return (
                    <li key={item.id} className="flex gap-3 px-4 py-3">
                      <span
                        aria-hidden="true"
                        className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground"
                      >
                        {at + 1}
                      </span>
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <h4 className="text-xs leading-5 font-normal break-words text-muted-foreground">
                          {item.title}
                        </h4>
                        {result.selections.length ? (
                          <ul className="space-y-2">
                            {result.selections.map((selection) => (
                              <li
                                key={
                                  selection.kind === 'custom'
                                    ? 'custom'
                                    : `option:${selection.optionId}`
                                }
                                className="text-sm break-words whitespace-pre-wrap"
                              >
                                {selection.kind === 'custom' ? (
                                  selection.text.trim() ? (
                                    <p className="font-medium">
                                      <span className="text-xs font-normal text-muted-foreground">
                                        {t('Other:')}
                                      </span>{' '}
                                      {selection.text}
                                    </p>
                                  ) : (
                                    <span className="text-muted-foreground italic">
                                      {t('No answer')}
                                    </span>
                                  )
                                ) : (
                                  <>
                                    <p className="font-medium">
                                      {
                                        item.options.find(
                                          (option) => option.id === selection.optionId,
                                        )?.label
                                      }
                                    </p>
                                    {selection.comment && (
                                      <p className="mt-1 border-l-2 pl-3 leading-relaxed text-muted-foreground">
                                        {selection.comment}
                                      </p>
                                    )}
                                  </>
                                )}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-sm text-muted-foreground italic">{t('No answer')}</p>
                        )}
                      </div>
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
      {detail && wide && (
        <aside
          id="option-details"
          aria-labelledby="option-details-title"
          className="sticky top-6 my-12 flex max-h-[calc(100dvh-6rem)] min-w-0 flex-col overflow-hidden rounded-xl border bg-background"
        >
          <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
            <h2
              id="option-details-title"
              className="min-w-0 pt-1 text-base font-semibold break-words"
            >
              {detail.label}
            </h2>
            <Button variant="ghost" size="sm" onClick={closeDetails}>
              {t('Close details')}
            </Button>
          </div>
          {detailBody}
        </aside>
      )}
      <Dialog
        open={!!detail && !wide}
        onOpenChange={(open) => {
          if (!open) setDetailId(null);
        }}
      >
        <DialogContent
          id="option-details"
          aria-describedby={undefined}
          className="inset-y-0 right-0 left-auto flex h-dvh w-full max-w-full translate-x-0 translate-y-0 flex-col gap-0 rounded-none p-0 sm:max-w-lg"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            detailTrigger.current?.focus();
          }}
        >
          <DialogHeader className="shrink-0 border-b p-5 pr-12 text-left">
            <DialogTitle className="text-base leading-6 break-words">{detail?.label}</DialogTitle>
          </DialogHeader>
          {detailBody}
        </DialogContent>
      </Dialog>
    </div>
  );
}
export default definePanel({
  id: 'choose',
  requires: { paneon: '0.0.0' },
  input: chooseParamsSchema,
  events: { 'answers-submitted': answersSubmittedSchema },
  render: ChoosePanel,
});
