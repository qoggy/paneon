export type UITheme = 'light' | 'dark';
export type UILanguage = 'en' | 'zh-CN';
export type UIPreferences = { theme: UITheme; language: UILanguage };
export const defaultUI: UIPreferences = { theme: 'light', language: 'en' };
