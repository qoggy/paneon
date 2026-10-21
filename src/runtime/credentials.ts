import { randomUUID } from 'node:crypto';
import { PaneonError } from '../shared/types.js';
import { assertNoSecrets } from './secret-boundary.js';
type Binding = { instanceId: string; revision: string; actionId: string };
export class Credentials {
  private retained = new Map<string, number>();
  retain(value: string) {
    this.retained.set(value, (this.retained.get(value) ?? 0) + 1);
  }
  release(value: string) {
    const count = this.retained.get(value) ?? 0;
    if (count <= 1) this.retained.delete(value);
    else this.retained.set(value, count - 1);
  }
  private values = new Map<
    string,
    Binding & { value: string; expiresAt: number; timer: ReturnType<typeof setTimeout> }
  >();
  create(binding: Binding, value: string, ttlSeconds = 900) {
    if (
      typeof value !== 'string' ||
      !value ||
      !Number.isInteger(ttlSeconds) ||
      ttlSeconds < 1 ||
      ttlSeconds > 3600
    )
      throw new PaneonError(
        'INVALID_CREDENTIAL',
        'Credentials require a value and a TTL between 1 and 3600 seconds.',
      );
    const ref = randomUUID();
    const expiresAt = Date.now() + ttlSeconds * 1000;
    const timer = setTimeout(() => this.revoke(ref), ttlSeconds * 1000);
    timer.unref();
    this.values.set(ref, { ...binding, value, expiresAt, timer });
    return { ref, expiresAt: new Date(expiresAt).toISOString(), status: 'ready' as const };
  }
  revoke(ref: string) {
    const value = this.values.get(ref);
    if (value) clearTimeout(value.timer);
    this.values.delete(ref);
  }
  invalidate(instanceId?: string) {
    for (const [ref, v] of this.values)
      if (!instanceId || v.instanceId === instanceId) this.revoke(ref);
  }
  get(ref: string, binding: Binding) {
    const v = this.values.get(ref);
    if (!v || v.expiresAt <= Date.now()) {
      this.revoke(ref);
      throw new PaneonError('CREDENTIAL_EXPIRED', 'The credential is no longer available.');
    }
    if (
      v.instanceId !== binding.instanceId ||
      v.revision !== binding.revision ||
      v.actionId !== binding.actionId
    )
      throw new PaneonError(
        'CREDENTIAL_BINDING_MISMATCH',
        'The credential belongs to a different action or revision.',
      );
    return v.value;
  }
  check(value: unknown) {
    for (const [ref, v] of this.values) if (v.expiresAt <= Date.now()) this.revoke(ref);
    assertNoSecrets(value, [
      ...[...this.values.values()].map((v) => v.value),
      ...this.retained.keys(),
    ]);
  }
}
