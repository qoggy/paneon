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
import { FileReferenceContext, type ReadFileReference } from './file-reference-context';
export function UIProvider({
  ui,
  children,
  onBrowserAction = performBrowserAction,
  onReadFile,
}: {
  ui?: UIPreferences;
  children: React.ReactNode;
  onBrowserAction?: (action: BrowserAction) => Promise<void>;
  onReadFile?: ReadFileReference;
}) {
  const value = ui ?? defaultUI;
  useLayoutEffect(() => applyUI(value), [value]);
  return (
    <UIContext.Provider value={value}>
      <BrowserActionContext.Provider value={onBrowserAction}>
        <FileReferenceContext.Provider value={onReadFile}>
          <TooltipProvider>
            <AnnotationRoot>
              <Toaster>{children}</Toaster>
            </AnnotationRoot>
          </TooltipProvider>
        </FileReferenceContext.Provider>
      </BrowserActionContext.Provider>
    </UIContext.Provider>
  );
}
