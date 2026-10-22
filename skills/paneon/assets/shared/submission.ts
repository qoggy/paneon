import { useRef, useState } from 'react';

// Supplied-page policy: append complete revisions after a successful receipt.
export function useSubmission<T extends object>(
  emit: (value: T & { replacesEventId?: number }) => Promise<{ id: number }>,
) {
  const receipt = useRef<number | undefined>(undefined);
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  async function submit(value: T) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setMessage('');
    setFailed(false);
    try {
      const result = await emit({
        ...value,
        ...(receipt.current === undefined ? {} : { replacesEventId: receipt.current }),
      });
      receipt.current = result.id;
      setMessage(
        `Saved as event ${result.id}. Edit and explicitly submit again to save a correction.`,
      );
    } catch (error) {
      setFailed(true);
      setMessage(
        `Not saved. ${error instanceof Error ? error.message : 'Submission failed.'} The draft is still available.`,
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return { pending, message, failed, submit, hasReceipt: receipt.current !== undefined };
}
