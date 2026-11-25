import { parseAuthorYearReferences } from "./authorYear";
import { extractDoi } from "./doi";
import type { CitationStyle, Reference } from "./types";

export { extractDoi };

const HEADING = /^\s*(references|bibliography|works cited)\s*:?\s*$/i;

/**
 * Splits pasted text into the body and the reference list. The list starts
 * after the last line that is only a heading such as "References".
 */
export function splitDocument(text: string): { body: string; referenceList: string } {
  const lines = text.split(/\r?\n/);
  let headingAt = -1;
  lines.forEach((line, i) => {
    if (HEADING.test(line)) headingAt = i;
  });
  if (headingAt === -1) {
    return { body: text.trim(), referenceList: "" };
  }
  return {
    body: lines.slice(0, headingAt).join("\n").trim(),
    referenceList: lines.slice(headingAt + 1).join("\n").trim(),
  };
}

const ENTRY_START = /^\s*\[(\d+)\]\s*(.*)$/;

/**
 * Parses the reference list. Numeric style when any entry starts with "[n]",
 * author-year (APA) style otherwise.
 */
export function parseReferences(referenceList: string): {
  style: CitationStyle;
  references: Reference[];
} {
  if (referenceList.split(/\r?\n/).some((line) => ENTRY_START.test(line))) {
    return { style: "numeric", references: parseNumericReferences(referenceList) };
  }
  return { style: "author_year", references: parseAuthorYearReferences(referenceList) };
}

/** Parses entries that each start with their number in brackets, such as "[1]". */
export function parseNumericReferences(referenceList: string): Reference[] {
  const refs: { number: number; parts: string[] }[] = [];
  for (const line of referenceList.split(/\r?\n/)) {
    const start = ENTRY_START.exec(line);
    if (start) {
      refs.push({ number: Number(start[1]), parts: [start[2] ?? ""] });
    } else if (refs.length > 0 && line.trim() !== "") {
      refs.at(-1)?.parts.push(line.trim());
    }
  }
  return refs.map(({ number, parts }) => {
    const raw = parts.join(" ").replace(/\s+/g, " ").trim();
    return { number, raw, doi: extractDoi(raw), label: `[${number}]`, authors: [], year: null };
  });
}
