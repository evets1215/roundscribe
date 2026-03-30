/**
 * Clinical abbreviation expansion engine.
 *
 * Hospitalists type shorthand constantly — "bcx", "cr 1.5", "abx".
 * This module expands them inline on Space or Tab, like autocorrect
 * but for medical terms. Silent when there's no match.
 */

/** Canonical expansions for common clinical abbreviations */
export const ABBREVIATION_MAP: Record<string, string> = {
  // Labs — chemistry
  cr: "Cr",
  bun: "BUN",
  na: "Na",
  k: "K",
  ca: "Ca",
  mg: "Mg",
  phos: "Phos",
  alb: "Alb",
  gluc: "Gluc",
  lac: "Lac",

  // Labs — heme
  wbc: "WBC",
  hgb: "Hgb",
  hct: "Hct",
  plt: "Plt",
  inr: "INR",
  ptt: "PTT",

  // Labs — liver
  ast: "AST",
  alt: "ALT",
  tbili: "T.Bili",
  dbili: "D.Bili",
  alkphos: "Alk Phos",
  ggt: "GGT",

  // Labs — cardiac
  trop: "Trop",
  bnp: "BNP",
  probnp: "proBNP",

  // Labs — other
  tsh: "TSH",
  hba1c: "HbA1c",
  a1c: "A1c",
  esr: "ESR",
  crp: "CRP",
  procal: "Procalcitonin",

  // Cultures
  bcx: "BCx",
  ucx: "UCx",
  spcx: "Sputum Cx",
  cxr: "CXR",

  // Vitals
  hr: "HR",
  bp: "BP",
  rr: "RR",
  spo2: "SpO2",
  temp: "Temp",

  // Imaging
  ct: "CT",
  mri: "MRI",
  us: "US",
  xr: "XR",
  echo: "Echo",
  tte: "TTE",
  tee: "TEE",

  // Medications / treatments
  abx: "antibiotics",
  ppx: "prophylaxis",
  dvtppx: "DVT prophylaxis",
  vte: "VTE",
  ivf: "IVF",
  prn: "PRN",
  bid: "BID",
  tid: "TID",
  qid: "QID",
  qd: "daily",
  qhs: "QHS",
  qod: "every other day",
  npo: "NPO",
  po: "PO",
  iv: "IV",
  im: "IM",
  sq: "SubQ",
  sl: "SL",

  // Clinical shorthand
  dc: "discharge",
  dispo: "disposition",
  hd: "hospital day",
  pod: "POD",
  sob: "SOB",
  doi: "DOI",
  cp: "chest pain",
  ha: "headache",
  n: "nausea",
  v: "vomiting",
  d: "diarrhea",
  abd: "abdominal",
  ams: "AMS",
  loc: "LOC",
  wdwn: "well-developed well-nourished",
  aox3: "A&Ox3",
  nsr: "NSR",
  rrr: "RRR",
  ctab: "CTAB",
  ntnd: "NT/ND",
  cta: "CTA",

  // Consults / services
  id: "ID",
  gi: "GI",
  cards: "Cardiology",
  pulm: "Pulmonology",
  neph: "Nephrology",
  neuro: "Neurology",
  ortho: "Orthopedics",
  ent: "ENT",
  ir: "IR",
  sw: "Social Work",
  pt: "PT",
  ot: "OT",
  cm: "Case Management",

  // Follow-up
  "f/u": "follow up",
  fu: "follow up",
  rpt: "repeat",
  recheck: "recheck",
};

/**
 * Patterns where an abbreviation is followed by a numeric value.
 * "cr 1.5" → "Cr 1.5", "hgb 7.2" → "Hgb 7.2"
 */
const VALUE_ABBREVS = new Set([
  "cr", "hgb", "wbc", "na", "k", "ca", "inr", "bun", "plt",
  "mg", "phos", "alb", "gluc", "lac", "ast", "alt", "trop",
  "bnp", "tsh", "hba1c", "a1c", "esr", "crp", "hr", "bp",
  "rr", "spo2", "temp", "hct", "ptt", "tbili", "ggt",
]);

export interface Expansion {
  /** New full text after expansion */
  text: string;
  /** New cursor position */
  cursor: number;
  /** What was expanded (for potential inline hint) */
  from: string;
  to: string;
}

/**
 * Try to expand the word immediately before the cursor.
 *
 * Call this on Space or Tab keydown. If there's a match, returns the
 * new text and cursor position. If no match, returns null (let the
 * key event proceed normally).
 */
export function expandAtCursor(
  text: string,
  cursorPos: number,
): Expansion | null {
  // Find the word (or word+space+number) behind the cursor
  const before = text.slice(0, cursorPos);
  const after = text.slice(cursorPos);

  // Try value-attached pattern first: "cr 1.5" or "hgb 7.2"
  const valueMatch = before.match(/(\S+)\s+([\d.]+)$/);
  if (valueMatch) {
    const abbr = valueMatch[1].toLowerCase();
    if (VALUE_ABBREVS.has(abbr) && ABBREVIATION_MAP[abbr]) {
      const expanded = ABBREVIATION_MAP[abbr];
      const replacement = `${expanded} ${valueMatch[2]}`;
      const start = cursorPos - valueMatch[0].length;
      const newText = text.slice(0, start) + replacement + after;
      const newCursor = start + replacement.length;
      return { text: newText, cursor: newCursor, from: valueMatch[0], to: replacement };
    }
  }

  // Try simple word expansion: "bcx" → "BCx"
  const wordMatch = before.match(/(\S+)$/);
  if (wordMatch) {
    const abbr = wordMatch[1].toLowerCase();
    const expanded = ABBREVIATION_MAP[abbr];
    if (expanded && expanded.toLowerCase() !== abbr) {
      const start = cursorPos - wordMatch[1].length;
      const newText = text.slice(0, start) + expanded + after;
      const newCursor = start + expanded.length;
      return { text: newText, cursor: newCursor, from: wordMatch[1], to: expanded };
    }
  }

  return null;
}
