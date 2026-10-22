import { createContext, useContext, useMemo } from 'react';
import { defaultUI, type UIPreferences } from '../shared/preferences';
import en from './locales/en';
import zh from './locales/zh-CN';
export type UIMessage = keyof typeof en;
export const UIContext = createContext<UIPreferences | null>(null);
export function useUI() {
  const ui = useContext(UIContext) ?? defaultUI;
  return useMemo(() => {
    const messages = ui.language === 'zh-CN' ? zh : en;
    const message = (key: string, params: Record<string, string | number> = {}) =>
      ((messages as Record<string, string>)[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) =>
        typeof params[name] === 'number'
          ? new Intl.NumberFormat(ui.language).format(params[name])
          : String(params[name] ?? `{${name}}`),
      );
    return {
      ...ui,
      t: (key: UIMessage, params?: Record<string, string | number>) => message(key, params),
      message,
    };
  }, [ui]);
}
export type { UIPreferences, UITheme, UILanguage } from '../shared/preferences';
