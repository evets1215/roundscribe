"use client";

import { useEffect, useCallback } from "react";

export interface KeyboardShortcutHandlers {
  /** Navigate to previous patient (j or ArrowDown) */
  onNextPatient?: () => void;
  /** Navigate to next patient (k or ArrowUp) */
  onPrevPatient?: () => void;
  /** Copy handoff to clipboard (Cmd+H) */
  onCopyHandoff?: () => void;
  /** Focus free-text input or create new note (Cmd+N) */
  onNewNote?: () => void;
  /** Generate progress note (Cmd+G) */
  onGenerate?: () => void;
  /** Go back / close modal (Escape) */
  onEscape?: () => void;
}

/**
 * Global keyboard shortcut handler for the workspace.
 *
 * Shortcuts are only active when no input/textarea is focused (except Cmd+ shortcuts
 * which work regardless).
 */
export function useKeyboardShortcuts(handlers: KeyboardShortcutHandlers) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;
      const meta = e.metaKey || e.ctrlKey;

      // Cmd/Ctrl shortcuts — work even when input is focused
      if (meta && !e.shiftKey) {
        switch (e.key.toLowerCase()) {
          case "h":
            if (handlers.onCopyHandoff) {
              e.preventDefault();
              handlers.onCopyHandoff();
            }
            return;
          case "n":
            if (handlers.onNewNote) {
              e.preventDefault();
              handlers.onNewNote();
            }
            return;
          case "g":
            if (handlers.onGenerate) {
              e.preventDefault();
              handlers.onGenerate();
            }
            return;
        }
      }

      // Non-input shortcuts — only when no input is focused
      if (!isInput) {
        switch (e.key) {
          case "j":
          case "ArrowDown":
            if (handlers.onNextPatient) {
              e.preventDefault();
              handlers.onNextPatient();
            }
            return;
          case "k":
          case "ArrowUp":
            if (handlers.onPrevPatient) {
              e.preventDefault();
              handlers.onPrevPatient();
            }
            return;
        }
      }

      // Escape — always works
      if (e.key === "Escape" && handlers.onEscape) {
        handlers.onEscape();
      }
    },
    [handlers],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
