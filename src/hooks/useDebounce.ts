import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Returns a debounced copy of `value` that only updates after `delay` ms of
 * quiet. Used for search inputs and note writes.
 */
export function useDebounce<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

/**
 * Returns the latest value plus a `flush` callback, allowing pending updates to
 * be committed immediately (for example when the editor unmounts).
 */
export function useDebouncedCallback<A extends unknown[]>(
  callback: (...args: A) => void,
  delay = 250,
): { run: (...args: A) => void; flush: () => void; cancel: () => void; pending: boolean } {
  const timerRef = useRef<number | null>(null);
  const pendingArgsRef = useRef<A | null>(null);
  const callbackRef = useRef(callback);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingArgsRef.current = null;
    setPending(false);
  }, []);

  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const args = pendingArgsRef.current;
    pendingArgsRef.current = null;
    setPending(false);
    if (args) callbackRef.current(...args);
  }, []);

  const run = useCallback(
    (...args: A) => {
      pendingArgsRef.current = args;
      setPending(true);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        pendingArgsRef.current = null;
        setPending(false);
        callbackRef.current(...args);
      }, delay);
    },
    [delay],
  );

  useEffect(() => cancel, [cancel]);

  return { run, flush, cancel, pending };
}

export default useDebounce;