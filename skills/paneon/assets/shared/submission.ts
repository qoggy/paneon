import { useRef, useState } from 'react';
import { useToastManager } from '@qoggy/paneon/ui';
import { useLocale } from './i18n';
import type en from './locales/en';
type MessageKey = keyof typeof en;
export class SubmissionError extends Error {
  key: MessageKey;
  constructor(key: MessageKey) {
    super(key);
    this.key = key;
  }
}
// Supplied-page policy: append complete revisions after a successful receipt.
export function useSubmission<T extends object>(
  emit: (value: T & { replacesEventId?: number }) => Promise<{ id: number }>,
  options: { successToast?: MessageKey } = {},
) {
  const { t } = useLocale();
  const toast = useToastManager();
  const receipt = useRef<number | undefined>(undefined);
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ id: number } | { error: string; key?: MessageKey }>();
  async function submit(value: T) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setResult(undefined);
    try {
      const next = await emit({
        ...value,
        ...(receipt.current === undefined ? {} : { replacesEventId: receipt.current }),
      });
      receipt.current = next.id;
      setResult(next);
      if (options.successToast) toast.add({ title: t(options.successToast), type: 'success' });
    } catch (error) {
      setResult({
        error: error instanceof Error ? error.message : 'Submission failed.',
        ...(error instanceof SubmissionError
          ? { key: error.key }
          : error instanceof Error
            ? {}
            : { key: 'Submission failed.' as const }),
      });
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  const failed = !!result && 'error' in result;
  const message = !result
    ? ''
    : 'id' in result
      ? options.successToast
        ? ''
        : t('Saved as event {id}. Edit and explicitly submit again to save a correction.', {
            id: result.id,
          })
      : t('Not saved. {error} The draft is still available.', {
          error: result.key ? t(result.key) : result.error,
        });
  return {
    pending,
    message,
    failed,
    submit,
    reject: (key: MessageKey) => setResult({ error: key, key }),
    hasReceipt: receipt.current !== undefined,
  };
}
