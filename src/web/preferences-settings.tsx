import { useRef, useState } from 'react';
import {
  Label,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useToastManager,
  useUI,
} from '../ui';
import { cn } from '../ui/utils';
import { useSavePreferences } from './preferences-state';
import { errorMessage } from './api';
import type { UIPreferences } from '../shared/preferences';

function SavedToastTitle() {
  const { t } = useUI();
  return t('Saved');
}

export function PreferencesSettings() {
  const { theme, language, t } = useUI();
  const toast = useToastManager();
  const save = useSavePreferences();
  const saving = useRef(false);
  const [status, setStatus] = useState<'idle' | 'pending' | 'failed'>('idle');
  const [error, setError] = useState('');
  const pending = status === 'pending';
  async function update(patch: Partial<UIPreferences>) {
    if (saving.current) return;
    saving.current = true;
    setStatus('pending');
    setError('');
    try {
      await save(patch);
      setStatus('idle');
      toast.add({ title: <SavedToastTitle />, type: 'success' });
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
        <RadioGroup
          className="flex gap-4"
          aria-labelledby="appearance-label"
          value={theme}
          disabled={pending}
          onValueChange={(value) => {
            if (value !== theme) void update({ theme: value as UIPreferences['theme'] });
          }}
        >
          {(['light', 'dark'] as const).map((value) => (
            <Label key={value}>
              <RadioGroupItem value={value} />
              {t(value === 'light' ? 'Light' : 'Dark')}
            </Label>
          ))}
        </RadioGroup>
      </div>
      <div className="grid items-center gap-4 border-t py-6 sm:grid-cols-[1fr_auto]">
        <Label htmlFor="interface-language">{t('Language')}</Label>
        <Select
          value={language}
          items={{ en: 'English', 'zh-CN': '简体中文' }}
          disabled={pending}
          onValueChange={(value) => {
            if (value !== null && value !== language) void update({ language: value });
          }}
        >
          <SelectTrigger id="interface-language" className="min-w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="en">English</SelectItem>
            <SelectItem value="zh-CN">简体中文</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div
        role="status"
        aria-live="polite"
        className={cn('text-sm text-muted-foreground', status === 'failed' && 'text-destructive')}
      >
        {pending ? t('Saving…') : status === 'failed' ? t('Save failed. {error}', { error }) : null}
      </div>
    </section>
  );
}
