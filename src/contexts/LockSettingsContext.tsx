"use client";

/**
 * LockSettingsContext — configurable screen-lock timeouts (Issue #101)
 *
 * Persists idle timeout and "tab hidden" lock delay in localStorage for
 * instant read and no server round-trip. Syncs across tabs via storage event.
 * Used by InactivityLock and Settings > Security.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const LS_KEY = "ds_lock_settings";

export type LockSettings = {
  /** Minutes of no activity before lock (1–120). */
  idleTimeoutMinutes: number;
  /** Minutes tab can be in background before lock (1–30). */
  hiddenLockDelayMinutes: number;
};

const DEFAULTS: LockSettings = {
  idleTimeoutMinutes: 45,
  hiddenLockDelayMinutes: 5,
};

const IDLE_MIN = 1;
const IDLE_MAX = 120;
const HIDDEN_MIN = 1;
const HIDDEN_MAX = 30;

function clampIdle(m: number): number {
  return Math.max(IDLE_MIN, Math.min(IDLE_MAX, Math.round(m)));
}
function clampHidden(m: number): number {
  return Math.max(HIDDEN_MIN, Math.min(HIDDEN_MAX, Math.round(m)));
}

function loadSettings(): LockSettings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LockSettings>;
      return {
        idleTimeoutMinutes: clampIdle(parsed.idleTimeoutMinutes ?? DEFAULTS.idleTimeoutMinutes),
        hiddenLockDelayMinutes: clampHidden(
          parsed.hiddenLockDelayMinutes ?? DEFAULTS.hiddenLockDelayMinutes,
        ),
      };
    }
  } catch {
    // ignore
  }
  return DEFAULTS;
}

function saveSettings(settings: LockSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

type LockSettingsContextValue = {
  /** Idle timeout in milliseconds. */
  idleTimeoutMs: number;
  /** Hidden lock delay in milliseconds. */
  hiddenLockDelayMs: number;
  /** Raw settings (minutes) for forms. */
  settings: LockSettings;
  /** Update and persist settings. Partial updates merged with current. */
  updateSettings: (partial: Partial<LockSettings>) => void;
};

const LockSettingsContext = createContext<LockSettingsContextValue | null>(null);

export function LockSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<LockSettings>(DEFAULTS);

  // Hydrate from localStorage on mount and when storage event fires (other tab).
  useEffect(() => {
    setSettings(loadSettings());
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue) as Partial<LockSettings>;
          setSettings((prev) => ({
            idleTimeoutMinutes: clampIdle(parsed.idleTimeoutMinutes ?? prev.idleTimeoutMinutes),
            hiddenLockDelayMinutes: clampHidden(
              parsed.hiddenLockDelayMinutes ?? prev.hiddenLockDelayMinutes,
            ),
          }));
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const updateSettings = useCallback((partial: Partial<LockSettings>) => {
    setSettings((prev) => {
      const next: LockSettings = {
        idleTimeoutMinutes:
          partial.idleTimeoutMinutes !== undefined
            ? clampIdle(partial.idleTimeoutMinutes)
            : prev.idleTimeoutMinutes,
        hiddenLockDelayMinutes:
          partial.hiddenLockDelayMinutes !== undefined
            ? clampHidden(partial.hiddenLockDelayMinutes)
            : prev.hiddenLockDelayMinutes,
      };
      saveSettings(next);
      return next;
    });
  }, []);

  const value = useMemo<LockSettingsContextValue>(
    () => ({
      idleTimeoutMs: settings.idleTimeoutMinutes * 60 * 1000,
      hiddenLockDelayMs: settings.hiddenLockDelayMinutes * 60 * 1000,
      settings,
      updateSettings,
    }),
    [settings, updateSettings],
  );

  return (
    <LockSettingsContext.Provider value={value}>
      {children}
    </LockSettingsContext.Provider>
  );
}

export function useLockSettings(): LockSettingsContextValue {
  const ctx = useContext(LockSettingsContext);
  if (!ctx) {
    // Fallback when used outside provider (e.g. InactivityLock before provider mounts).
    return {
      idleTimeoutMs: DEFAULTS.idleTimeoutMinutes * 60 * 1000,
      hiddenLockDelayMs: DEFAULTS.hiddenLockDelayMinutes * 60 * 1000,
      settings: DEFAULTS,
      updateSettings: () => {},
    };
  }
  return ctx;
}

export { DEFAULTS, IDLE_MIN, IDLE_MAX, HIDDEN_MIN, HIDDEN_MAX };
