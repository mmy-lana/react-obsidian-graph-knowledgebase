export interface HarnessCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export function check(name: string, fn: () => void | Promise<void>): Promise<HarnessCheck> {
  return Promise.resolve()
    .then(fn)
    .then((): HarnessCheck => ({ name, ok: true, detail: '' }))
    .catch((error: unknown): HarnessCheck => ({
      name,
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    }));
}

export function expect(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function expectEqual<T>(actual: T, expected: T, message: string): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${message} — expected ${b}, received ${a}`);
}