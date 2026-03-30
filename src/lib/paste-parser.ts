/**
 * Paste parser for structured EHR output.
 *
 * When a physician pastes lab results, micro reports, or imaging findings
 * from Epic/Cerner, this module detects and extracts structured data.
 * All regex-based, no LLM needed — EHR output is deterministic.
 */

export interface ParsedLab {
  type: "lab";
  name: string;
  value: string;
  unit?: string;
  flag?: "H" | "L" | "C";
}

export interface ParsedMicro {
  type: "micro";
  source: string;
  result: string;
  detail?: string;
}

export interface ParsedImaging {
  type: "imaging";
  modality: string;
  region: string;
  impression: string;
}

export type ParsedItem = ParsedLab | ParsedMicro | ParsedImaging;

export interface PastedData {
  items: ParsedItem[];
  summary: string; // Human-readable one-liner: "WBC 12.4, Cr 1.5, BCx negative"
  raw: string;
}

// ── Lab parsing ─────────────────────────────────────────────────────────────

/** Common lab name aliases → canonical name */
const LAB_ALIASES: Record<string, string> = {
  "white blood cell": "WBC", wbc: "WBC", "white count": "WBC",
  hemoglobin: "Hgb", hgb: "Hgb", hb: "Hgb",
  hematocrit: "Hct", hct: "Hct",
  platelet: "Plt", plt: "Plt", platelets: "Plt",
  creatinine: "Cr", cr: "Cr", creat: "Cr",
  bun: "BUN", "blood urea nitrogen": "BUN",
  sodium: "Na", na: "Na",
  potassium: "K", k: "K",
  calcium: "Ca", ca: "Ca",
  magnesium: "Mg", mg: "Mg",
  phosphorus: "Phos", phos: "Phos", phosphate: "Phos",
  albumin: "Alb", alb: "Alb",
  glucose: "Gluc", gluc: "Gluc",
  lactate: "Lac", lac: "Lac", lactic: "Lac",
  ast: "AST", sgot: "AST",
  alt: "ALT", sgpt: "ALT",
  "total bilirubin": "T.Bili", tbili: "T.Bili", "t. bili": "T.Bili",
  "direct bilirubin": "D.Bili", dbili: "D.Bili",
  "alk phos": "Alk Phos", "alkaline phosphatase": "Alk Phos", alkphos: "Alk Phos",
  inr: "INR",
  ptt: "PTT", aptt: "PTT",
  troponin: "Trop", trop: "Trop", "troponin i": "Trop", "troponin t": "Trop",
  bnp: "BNP", "nt-probnp": "proBNP", probnp: "proBNP",
  tsh: "TSH",
  hba1c: "HbA1c", a1c: "A1c",
  esr: "ESR",
  crp: "CRP",
  procalcitonin: "Procalcitonin", procal: "Procalcitonin",
  ggt: "GGT",
};

/**
 * Parse lab values from pasted text.
 * Handles formats:
 *   "WBC 12.4"
 *   "Cr: 1.5 mg/dL"
 *   "Hgb  7.2 (L)"
 *   "Na 138, K 4.2, Cl 101"
 *   "BUN/Cr 22/1.5"
 */
export function parseLabPanel(text: string): ParsedLab[] {
  const results: ParsedLab[] = [];

  // BUN/Cr compound pattern
  const bunCrMatch = text.match(/bun\s*\/\s*cr(?:eat(?:inine)?)?\s*[:\s]+(\d+\.?\d*)\s*\/\s*(\d+\.?\d*)/i);
  if (bunCrMatch) {
    results.push({ type: "lab", name: "BUN", value: bunCrMatch[1] });
    results.push({ type: "lab", name: "Cr", value: bunCrMatch[2] });
  }

  // General pattern: LabName [:]  Value [Unit] [(Flag)]
  const labPattern = /(?:^|[,;\n\s])(\b[a-z][a-z ./-]{1,25})\s*[:=]?\s*(\d+\.?\d*)\s*(%|mg\/d[lL]|g\/d[lL]|m?mol\/[lL]|mEq\/[lL]|K\/uL|x10[³3]\/[uμ]L|ng\/mL|pg\/mL|mIU\/mL|sec|seconds|IU\/[lL])?\s*(?:\(([HLC])\))?/gi;

  let match;
  while ((match = labPattern.exec(text)) !== null) {
    const rawName = match[1].trim().toLowerCase();
    const canonical = LAB_ALIASES[rawName];
    if (canonical) {
      // Avoid duplicates from the BUN/Cr compound parse
      if (!results.some((r) => r.name === canonical && r.value === match![2])) {
        results.push({
          type: "lab",
          name: canonical,
          value: match[2],
          unit: match[3] || undefined,
          flag: (match[4] as "H" | "L" | "C") || undefined,
        });
      }
    }
  }

  return results;
}

// ── Micro parsing ───────────────────────────────────────────────────────────

/**
 * Parse microbiology results.
 * Handles:
 *   "BCx: no growth at 24h"
 *   "Blood culture: POSITIVE — Staph aureus"
 *   "UCx: >100K E. coli"
 *   "Sputum Cx: normal flora"
 */
export function parseMicroResults(text: string): ParsedMicro[] {
  const results: ParsedMicro[] = [];

  const microPattern = /(?:^|[,;\n])\s*((?:blood|urine|sputum|wound|csf|peritoneal|bal)\s*(?:cx|culture|c\/s)|bcx|ucx|spcx|wdcx)\s*[:\-—]+\s*(.+?)(?=[,;\n]|$)/gi;

  let match;
  while ((match = microPattern.exec(text)) !== null) {
    const rawSource = match[1].trim().toLowerCase();
    let source = rawSource;
    if (rawSource.includes("blood") || rawSource === "bcx") source = "BCx";
    else if (rawSource.includes("urine") || rawSource === "ucx") source = "UCx";
    else if (rawSource.includes("sputum") || rawSource === "spcx") source = "Sputum Cx";
    else if (rawSource.includes("wound") || rawSource === "wdcx") source = "Wound Cx";
    else if (rawSource.includes("csf")) source = "CSF Cx";

    const resultText = match[2].trim();
    const isNegative = /no growth|negative|normal flora|no organism/i.test(resultText);
    const result = isNegative ? "negative" : "positive";

    results.push({
      type: "micro",
      source,
      result,
      detail: resultText,
    });
  }

  return results;
}

// ── Imaging parsing ─────────────────────────────────────────────────────────

/**
 * Parse imaging report impressions.
 * Handles:
 *   "CT A/P: no acute findings"
 *   "CXR: bilateral pleural effusions"
 *   "MRI Brain: no acute infarct"
 */
export function parseImagingReport(text: string): ParsedImaging[] {
  const results: ParsedImaging[] = [];

  const imagingPattern = /(?:^|[;\n])\s*(ct|cxr|mri|xr|x-ray|us|ultrasound|echo|tte|tee)\s+([\w /&]+?)\s*[:\-—]+\s*(.+?)(?=[;\n]|$)/gi;

  let match;
  while ((match = imagingPattern.exec(text)) !== null) {
    const modality = match[1].toUpperCase();
    results.push({
      type: "imaging",
      modality: modality === "X-RAY" ? "XR" : modality,
      region: match[2].trim(),
      impression: match[3].trim(),
    });
  }

  return results;
}

// ── Main entry point ────────────────────────────────────────────────────────

/**
 * Run all parsers on pasted text. Returns structured data + summary string.
 */
export function parsePastedText(text: string): PastedData {
  const labs = parseLabPanel(text);
  const micros = parseMicroResults(text);
  const imaging = parseImagingReport(text);
  const items: ParsedItem[] = [...labs, ...micros, ...imaging];

  const parts: string[] = [];
  for (const lab of labs) parts.push(`${lab.name} ${lab.value}`);
  for (const m of micros) parts.push(`${m.source} ${m.result}`);
  for (const img of imaging) parts.push(`${img.modality}: ${img.impression.slice(0, 40)}`);

  return {
    items,
    summary: parts.length > 0 ? parts.join(", ") : "",
    raw: text,
  };
}
