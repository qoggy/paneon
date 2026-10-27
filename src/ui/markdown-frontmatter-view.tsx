import { Fragment, useEffect } from 'react';
import type { Frontmatter, FrontmatterText, FrontmatterValue } from './markdown-frontmatter';

function Text({ text, annotated }: { text: FrontmatterText; annotated: boolean }) {
  return annotated ? (
    <span data-source-leaf="yaml" data-source-offsets={JSON.stringify(text.offsets)}>
      {text.value}
    </span>
  ) : (
    <>{text.value}</>
  );
}

function Value({ value, annotated }: { value: FrontmatterValue | null; annotated: boolean }) {
  if (!value) return null;
  return (
    <>
      {value.properties.length > 0 && (
        <div className="yaml-properties">
          {value.properties.map((text, index) => (
            <Fragment key={index}>
              {index > 0 && ' '}
              <Text text={text} annotated={annotated} />
            </Fragment>
          ))}
        </div>
      )}
      {value.kind === 'map' ? (
        <dl>
          {value.entries.map((entry, index) => (
            <div className="yaml-entry" key={index}>
              <dt>
                <Value value={entry.key} annotated={annotated} />
              </dt>
              <dd>
                <Value value={entry.value} annotated={annotated} />
              </dd>
            </div>
          ))}
        </dl>
      ) : value.kind === 'sequence' ? (
        <ul>
          {value.items.map((item, index) => (
            <li key={index}>
              <Value value={item} annotated={annotated} />
            </li>
          ))}
        </ul>
      ) : (
        <span className="yaml-value">
          <Text text={value.text} annotated={annotated} />
        </span>
      )}
    </>
  );
}

export function MarkdownFrontmatter({
  value,
  annotated,
}: {
  value: Frontmatter;
  annotated: boolean;
}) {
  useEffect(() => {
    if (value.errors.length > 0) console.warn('Invalid YAML frontmatter:', value.errors);
  }, [value]);
  return (
    <div data-markdown-frontmatter="" data-invalid={value.errors.length > 0 ? '' : undefined}>
      {value.errors.length > 0 ? (
        <pre>
          <code>
            <Text text={value.raw} annotated={annotated} />
          </code>
        </pre>
      ) : (
        <Value value={value.value} annotated={annotated} />
      )}
    </div>
  );
}
