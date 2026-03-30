/**
 * Loop closure — match parsed results to pending/awaiting tasks.
 *
 * When a clinician pastes lab results, microbiology, or imaging from the EHR,
 * this module finds tasks that the result might resolve or update.
 */

import type { PastedData, ParsedItem, ParsedLab, ParsedMicro, ParsedImaging } from "./paste-parser";
import type { HandoffItem } from "./handoff-types";

export interface TaskMatch {
  taskId: string;
  parsedItem: ParsedItem;
  action: "resolve" | "update";
  confidence: number;
  summary: string; // e.g. "BCx negative"
}

// ── Keyword extraction ────────────────────────────────────────────────────

/** Normalize text for matching: lowercase, collapse whitespace, strip punctuation */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extract matching keywords from a task's text */
function taskKeywords(text: string): string[] {
  return normalize(text).split(" ").filter((w) => w.length > 1);
}

// ── Micro matching ────────────────────────────────────────────────────────

const MICRO_KEYWORDS: Record<string, string[]> = {
  BCx: ["bcx", "blood culture", "blood cultures", "cultures", "bacteremia"],
  UCx: ["ucx", "urine culture", "ua", "uti", "urine"],
  "Sputum Cx": ["sputum", "sputum culture", "respiratory culture"],
  "Wound Cx": ["wound", "wound culture"],
  "CSF Cx": ["csf", "csf culture", "lumbar puncture", "lp"],
};

function matchMicro(micro: ParsedMicro, tasks: HandoffItem[]): TaskMatch[] {
  const keywords = MICRO_KEYWORDS[micro.source] ?? [normalize(micro.source)];
  const matches: TaskMatch[] = [];

  for (const task of tasks) {
    if (task.status !== "awaiting_result" && task.status !== "pending") continue;
    const taskText = normalize(task.text);
    const overlap = keywords.filter((kw) => taskText.includes(kw));
    if (overlap.length === 0) continue;

    const confidence = Math.min(0.95, 0.6 + overlap.length * 0.15);
    matches.push({
      taskId: task.id,
      parsedItem: micro,
      action: micro.result === "negative" ? "resolve" : "update",
      confidence,
      summary: `${micro.source} ${micro.result}${micro.detail ? ` (${micro.detail.slice(0, 40)})` : ""}`,
    });
  }

  return matches;
}

// ── Lab matching ──────────────────────────────────────────────────────────

const LAB_KEYWORDS: Record<string, string[]> = {
  WBC: ["wbc", "white count", "cbc", "leukocyte"],
  Hgb: ["hgb", "hemoglobin", "cbc", "anemia", "transfuse"],
  Hct: ["hct", "hematocrit", "cbc"],
  Plt: ["plt", "platelets", "cbc", "thrombocytopenia"],
  Cr: ["cr", "creatinine", "renal", "bmp", "cmp", "aki"],
  BUN: ["bun", "renal", "bmp", "cmp"],
  Na: ["na", "sodium", "bmp", "cmp", "hyponatremia"],
  K: ["potassium", "bmp", "cmp", "hyperkalemia"],
  Lac: ["lac", "lactate", "lactic"],
  "T.Bili": ["bili", "bilirubin", "lft", "liver"],
  AST: ["ast", "lft", "liver", "hepatic"],
  ALT: ["alt", "lft", "liver", "hepatic"],
  Trop: ["trop", "troponin", "cardiac", "acs", "mi"],
  BNP: ["bnp", "heart failure", "chf"],
  proBNP: ["probnp", "bnp", "heart failure", "chf"],
  TSH: ["tsh", "thyroid"],
  INR: ["inr", "coag", "anticoagulation", "warfarin"],
  Procalcitonin: ["procal", "procalcitonin", "sepsis", "infection"],
};

function matchLab(lab: ParsedLab, tasks: HandoffItem[]): TaskMatch[] {
  const keywords = LAB_KEYWORDS[lab.name] ?? [normalize(lab.name)];
  const matches: TaskMatch[] = [];

  for (const task of tasks) {
    if (task.status !== "awaiting_result" && task.status !== "pending") continue;
    const taskText = normalize(task.text);

    // Direct lab name match in task text
    const directMatch = taskText.includes(normalize(lab.name));
    const keywordOverlap = keywords.filter((kw) => taskText.includes(kw));

    if (!directMatch && keywordOverlap.length === 0) continue;

    const confidence = directMatch ? 0.85 : Math.min(0.8, 0.5 + keywordOverlap.length * 0.15);
    matches.push({
      taskId: task.id,
      parsedItem: lab,
      action: "update",
      confidence,
      summary: `${lab.name} ${lab.value}${lab.flag ? ` (${lab.flag})` : ""}`,
    });
  }

  return matches;
}

// ── Imaging matching ──────────────────────────────────────────────────────

const IMAGING_KEYWORDS: Record<string, string[]> = {
  CT: ["ct", "cat scan"],
  CXR: ["cxr", "chest xray", "chest x-ray", "chest radiograph"],
  MRI: ["mri", "magnetic resonance"],
  XR: ["xr", "x-ray", "xray", "radiograph"],
  US: ["us", "ultrasound", "sono"],
  ECHO: ["echo", "tte", "tee", "echocardiogram"],
};

function matchImaging(img: ParsedImaging, tasks: HandoffItem[]): TaskMatch[] {
  const keywords = IMAGING_KEYWORDS[img.modality] ?? [normalize(img.modality)];
  const regionWords = normalize(img.region).split(" ").filter((w) => w.length > 1);
  const allKeywords = [...keywords, ...regionWords];
  const matches: TaskMatch[] = [];

  for (const task of tasks) {
    if (task.status !== "awaiting_result" && task.status !== "pending") continue;
    const taskText = normalize(task.text);

    const overlap = allKeywords.filter((kw) => taskText.includes(kw));
    if (overlap.length === 0) continue;

    // Higher confidence if both modality and region match
    const modalityMatch = keywords.some((kw) => taskText.includes(kw));
    const regionMatch = regionWords.some((kw) => taskText.includes(kw));
    const confidence = modalityMatch && regionMatch ? 0.9 : modalityMatch ? 0.7 : 0.5;

    matches.push({
      taskId: task.id,
      parsedItem: img,
      action: "resolve",
      confidence,
      summary: `${img.modality} ${img.region}: ${img.impression.slice(0, 50)}`,
    });
  }

  return matches;
}

// ── Main entry point ──────────────────────────────────────────────────────

/**
 * Match parsed results to tasks. Returns matches sorted by confidence (desc).
 * Only returns the best match per task (no duplicates).
 */
export function matchResultToTasks(
  parsed: PastedData,
  tasks: HandoffItem[],
): TaskMatch[] {
  const allMatches: TaskMatch[] = [];

  for (const item of parsed.items) {
    switch (item.type) {
      case "micro":
        allMatches.push(...matchMicro(item, tasks));
        break;
      case "lab":
        allMatches.push(...matchLab(item, tasks));
        break;
      case "imaging":
        allMatches.push(...matchImaging(item, tasks));
        break;
    }
  }

  // Deduplicate: keep highest confidence match per task
  const bestByTask = new Map<string, TaskMatch>();
  for (const m of allMatches) {
    const existing = bestByTask.get(m.taskId);
    if (!existing || m.confidence > existing.confidence) {
      bestByTask.set(m.taskId, m);
    }
  }

  return Array.from(bestByTask.values()).sort((a, b) => b.confidence - a.confidence);
}
