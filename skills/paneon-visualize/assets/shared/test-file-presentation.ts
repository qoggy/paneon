/** Conservative filename conventions, not a claim about test discovery or test results. */
export function isTestFile(path: string): boolean {
  const normalized = path.replaceAll('\\', '/');
  const parts = normalized.split('/');
  const name = parts.pop() ?? '';
  // Fixtures may deliberately contain files with otherwise valid test names.
  if (parts.some((part) => ['fixtures', '__fixtures__', 'testdata'].includes(part))) return false;
  return (
    /^.+\.(?:test|spec)\.(?:[cm]?[jt]s|[jt]sx)$/.test(name) ||
    /^[^._].*_test\.go$/.test(name) ||
    /^(?:test_.+|.+_test)\.py$/.test(name) ||
    /(?:^|\/)src\/test\/java\/(?:[^/]+\/)*[^/]+(?:Test|Tests|TestCase)\.java$/.test(normalized) ||
    /(?:^|\/)src\/test\/kotlin\/(?:[^/]+\/)*[^/]+(?:Test|Tests)\.kt$/.test(normalized)
  );
}

export function testFilePresentation(path: string, selected: boolean) {
  const test = isTestFile(path);
  return {
    'data-test-file': test ? true : undefined,
    className:
      test && !selected
        ? 'bg-green-50 hover:bg-green-100 dark:bg-green-950/40 dark:hover:bg-green-900/40'
        : '',
  };
}
