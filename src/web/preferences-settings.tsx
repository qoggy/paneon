import { useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Field,
  FieldLabel,
  Alert,
  AlertDescription,
  useUI,
} from '../ui';
import { useSavePreferences } from './preferences-state';
import { errorMessage } from './api';
import type { UIPreferences } from '../shared/preferences';
export function PreferencesSettings() {
  const { theme, language, t } = useUI();
  const save = useSavePreferences();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function update(patch: Partial<UIPreferences>) {
    setPending(true);
    setError('');
    try {
      await save(patch);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">{t('Settings')}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('Settings')}</DialogTitle>
          <DialogDescription>
            {t('Theme')} · {t('Language')}
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel>{t('Theme')}</FieldLabel>
          <div className="flex gap-2" role="group" aria-label={t('Theme')}>
            {(['light', 'dark'] as const).map((value) => (
              <Button
                key={value}
                variant={theme === value ? 'default' : 'outline'}
                aria-pressed={theme === value}
                disabled={pending}
                onClick={() => void update({ theme: value })}
              >
                {t(value === 'light' ? 'Light' : 'Dark')}
              </Button>
            ))}
          </div>
        </Field>
        <Field>
          <FieldLabel>{t('Language')}</FieldLabel>
          <div className="flex gap-2" role="group" aria-label={t('Language')}>
            {(['en', 'zh-CN'] as const).map((value) => (
              <Button
                key={value}
                variant={language === value ? 'default' : 'outline'}
                aria-pressed={language === value}
                disabled={pending}
                onClick={() => void update({ language: value })}
              >
                {value === 'en' ? 'English' : '简体中文'}
              </Button>
            ))}
          </div>
        </Field>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{t('Save failed. {error}', { error })}</AlertDescription>
          </Alert>
        )}
      </DialogContent>
    </Dialog>
  );
}
