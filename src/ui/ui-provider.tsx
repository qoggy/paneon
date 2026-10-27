import { useLayoutEffect } from 'react';
import { defaultUI, type UIPreferences } from '../shared/preferences';
import { applyUI } from '../sdk/ui-environment';
import { UIContext } from './use-ui';
import { BrowserActionContext } from './browser-action-context';
import type { BrowserAction } from '../shared/browser-actions';
import { performBrowserAction } from './browser-actions';
import { Toaster } from './toast';
import { AnnotationRoot } from './annotation-root';
import { TooltipProvider } from './tooltip';
export function UIProvider({
  ui,
  children,
  onBrowserAction = performBrowserAction,
}: {
  ui?: UIPreferences;
  children: React.ReactNode;
  onBrowserAction?: (action: BrowserAction) => Promise<void>;
}) {
  const value = ui ?? defaultUI;
  useLayoutEffect(() => applyUI(value), [value]);
  return (
    <UIContext.Provider value={value}>
      <BrowserActionContext.Provider value={onBrowserAction}>
        <TooltipProvider>
          <AnnotationRoot>
            <Toaster>{children}</Toaster>
          </AnnotationRoot>
        </TooltipProvider>
      </BrowserActionContext.Provider>
    </UIContext.Provider>
  );
}
