import { createContext, useContext } from 'react';
import type { UIPreferences } from '../shared/preferences';
export const SaveContext = createContext<(patch: Partial<UIPreferences>) => Promise<void>>(
  async () => {},
);
export const useSavePreferences = () => useContext(SaveContext);
