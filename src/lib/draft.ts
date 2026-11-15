import { useEffect, useRef, useState } from "react";

/** Form state that survives a closed tab or dropped signal: saved to this device until submitted. */
export function useDraft<T extends object>(key: string, initial: T) {
  const storageKey = `draft:${key}`;
  const [value, setValue] = useState<T>(() => {
    try { const raw = localStorage.getItem(storageKey); if (raw) return { ...initial, ...JSON.parse(raw) }; } catch { /* ignore */ }
    return initial;
  });
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    try { localStorage.setItem(storageKey, JSON.stringify(value)); } catch { /* ignore */ }
  }, [storageKey, value]);
  const clear = () => { try { localStorage.removeItem(storageKey); } catch { /* ignore */ } };
  const hasDraft = (() => { try { return !!localStorage.getItem(storageKey); } catch { return false; } })();
  return [value, setValue, clear, hasDraft] as const;
}
