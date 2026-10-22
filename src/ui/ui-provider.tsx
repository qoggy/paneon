import { useLayoutEffect } from 'react';
import { defaultUI, type UIPreferences } from '../shared/preferences';
import { applyUI } from '../sdk/ui-environment';
import { UIContext } from './use-ui';
export function UIProvider({ ui, children }: { ui?: UIPreferences; children: React.ReactNode }) {
  const value = ui ?? defaultUI;
  useLayoutEffect(() => applyUI(value), [value]);
  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}
