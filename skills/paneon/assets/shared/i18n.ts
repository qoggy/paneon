import { useUI } from '@qoggy/paneon/ui';
import { useMemo } from 'react';
import en from './locales/en';
import zh from './locales/zh-CN';
export function useLocale() {
  const { theme, language } = useUI();
  const message = useMemo(
    () =>
      (key: string, params: Record<string, string | number> = {}) => {
        const messages = language === 'zh-CN' ? zh : en;
        const value = (messages as Record<string, string>)[key] ?? key;
        return value.replace(/\{(\w+)\}/g, (_, name: string) =>
          typeof params[name] === 'number'
            ? new Intl.NumberFormat(language).format(params[name])
            : String(params[name] ?? `{${name}}`),
        );
      },
    [language],
  );
  return {
    theme,
    language,
    t: (key: keyof typeof en, params?: Record<string, string | number>) => message(key, params),
    message,
  };
}
