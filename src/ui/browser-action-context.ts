import { createContext, useContext } from 'react';
import type { BrowserAction } from '../shared/browser-actions';
import { performBrowserAction } from './browser-actions';

export const BrowserActionContext =
  createContext<(action: BrowserAction) => Promise<void>>(performBrowserAction);
export const useBrowserAction = () => useContext(BrowserActionContext);
