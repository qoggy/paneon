import { CodeText } from './code-text';

export function CodeBlock({
  code,
  language,
  className,
}: {
  code: string;
  language?: string;
  className?: string;
}) {
  return <CodeText code={code} language={language} className={className} />;
}
