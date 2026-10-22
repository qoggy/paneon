import { useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import { agent, definePanel, usePanelInput } from 'paneon/sdk';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Field,
  FieldLabel,
  Markdown,
  Page,
  RadioGroup,
  RadioGroupItem,
  Stack,
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

type Draft = {
  selectedIds: string[];
  comments: Record<string, string>;
  customSelected: boolean;
  text: string;
};
function MultipleChoiceGroup({ children, 'aria-label': label }: ComponentProps<typeof RadioGroup>) {
  return (
    <div role="group" aria-label={label} className="grid gap-3">
      {children}
    </div>
  );
}
function ChoosePanel() {
  const params = usePanelInput<ChooseParams>();
  const [index, setIndex] = useState(0);
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
      setIndex(at);
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
    if (validate(index)) {
      setIndex(index + 1);
      setError('');
    }
  }
  function submit() {
    for (let at = 0; at < params.questions.length; at++) if (!validate(at)) return;
    const result = completeAnswersSchema(params).parse({
      answers: params.questions.map((_question, at) => answer(at)),
    });
    void submission.submit(result);
  }
  const last = index === params.questions.length - 1;
  return (
    <Page className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{params.title}</h1>
        {params.description && <Markdown>{params.description}</Markdown>}
      </header>
      <fieldset disabled={submission.pending} className="min-w-0 space-y-4">
        <div className="space-y-2">
          <p aria-live="polite" className="text-sm text-muted-foreground">
            Question {index + 1} / {params.questions.length}
          </p>
          <h2 ref={heading} tabIndex={-1} className="text-lg font-semibold">
            {question.title}
          </h2>
          {question.description && <Markdown>{question.description}</Markdown>}
          <p className="text-sm text-muted-foreground">
            {multiple
              ? 'Select one or more answers. You can include your own answer.'
              : 'Select one answer or write your own.'}
          </p>
        </div>
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
        >
          {question.options.map((option, optionIndex) => {
            const selected =
              (multiple || !draft.customSelected) && draft.selectedIds.includes(option.id);
            const controlId = `choice-${index}-${optionIndex}`;
            const commentId = `comment-${index}-${optionIndex}`;
            return (
              <Card key={option.id}>
                <CardHeader>
                  <CardTitle>
                    <Stack direction="row" gap={2} wrap className="items-center">
                      {multiple ? (
                        <Checkbox
                          id={controlId}
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
                        <RadioGroupItem id={controlId} value={`option:${option.id}`} />
                      )}
                      <label htmlFor={controlId}>{option.label}</label>
                      {option.recommended && <Badge variant="secondary">Recommended</Badge>}
                    </Stack>
                  </CardTitle>
                  {option.description && <CardDescription>{option.description}</CardDescription>}
                </CardHeader>
                {(option.details || selected) && (
                  <CardContent className="space-y-4">
                    {option.details && (
                      <details>
                        <summary>Read details: {option.label}</summary>
                        <Markdown>{option.details}</Markdown>
                      </details>
                    )}
                    {selected && (
                      <Field>
                        <FieldLabel htmlFor={commentId}>
                          Additional explanation for {option.label} (optional)
                        </FieldLabel>
                        <Textarea
                          id={commentId}
                          value={draft.comments[option.id]}
                          onChange={(event) =>
                            update({
                              comments: { ...draft.comments, [option.id]: event.target.value },
                            })
                          }
                        />
                      </Field>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
          <Card>
            <CardHeader>
              <CardTitle>
                <Stack direction="row" gap={2} className="items-center">
                  {multiple ? (
                    <Checkbox
                      id={`custom-choice-${index}`}
                      checked={draft.customSelected}
                      onCheckedChange={(checked) => update({ customSelected: checked === true })}
                    />
                  ) : (
                    <RadioGroupItem id={`custom-choice-${index}`} value="custom" />
                  )}
                  <label htmlFor={`custom-choice-${index}`}>Other</label>
                </Stack>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Field>
                <FieldLabel htmlFor={`custom-answer-${index}`}>My answer</FieldLabel>
                <Textarea
                  id={`custom-answer-${index}`}
                  value={draft.text}
                  aria-describedby={`custom-description-${index}`}
                  onChange={(event) =>
                    update({
                      text: event.target.value,
                      ...(event.target.value.trim() ? { customSelected: true } : {}),
                    })
                  }
                />
                <p id={`custom-description-${index}`} className="text-sm text-muted-foreground">
                  {draft.customSelected
                    ? 'Your answer will be included.'
                    : draft.text
                      ? 'Draft kept. Select Other to include it.'
                      : 'Write your own answer here to select Other.'}
                </p>
              </Field>
            </CardContent>
          </Card>
        </ChoiceGroup>
        {error && <p role="alert">{error}</p>}
        {last && (
          <section aria-label="Answer summary" className="space-y-2">
            <h3 className="font-semibold">Review all answers</h3>
            <ol className="space-y-3">
              {params.questions.map((item, at) => {
                const result = answer(at);
                return (
                  <li key={item.id}>
                    <strong>{item.title}</strong>
                    {result.selections.length ? (
                      <ul className="space-y-1">
                        {result.selections.map((selection) => (
                          <li
                            key={
                              selection.kind === 'custom'
                                ? 'custom'
                                : `option:${selection.optionId}`
                            }
                            className="whitespace-pre-wrap"
                          >
                            {selection.kind === 'custom' ? (
                              <>Other: {selection.text || 'No answer'}</>
                            ) : (
                              <>
                                {
                                  item.options.find((option) => option.id === selection.optionId)
                                    ?.label
                                }
                                {selection.comment && <p>{selection.comment}</p>}
                              </>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>No answer</p>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        )}
        <Stack direction="row" wrap>
          <Button
            variant="outline"
            disabled={index === 0 || submission.pending}
            onClick={() => {
              setIndex(index - 1);
              setError('');
            }}
          >
            Previous
          </Button>
          {last ? (
            <Button disabled={submission.pending} onClick={submit}>
              {submission.pending
                ? 'Saving…'
                : submission.hasReceipt
                  ? 'Submit corrected answers'
                  : 'Submit all answers'}
            </Button>
          ) : (
            <Button onClick={next}>Next</Button>
          )}
        </Stack>
      </fieldset>
      {submission.message && (
        <Alert role={submission.failed ? 'alert' : 'status'}>
          <AlertTitle>Submission</AlertTitle>
          <AlertDescription>{submission.message}</AlertDescription>
        </Alert>
      )}
    </Page>
  );
}
export default definePanel({
  id: 'choose',
  requires: { paneon: '0.0.0' },
  input: chooseParamsSchema,
  events: { 'answers-submitted': answersSubmittedSchema },
  render: ChoosePanel,
});
