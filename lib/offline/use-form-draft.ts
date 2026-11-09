"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { loadDraft, saveDraft, scopeOf, type Owner } from "./store";

function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

export function useOnline() {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}

export function useFormDraft<T>(
  owner: Owner | undefined,
  form: string,
  value: T,
  restore: (value: T) => void,
) {
  const scope = owner ? scopeOf(owner) : "";
  const [loadedScope, setLoadedScope] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const restoreRef = useRef(restore);
  useEffect(() => {
    restoreRef.current = restore;
  }, [restore]);

  useEffect(() => {
    if (!owner) return;
    let live = true;
    loadDraft<T>(owner, form)
      .then((draft) => {
        if (!live) return;
        if (draft) {
          restoreRef.current(draft);
          setMessage("Draft restored from this tablet.");
        }
        setLoadedScope(scope);
      })
      .catch(() => {
        if (!live) return;
        setMessage("Local draft storage is unavailable. Keep this page open.");
        setLoadedScope(scope);
      });
    return () => {
      live = false;
    };
    // Owner identity is represented by scope rather than object identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, form]);

  useEffect(() => {
    if (!owner || loadedScope !== scope) return;
    const timer = setTimeout(() => {
      saveDraft(owner, form, value).catch(() => {
        setMessage("Could not save the draft locally. Keep this page open.");
      });
    }, 200);
    return () => clearTimeout(timer);
  }, [owner, scope, form, loadedScope, value]);

  return {
    ready: !owner || loadedScope === scope,
    message,
  };
}
