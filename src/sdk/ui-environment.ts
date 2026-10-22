import type { UIPreferences } from '../shared/preferences.js';
export function applyUI(ui: UIPreferences) {
  const root = document.documentElement;
  const changing = root.dataset.theme !== undefined && root.dataset.theme !== ui.theme;
  const transition = changing ? crypto.randomUUID() : undefined;
  if (transition) root.dataset.themeChanging = transition;
  root.classList.toggle('dark', ui.theme === 'dark');
  root.lang = ui.language;
  root.style.colorScheme = ui.theme;
  root.dataset.theme = ui.theme;
  root.dataset.language = ui.language;
  if (transition) {
    // Commit the new palette with transitions disabled before restoring normal interactions.
    void document.body?.offsetHeight;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (root.dataset.themeChanging === transition) delete root.dataset.themeChanging;
      }),
    );
  }
}
