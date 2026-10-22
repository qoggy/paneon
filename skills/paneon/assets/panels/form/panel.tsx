import { useRef, useState } from 'react';
import { agent, definePanel, usePanelInput } from 'paneon/sdk';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Checkbox,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
  Markdown,
  Page,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from 'paneon/ui';
import { useSubmission } from '../../shared/submission';
import {
  collectForm,
  completeFormSchema,
  formParamsSchema,
  formSubmittedSchema,
  initialDraft,
} from './schema';
import type { FormDraft, FormParams, FormValue } from './schema';

function FormPanel() {
  const params = usePanelInput<FormParams>();
  const [draft, setDraft] = useState(() => initialDraft(params));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const form = useRef<HTMLFormElement>(null);
  const submission = useSubmission<{ values: Record<string, FormValue> }>((value) =>
    agent.emit('form-submitted', completeFormSchema(params).parse(value)),
  );
  function update(name: string, value: FormDraft[string]) {
    setDraft((previous) => ({ ...previous, [name]: value }));
  }
  function submit() {
    const result = collectForm(params, draft);
    setErrors(result.errors);
    if (Object.keys(result.errors).length) {
      requestAnimationFrame(() =>
        form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      );
      return;
    }
    void submission.submit({ values: result.values });
  }
  return (
    <Page title={params.title}>
      {params.description && <Markdown>{params.description}</Markdown>}
      <form
        ref={form}
        noValidate
        onKeyDown={(event) => {
          // Panel iframes intentionally disallow native form navigation.
          if (
            event.key === 'Enter' &&
            !event.nativeEvent.isComposing &&
            event.target instanceof HTMLInputElement &&
            (event.target.type === 'text' || event.target.type === 'number')
          ) {
            event.preventDefault();
            if (!submission.pending) submit();
          }
        }}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <fieldset disabled={submission.pending}>
          <FieldGroup>
            {params.fields.map((field, index) => {
              const id = `field-${index}`;
              const error = Object.hasOwn(errors, field.name) ? errors[field.name] : undefined;
              const props = {
                id,
                'aria-invalid': Boolean(error),
                'aria-describedby':
                  [field.description ? `${id}-description` : '', error ? `${id}-error` : '']
                    .filter(Boolean)
                    .join(' ') || undefined,
              };
              const value = draft[field.name];
              const label = `${field.label}${field.required ? ' *' : ''}`;
              const description = field.description && (
                <FieldDescription id={`${id}-description`}>{field.description}</FieldDescription>
              );
              const errorMessage = error && <FieldError id={`${id}-error`}>{error}</FieldError>;
              const clear = value !== '' && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Clear ${field.label}`}
                  title={`Clear ${field.label}`}
                  className="shrink-0"
                  onClick={() => {
                    update(field.name, '');
                    requestAnimationFrame(() => document.getElementById(id)?.focus());
                  }}
                >
                  <span aria-hidden="true">×</span>
                </Button>
              );
              if (field.type === 'checkbox' || field.type === 'switch') {
                return (
                  <Field key={field.name} orientation="horizontal" data-invalid={Boolean(error)}>
                    {field.type === 'checkbox' ? (
                      <Checkbox
                        {...props}
                        checked={value === true}
                        onCheckedChange={(checked) => update(field.name, checked === true)}
                      />
                    ) : (
                      <Switch
                        {...props}
                        checked={value === true}
                        onCheckedChange={(checked) => update(field.name, checked)}
                      />
                    )}
                    <FieldContent>
                      <FieldLabel htmlFor={id}>{label}</FieldLabel>
                      {description}
                      {errorMessage}
                    </FieldContent>
                  </Field>
                );
              }
              return (
                <Field key={field.name} data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor={id}>{label}</FieldLabel>
                  {(field.type === 'text' ||
                    field.type === 'textarea' ||
                    field.type === 'number') &&
                    (field.type === 'textarea' ? (
                      <Textarea
                        {...props}
                        value={String(value)}
                        onChange={(event) => update(field.name, event.target.value)}
                      />
                    ) : (
                      <Input
                        {...props}
                        type={field.type === 'number' ? 'number' : 'text'}
                        step={field.type === 'number' ? 'any' : undefined}
                        value={String(value)}
                        onChange={(event) => update(field.name, event.target.value)}
                      />
                    ))}
                  {field.type === 'select' && (
                    <div className="flex max-w-md min-w-0 items-center gap-1">
                      <Select
                        value={String(value)}
                        onValueChange={(selected) => update(field.name, selected)}
                        disabled={submission.pending}
                      >
                        <SelectTrigger {...props} className="min-w-0 flex-1">
                          <SelectValue placeholder="Select an option" />
                        </SelectTrigger>
                        <SelectContent>
                          {field.options.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {clear}
                    </div>
                  )}
                  {field.type === 'radio' && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <RadioGroup
                        {...props}
                        className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-3"
                        tabIndex={-1}
                        value={String(value)}
                        onValueChange={(selected) => update(field.name, selected)}
                        aria-label={field.label}
                        disabled={submission.pending}
                      >
                        {field.options.map((option, at) => (
                          <div
                            key={option.value}
                            className="flex max-w-full min-w-0 items-start gap-2"
                          >
                            <RadioGroupItem
                              id={`${id}-${at}`}
                              value={option.value}
                              className="mt-0.5 shrink-0"
                            />
                            <label
                              htmlFor={`${id}-${at}`}
                              className="min-w-0 cursor-pointer leading-snug break-words"
                            >
                              {option.label}
                            </label>
                          </div>
                        ))}
                      </RadioGroup>
                      {clear}
                    </div>
                  )}
                  {field.type === 'multiselect' && (
                    <div
                      {...props}
                      role="group"
                      aria-label={field.label}
                      tabIndex={-1}
                      className="flex flex-wrap items-center gap-x-6 gap-y-3"
                    >
                      {field.options.map((option, at) => (
                        <div
                          key={option.value}
                          className="flex max-w-full min-w-0 items-start gap-2"
                        >
                          <Checkbox
                            id={`${id}-${at}`}
                            className="mt-0.5 shrink-0"
                            checked={Array.isArray(value) && value.includes(option.value)}
                            onCheckedChange={(checked) => {
                              const previous = Array.isArray(value) ? value : [];
                              update(
                                field.name,
                                checked === true
                                  ? [...previous, option.value]
                                  : previous.filter((item) => item !== option.value),
                              );
                            }}
                          />
                          <label
                            htmlFor={`${id}-${at}`}
                            className="min-w-0 cursor-pointer leading-snug break-words"
                          >
                            {option.label}
                          </label>
                        </div>
                      ))}
                    </div>
                  )}
                  {description}
                  {errorMessage}
                </Field>
              );
            })}
            <div className="flex items-center gap-2">
              <Button type="button" disabled={submission.pending} onClick={submit}>
                {submission.pending
                  ? 'Saving…'
                  : submission.hasReceipt
                    ? 'Submit corrected form'
                    : 'Submit form'}
              </Button>
            </div>
          </FieldGroup>
        </fieldset>
      </form>
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
  id: 'form',
  requires: { paneon: '0.0.0' },
  input: formParamsSchema,
  events: { 'form-submitted': formSubmittedSchema },
  render: FormPanel,
});
