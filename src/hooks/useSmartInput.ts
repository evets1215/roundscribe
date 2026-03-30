"use client";

import { useCallback, useRef, useState } from "react";
import { expandAtCursor } from "@/lib/clinical-abbreviations";
import { parsePastedText, type PastedData } from "@/lib/paste-parser";

export interface SmartInputCallbacks {
  onExpand?: (from: string, to: string) => void;
  onPaste?: (data: PastedData) => void;
}

export interface SmartInputResult {
  /**
   * Wrap an input's onKeyDown. Call BEFORE any existing handler.
   * Returns true if the event was handled (abbreviation expanded).
   */
  handleKeyDown: (
    e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    getText: () => string,
    setText: (v: string) => void,
  ) => boolean;

  /**
   * Attach to onPaste on textareas. Parses structured EHR data.
   */
  handlePaste: (
    e: React.ClipboardEvent<HTMLTextAreaElement>,
  ) => void;

  /** Current paste confirmation message (auto-clears after 3s) */
  pasteConfirmation: string | null;
}

/**
 * Composable smart input hook — abbreviation expansion + paste parsing.
 *
 * Usage:
 *   const smart = useSmartInput({ onExpand, onPaste });
 *   <input onKeyDown={(e) => { if (!smart.handleKeyDown(e, getText, setText)) existingHandler(e); }} />
 *   <textarea onPaste={smart.handlePaste} />
 */
export function useSmartInput(opts: SmartInputCallbacks = {}): SmartInputResult {
  const [pasteConfirmation, setPasteConfirmation] = useState<string | null>(null);
  const pasteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleKeyDown = useCallback(
    (
      e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
      getText: () => string,
      setText: (v: string) => void,
    ): boolean => {
      // Only expand on Space (not Tab — Tab has indent behavior in textareas)
      if (e.key !== " ") return false;

      const el = e.currentTarget;
      const cursorPos = el.selectionStart ?? getText().length;

      const expansion = expandAtCursor(getText(), cursorPos);
      if (!expansion) return false;

      // Prevent the space from being inserted (we add it ourselves)
      e.preventDefault();
      setText(expansion.text.slice(0, expansion.cursor) + " " + expansion.text.slice(expansion.cursor));
      const newPos = expansion.cursor + 1; // after the space

      requestAnimationFrame(() => {
        el.setSelectionRange(newPos, newPos);
      });

      opts.onExpand?.(expansion.from, expansion.to);
      return true;
    },
    [opts],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const text = e.clipboardData.getData("text/plain");
      if (!text || text.length < 5) return; // too short to be structured

      const parsed = parsePastedText(text);
      if (parsed.items.length === 0) return; // no structured data detected

      // Don't prevent default — let the text paste normally.
      // Show inline confirmation of what was detected.
      opts.onPaste?.(parsed);

      if (pasteTimer.current) clearTimeout(pasteTimer.current);
      setPasteConfirmation(`Parsed: ${parsed.summary}`);
      pasteTimer.current = setTimeout(() => setPasteConfirmation(null), 3000);
    },
    [opts],
  );

  return { handleKeyDown, handlePaste, pasteConfirmation };
}
