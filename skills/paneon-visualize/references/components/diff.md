# DiffView

## Use when

Compare two versions of a text, without needing a repository.

## Import

```ts
import {
  DiffView,
  type DiffViewProps,
  type DiffViewHandle,
  type DiffLocation,
} from '@qoggy/paneon/ui';
```

## Props

```ts
// Pass oldText / newText, or a model from createDiffModel (imported from '@qoggy/paneon/sdk', not ui).
interface DiffViewProps<TRef> {
  oldText?: string;
  newText?: string;
  model?: DiffModel; // takes precedence over oldText / newText
  oldPath?: string;
  newPath?: string;
  oldRevision?: string;
  newRevision?: string;
  defaultExpanded?: boolean; // default true: full file; false starts with changed hunks only
  onCollapse?: () => void; // when set, the toolbar shows a collapse button that calls it
  layout?: 'document' | 'bounded'; // default 'document' (natural flow); 'bounded' scrolls inside its container
  annotationTargets?: { old?: TRef; new?: TRef }; // an omitted side cannot be annotated; see authoring.md#markdown-codeblock-and-diffview
  ref?: Ref<DiffViewHandle>;
}

interface DiffViewHandle {
  reveal(location: DiffLocation): Promise<void>; // expands the needed context, then scrolls to and highlights the location
  getRanges(location: DiffLocation): Range[]; // DOM ranges for a 'text' location; [] for other kinds
}

type DiffLocation =
  | { kind: 'text'; side: 'old' | 'new'; start: number; end: number; quote: string } // offsets in the full old or new text
  | { kind: 'hunk'; index: number } // zero-based
  | { kind: 'file' };
```
