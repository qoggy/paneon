# Markdown

## Use when

Render a Markdown document, such as a plan or report, with GFM, code blocks, Mermaid diagrams and images.

## Import

```ts
import { Markdown, type MarkdownProps } from '@qoggy/paneon/ui';
```

## Props

```ts
interface MarkdownProps<TRef> {
  children: string; // required: the Markdown source; GFM is supported, raw HTML is not rendered
  // `~~~` fences avoid backtick escaping inside template strings
  sourcePath?: string; // e.g. "docs/plan.md": relative links and images resolve from its directory; otherwise against --cwd
  outline?: 'auto' | 'popover' | 'off'; // default 'popover': heading directory that opens on demand at every width, no reserved sidebar; 'auto' is a responsive sidebar
  frontmatter?: 'auto' | 'off'; // default 'auto': recognize a leading YAML block
  components?: Components; // react-markdown overrides; replacing `pre` drops Mermaid rendering; replacing `img` or `pre` drops annotations for them
  rehypePlugins?: PluggableList;
  annotationTarget?: TRef; // opt into page annotations; see authoring.md#markdown-codeblock-and-diffview
  className?: string;
}
```
