import { useRef, useState } from 'react';
import { Button, useUI } from '../ui';
import { cn } from '../ui/utils';
import { useSavePreferences } from './preferences-state';
import { errorMessage } from './api';
import type { UIPreferences } from '../shared/preferences';
export function PreferencesSettings() {
  const { theme, language, t } = useUI();
  const save = useSavePreferences();
  const saving = useRef(false);
  const [status, setStatus] = useState<'idle' | 'pending' | 'saved' | 'failed'>('idle');
  const [error, setError] = useState('');
  const pending = status === 'pending';
  async function update(patch: Partial<UIPreferences>) {
    if (saving.current) return;
    saving.current = true;
    setStatus('pending');
    setError('');
    try {
      await save(patch);
      setStatus('saved');
    } catch (cause) {
      setError(errorMessage(cause));
      setStatus('failed');
    } finally {
      saving.current = false;
    }
  }
  return (
    <section className="max-w-[640px]" aria-labelledby="settings-title">
      <h1 id="settings-title" className="mb-6 text-xl font-semibold tracking-tight">
        {t('Settings')}
      </h1>
      <div className="grid items-center gap-4 border-t py-6 sm:grid-cols-[1fr_auto]">
        <span className="text-sm font-medium" id="appearance-label">
          {t('Appearance')}
        </span>
        <div
          className="flex rounded-lg border bg-muted p-1"
          role="group"
          aria-labelledby="appearance-label"
        >
          {(['light', 'dark'] as const).map((value) => (
            <Button
              key={value}
              variant="ghost"
              size="sm"
              className={cn(
                'flex-1 text-muted-foreground',
                theme === value && 'bg-background text-foreground shadow-sm hover:bg-background',
              )}
              aria-pressed={theme === value}
              disabled={pending}
              onClick={() => {
                if (theme !== value) void update({ theme: value });
              }}
            >
              {t(value === 'light' ? 'Light' : 'Dark')}
            </Button>
          ))}
        </div>
      </div>
      <div className="grid items-center gap-4 border-t py-6 sm:grid-cols-[1fr_auto]">
        <label className="text-sm font-medium" htmlFor="interface-language">
          {t('Language')}
        </label>
        <select
          id="interface-language"
          value={language}
          disabled={pending}
          className="h-9 min-w-40 rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:border-ring focus-visible:outline-ring/50 disabled:opacity-50"
          onChange={(event) =>
            void update({ language: event.target.value as UIPreferences['language'] })
          }
        >
          <option value="en">English</option>
          <option value="zh-CN">简体中文</option>
        </select>
      </div>
      <div
        role="status"
        aria-live="polite"
        className={cn('text-sm text-muted-foreground', status === 'failed' && 'text-destructive')}
      >
        {pending
          ? t('Saving…')
          : status === 'saved'
            ? t('Saved')
            : status === 'failed'
              ? t('Save failed. {error}', { error })
              : null}
      </div>
    </section>
  );
}
