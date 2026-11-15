import { useEffect, useRef, useState } from "react";

/** Form state that survives a closed tab or dropped signal: saved to this device until submitted. */
export function useDraft<T extends object>(key: string, initial: T) {
  const storageKey = `draft:${key}`;
  const initialJson = useRef(JSON.stringify(initial));
  // whether a draft was already on this device when the form opened
  const [hasDraft, setHasDraft] = useState(() => { try { return !!localStorage.getItem(storageKey); } catch { return false; } });
  const [value, setValue] = useState<T>(() => {
    try { const raw = localStorage.getItem(storageKey); if (raw) return { ...initial, ...JSON.parse(raw) }; } catch { /* ignore */ }
    return initial;
  });
  useEffect(() => {
    try {
      const json = JSON.stringify(value);
      if (json === initialJson.current) return; // nothing typed yet
      localStorage.setItem(storageKey, json);
    } catch { /* ignore */ }
  }, [storageKey, value]);
  const clear = () => { setHasDraft(false); try { localStorage.removeItem(storageKey); } catch { /* ignore */ } };
  return [value, setValue, clear, hasDraft] as const;
}
