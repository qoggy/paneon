import { useState } from 'react';
import { agent, definePanel, z } from 'paneon/sdk';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Checkbox,
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
  Input,
  Page,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Stack,
  Textarea,
} from 'paneon/ui';

function FormPanel() {
  const [name, setName] = useState('');
  const [environment, setEnvironment] = useState('preview');
  const [notes, setNotes] = useState('');
  const [notify, setNotify] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const error = attempted && !name.trim() ? 'Enter a name.' : '';
  async function submit() {
    setAttempted(true);
    setMessage('');
    if (!name.trim()) return;
    setPending(true);
    try {
      await agent.emit('parameters-submitted', { name: name.trim(), environment, notes, notify });
      setMessage('Parameters submitted to AI.');
    } catch {
      setMessage('The parameters were not saved.');
    } finally {
      setPending(false);
    }
  }
  return (
    <Page
      title="Parameter form"
      description="Field components present labels and validation; React owns their values."
    >
      <Stack>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <FieldSet>
            <FieldLegend>Request parameters</FieldLegend>
            <FieldGroup>
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="request-name">Name</FieldLabel>
                <Input
                  id="request-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? 'name-help name-error' : 'name-help'}
                />
                <FieldDescription id="name-help">
                  A short label to help your agent identify this request.
                </FieldDescription>
                {error && <FieldError id="name-error">{error}</FieldError>}
              </Field>
              <Field>
                <FieldLabel htmlFor="form-environment">Environment</FieldLabel>
                <Select
                  items={{ preview: 'Preview', staging: 'Staging' }}
                  value={environment}
                  onValueChange={(value) => setEnvironment(value ?? '')}
                >
                  <SelectTrigger id="form-environment">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="preview">Preview</SelectItem>
                    <SelectItem value="staging">Staging</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="request-notes">Notes</FieldLabel>
                <Textarea
                  id="request-notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </Field>
              <Field orientation="horizontal">
                <Checkbox
                  id="notify"
                  checked={notify}
                  onCheckedChange={(checked) => setNotify(checked === true)}
                />
                <FieldLabel htmlFor="notify">
                  <FieldTitle>Request a follow-up explanation</FieldTitle>
                </FieldLabel>
              </Field>
              <Button type="submit" disabled={pending}>
                Submit parameters
              </Button>
            </FieldGroup>
          </FieldSet>
        </form>
        {message && (
          <Alert>
            <AlertTitle>Submission</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}
      </Stack>
    </Page>
  );
}
export default definePanel({
  id: 'form-panel',
  requires: { paneon: '0.0.0' },
  input: z.object({}),
  events: {
    'parameters-submitted': z.object({
      name: z.string(),
      environment: z.string(),
      notes: z.string(),
      notify: z.boolean(),
    }),
  },
  render: FormPanel,
});
