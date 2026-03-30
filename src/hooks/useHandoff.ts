"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  type TaskStatus,
  type HandoffItem,
  type HandoffData,
  STATUS_CYCLE,
  migrateItems,
} from "@/lib/handoff-types";

const STORAGE_KEY = "rs-handoff";
const SYNC_DEBOUNCE_MS = 500;

// ── localStorage helpers (cache layer) ────────────────────────────────────

function loadAll(): Record<string, HandoffData> {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const raw = JSON.parse(saved) as Record<string, unknown>;
      const migrated: Record<string, HandoffData> = {};
      for (const [k, v] of Object.entries(raw)) {
        const val = v as HandoffData;
        migrated[k] = { ...val, items: migrateItems(val.items ?? []) };
      }
      return migrated;
    }
  } catch {}
  return {};
}

function persistAll(data: Record<string, HandoffData>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

// ── Server sync helpers ───────────────────────────────────────────────────

interface ServerTask {
  id: string;
  patientId: string;
  text: string;
  status: string;
  source: string;
  sortOrder: number;
  dayNumber: number;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolvedNote: string | null;
  createdAt: string;
  updatedAt: string;
}

function serverTaskToItem(t: ServerTask): HandoffItem {
  return {
    id: `db-${t.id}`,
    dbId: t.id,
    text: t.text,
    status: t.status as TaskStatus,
    source: t.source as HandoffItem["source"],
    sortOrder: t.sortOrder,
    createdAt: new Date(t.createdAt).getTime(),
  };
}

async function fetchTasks(patientId: string): Promise<HandoffItem[]> {
  try {
    const res = await fetch(`/api/patients/${patientId}/tasks`);
    if (!res.ok) return [];
    const tasks: ServerTask[] = await res.json();
    return tasks.map(serverTaskToItem);
  } catch {
    return [];
  }
}

async function createTaskOnServer(
  patientId: string,
  item: HandoffItem,
): Promise<ServerTask | null> {
  try {
    const res = await fetch(`/api/patients/${patientId}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: item.text,
        status: item.status,
        source: item.source ?? "manual",
        sortOrder: item.sortOrder ?? 0,
      }),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function syncTasksToServer(
  patientId: string,
  items: HandoffItem[],
): Promise<void> {
  // Only sync items that have a dbId (already persisted)
  const patches = items
    .filter((i) => i.dbId)
    .map((i, idx) => ({
      id: i.dbId!,
      text: i.text,
      status: i.status,
      sortOrder: idx,
    }));

  if (patches.length === 0) return;

  try {
    await fetch(`/api/patients/${patientId}/tasks`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patches),
    });
  } catch {}
}

async function deleteTaskOnServer(
  patientId: string,
  dbId: string,
): Promise<void> {
  try {
    await fetch(`/api/patients/${patientId}/tasks?taskId=${dbId}`, {
      method: "DELETE",
    });
  } catch {}
}

// ── Hook ──────────────────────────────────────────────────────────────────

/**
 * Shared handoff state hook — server-first with localStorage cache.
 *
 * Two usage modes:
 * 1. **Dashboard (multi-patient):** call with no args → manages all patients
 * 2. **Patient detail (single-patient):** call with `patientId` → auto-fetches from server
 *
 * Server is authoritative. localStorage provides fast initial load + cross-tab sync.
 */
export function useHandoff(patientId?: string) {
  const [all, setAll] = useState<Record<string, HandoffData>>(loadAll);
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!patientId);
  const skipNextSave = useRef(false);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSyncPatients = useRef<Set<string>>(new Set());

  // Persist to localStorage on change
  useEffect(() => {
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    persistAll(all);
  }, [all]);

  // Cross-tab sync
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      try {
        const raw = JSON.parse(e.newValue) as Record<string, unknown>;
        const migrated: Record<string, HandoffData> = {};
        for (const [k, v] of Object.entries(raw)) {
          const val = v as HandoffData;
          migrated[k] = { ...val, items: migrateItems(val.items ?? []) };
        }
        skipNextSave.current = true;
        setAll(migrated);
      } catch {}
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  // Focus effect
  useEffect(() => {
    if (!pendingFocusId) return;
    const el = document.getElementById(`hi-${pendingFocusId}`) as HTMLInputElement | null;
    if (el) { el.focus(); el.setSelectionRange(0, 0); }
    setPendingFocusId(null);
  }, [pendingFocusId]);

  // Fetch from server when patientId is provided
  useEffect(() => {
    if (!patientId) return;
    let cancelled = false;
    setLoading(true);

    fetchTasks(patientId).then((serverItems) => {
      if (cancelled) return;
      if (serverItems.length > 0) {
        setAll((prev) => ({
          ...prev,
          [patientId]: { items: serverItems, note: prev[patientId]?.note ?? "" },
        }));
      }
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [patientId]);

  // Debounced server sync
  const scheduleSyncForPatient = useCallback((pid: string) => {
    pendingSyncPatients.current.add(pid);
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      const patients = Array.from(pendingSyncPatients.current);
      pendingSyncPatients.current.clear();
      // Read current state at sync time
      setAll((current) => {
        for (const p of patients) {
          const d = current[p];
          if (d) syncTasksToServer(p, d.items);
        }
        return current; // no state change, just reading
      });
    }, SYNC_DEBOUNCE_MS);
  }, []);

  // Sync on visibility change (user switching tabs/leaving)
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === "hidden" && pendingSyncPatients.current.size > 0) {
        const patients = Array.from(pendingSyncPatients.current);
        pendingSyncPatients.current.clear();
        if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
        // Use current state from localStorage (can't await setAll in visibilitychange)
        const current = loadAll();
        for (const p of patients) {
          const d = current[p];
          if (d) syncTasksToServer(p, d.items);
        }
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  const getHandoff = useCallback(
    (pid: string): HandoffData => all[pid] ?? { items: [], note: "" },
    [all],
  );

  const updateItem = useCallback((pid: string, itemId: string, text: string) => {
    setAll((prev) => {
      const d = prev[pid] ?? { items: [], note: "" };
      return { ...prev, [pid]: { ...d, items: d.items.map((i) => i.id === itemId ? { ...i, text } : i) } };
    });
    scheduleSyncForPatient(pid);
  }, [scheduleSyncForPatient]);

  const cycleStatus = useCallback((pid: string, itemId: string) => {
    setAll((prev) => {
      const d = prev[pid] ?? { items: [], note: "" };
      return {
        ...prev,
        [pid]: {
          ...d,
          items: d.items.map((i) => {
            if (i.id !== itemId) return i;
            const idx = STATUS_CYCLE.indexOf(i.status);
            return { ...i, status: STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length] };
          }),
        },
      };
    });
    scheduleSyncForPatient(pid);
  }, [scheduleSyncForPatient]);

  const updateNote = useCallback((pid: string, note: string) => {
    setAll((prev) => {
      const d = prev[pid] ?? { items: [], note: "" };
      return { ...prev, [pid]: { ...d, note } };
    });
  }, []);

  const addItem = useCallback((pid: string, afterId?: string, initialText = "") => {
    const tempId = `h-${Date.now()}-${Math.random()}`;
    const newItem: HandoffItem = {
      id: tempId,
      text: initialText,
      status: "pending" as TaskStatus,
      source: "manual",
      createdAt: Date.now(),
    };

    setAll((prev) => {
      const d = prev[pid] ?? { items: [], note: "" };
      if (afterId) {
        const idx = d.items.findIndex((i) => i.id === afterId);
        const next = [...d.items];
        next.splice(idx + 1, 0, newItem);
        return { ...prev, [pid]: { ...d, items: next } };
      }
      return { ...prev, [pid]: { ...d, items: [...d.items, newItem] } };
    });
    setPendingFocusId(tempId);

    // Create on server, then update local item with dbId
    createTaskOnServer(pid, newItem).then((serverTask) => {
      if (!serverTask) return;
      setAll((prev) => {
        const d = prev[pid];
        if (!d) return prev;
        return {
          ...prev,
          [pid]: {
            ...d,
            items: d.items.map((i) =>
              i.id === tempId ? { ...i, dbId: serverTask.id, id: `db-${serverTask.id}` } : i,
            ),
          },
        };
      });
    });
  }, []);

  const removeItem = useCallback((pid: string, itemId: string) => {
    setAll((prev) => {
      const d = prev[pid] ?? { items: [], note: "" };
      if (d.items.length <= 1) return prev;
      const item = d.items.find((i) => i.id === itemId);
      const idx = d.items.findIndex((i) => i.id === itemId);
      const next = d.items.filter((i) => i.id !== itemId);
      setPendingFocusId(next[Math.max(0, idx - 1)]?.id ?? null);

      // Delete on server
      if (item?.dbId) deleteTaskOnServer(pid, item.dbId);

      return { ...prev, [pid]: { ...d, items: next } };
    });
  }, []);

  /** Bulk-set items + note for a patient (used by patient detail page on initial load) */
  const setPatientHandoff = useCallback((pid: string, data: HandoffData) => {
    setAll((prev) => ({ ...prev, [pid]: data }));
  }, []);

  /** Direct setter for Enter-key splits and other atomic updates */
  const setAllHandoff = useCallback(
    (updater: React.SetStateAction<Record<string, HandoffData>>) => {
      setAll((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        // Find which patients changed and schedule sync
        for (const pid of Object.keys(next)) {
          if (next[pid] !== prev[pid]) {
            scheduleSyncForPatient(pid);
          }
        }
        return next;
      });
    },
    [scheduleSyncForPatient],
  );

  return {
    all,
    loading,
    getHandoff,
    updateItem,
    cycleStatus,
    updateNote,
    addItem,
    removeItem,
    setPatientHandoff,
    setAllHandoff,
    pendingFocusId,
    setPendingFocusId,
  };
}
