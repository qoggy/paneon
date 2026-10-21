import { PaneonError } from '../shared/types.js';
export function assertNoSecrets(value: unknown, secrets: Iterable<string>) {
  const known = [...secrets].filter(Boolean);
  const visited = new Set<object>();
  function text(v: string) {
    if (known.some((secret) => v.includes(secret)))
      throw new PaneonError(
        'SECRET_OUTPUT_BLOCKED',
        'The value contains protected credential content.',
      );
  }
  function visit(v: unknown) {
    if (typeof v === 'string') {
      text(v);
      return;
    }
    if (v && typeof v === 'object' && !visited.has(v)) {
      visited.add(v);
      for (const [key, nested] of Object.entries(v)) {
        text(key);
        visit(nested);
      }
    }
  }
  visit(value);
}
