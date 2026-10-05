export interface HarnessCheck {
  name: string;
  ok: boolean;
  detail: string;
}

/**
 * Runs one assertion group. The callback is *not* wrapped in `act` (mounting
 * nested inside an outer `act` defers rendering); suites use `mount`, `flush`,
 * `withAct` and `waitFor` where React updates need an explicit flush.
 */
export async function check(
  name: string,
  fn: () => void | Promise<void>,
): Promise<HarnessCheck> {
  try {
    await fn();
    return { name, ok: true, detail: '' };
  } catch (error) {
    return {
      name,
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

export function expect(condition: boolean, message = 'assertion failed'): asserts condition {
  if (!condition) throw new Error(message);
}

export function expectEqual<T>(actual: T, expected: T, message: string): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${message} — expected ${b}, received ${a}`);
}