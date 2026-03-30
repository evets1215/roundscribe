// Shared handoff types, constants, and utilities
// Single source of truth — consumed by dashboard (page.tsx) and patient detail ([id]/page.tsx)

export type TaskStatus = "pending" | "awaiting_result" | "done" | "carry_forward" | "resolved";

export interface HandoffItem {
  id: string;
  dbId?: string; // server-side HandoffTask.id — set after sync
  text: string;
  status: TaskStatus;
  source?: "manual" | "parsed" | "paste";
  sortOrder?: number;
  createdAt?: number;
}

export interface HandoffData {
  items: HandoffItem[];
  note: string;
}

export const STATUS_CYCLE: TaskStatus[] = ["pending", "done", "awaiting_result", "carry_forward"];

export const STATUS_ICON: Record<TaskStatus, string> = {
  pending:         "radio_button_unchecked",
  done:            "check_circle",
  awaiting_result: "hourglass_empty",
  carry_forward:   "arrow_forward",
  resolved:        "cancel",
};

export const STATUS_COLOR: Record<TaskStatus, string> = {
  pending:         "var(--color-on-surface-variant)",
  done:            "#16a34a",
  awaiting_result: "var(--color-amber, #d97706)",
  carry_forward:   "var(--color-primary)",
  resolved:        "var(--color-outline)",
};

/** Migrate a single legacy item (boolean `done` field) to status-based format */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function migrateItem(raw: any): HandoffItem {
  if (raw.status) return raw as HandoffItem;
  return {
    id: raw.id,
    text: raw.text,
    status: raw.done ? "done" : "pending",
    createdAt: raw.createdAt,
  } as HandoffItem;
}

/** Migrate an array of legacy items */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function migrateItems(items: any[]): HandoffItem[] {
  return items.map(migrateItem);
}

/** Keyboard handler for free-text note textareas: Tab indent, Shift+Tab dedent, Enter with auto-indent */
export function handleNoteKeyDown(
  e: React.KeyboardEvent<HTMLTextAreaElement>,
  setValue: (v: string) => void,
) {
  const ta = e.currentTarget;
  const { selectionStart, selectionEnd, value } = ta;

  if (e.key === "Tab") {
    e.preventDefault();
    if (e.shiftKey) {
      const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
      const spaces = value.slice(lineStart).match(/^ {1,2}/)?.[0].length ?? 0;
      if (spaces > 0) {
        const next = value.slice(0, lineStart) + value.slice(lineStart + spaces);
        setValue(next);
        requestAnimationFrame(() => {
          ta.setSelectionRange(
            Math.max(lineStart, selectionStart - spaces),
            Math.max(lineStart, selectionEnd - spaces),
          );
        });
      }
    } else {
      const next = value.slice(0, selectionStart) + "  " + value.slice(selectionEnd);
      setValue(next);
      requestAnimationFrame(() => ta.setSelectionRange(selectionStart + 2, selectionStart + 2));
    }
    return;
  }

  if (e.key === "Enter") {
    e.preventDefault();
    const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
    const indent = value.slice(lineStart).match(/^[ \t]*/)?.[0] ?? "";
    const insert = "\n" + indent;
    const next = value.slice(0, selectionStart) + insert + value.slice(selectionEnd);
    setValue(next);
    const newPos = selectionStart + insert.length;
    requestAnimationFrame(() => {
      ta.setSelectionRange(newPos, newPos);
      ta.style.height = "auto";
      ta.style.height = `${ta.scrollHeight}px`;
    });
    return;
  }
}
