import type { Reference } from "./types";

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

const DOI = /10\.\d{4,9}\/[^\s"<>]+/;

/** Removes punctuation that ends the sentence around a DOI but is not part of it. */
function trimDoi(doi: string): string {
  let out = doi;
  for (;;) {
    const last = out.at(-1);
    if (last === undefined) return out;
    if (".,;:".includes(last)) {
      out = out.slice(0, -1);
      continue;
    }
    const pair = last === ")" ? "(" : last === "]" ? "[" : null;
    if (pair && count(out, last) > count(out, pair)) {
      out = out.slice(0, -1);
      continue;
    }
    return out;
  }
}

function count(text: string, ch: string): number {
  return text.split(ch).length - 1;
}

/** Finds a DOI written bare, after "doi:", or inside a doi.org link. */
export function extractDoi(entry: string): string | null {
  const match = DOI.exec(entry);
  return match ? trimDoi(match[0]) : null;
}

const ENTRY_START = /^\s*\[(\d+)\]\s*(.*)$/;

/** Parses entries that each start with their number in brackets, such as "[1]". */
export function parseReferences(referenceList: string): Reference[] {
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
    return { number, raw, doi: extractDoi(raw) };
  });
}
