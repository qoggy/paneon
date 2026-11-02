import { createContext, useContext } from 'react';

type ElementPicker = {
  active: boolean;
  blocked: boolean;
  enter: () => void;
  exit: () => void;
  setLauncher: (node: HTMLElement | null) => void;
};

export const ElementPickerContext = createContext<ElementPicker | null>(null);
/** The private AnnotationControls composition always provides this context. */
export const useElementAnnotationPicker = () => useContext(ElementPickerContext) as ElementPicker;
