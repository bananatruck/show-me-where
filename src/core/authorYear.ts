import { extractDoi } from "./doi";
import type { Reference } from "./types";

/** A citation found in a sentence: its span, the references it resolves to, and its form. */
export interface Citation {
  start: number;
  end: number;
  refs: number[];
  /** True for "Smith (2020) found..." where the citation is part of the sentence. */
  narrative: boolean;
}

const YEAR = String.raw`(?:\d{4}[a-z]?|n\.d\.)`;
const YEAR_ONLY = new RegExp(`^${YEAR}$`);
const ENTRY_START = new RegExp(String.raw`^(\S[^(]*?)\s*\(\s*(${YEAR})\s*\)`);
const INITIALS = /^(?:[A-Z]\.(?:\s*-?\s*[A-Z]\.)*|Jr\.?|Sr\.?|\.\.\.|\u2026)$/;
const PAGES = /^(?:pp?\.|para\.|chap\.)\s*\S+$/;
const PREFIX = /^(?:e\.g\.,?|i\.e\.,?|see(?:\s+also)?|cf\.|also)\s+/i;

/** Case- and accent-insensitive key for comparing names. */
export function matchKey(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\.$/, "")
    .trim();
}

/** Surnames from an APA author list such as "Smith, J. A., Jones, B., & Lee, C.". */
export function surnamesOf(authorsText: string): string[] {
  const text = authorsText.trim().replace(/\.$/, "");
  if (!text.includes(",")) return [text];
  return text
    .split(",")
    .map((t) => t.trim().replace(/^(?:&|and)\s+/, ""))
    .filter((t) => t !== "" && t !== "&" && !INITIALS.test(t) && !INITIALS.test(`${t}.`));
}

function labelFor(authors: readonly string[], year: string): string {
  const [first, second] = authors;
  if (authors.length >= 3) return `${first} et al., ${year}`;
  if (second !== undefined) return `${first} & ${second}, ${year}`;
  return `${first ?? "Unknown"}, ${year}`;
}

/**
 * Parses an APA-style reference list. An entry starts at a line that begins
 * with authors followed by "(year)" and is not an indented continuation.
 */
export function parseAuthorYearReferences(referenceList: string): Reference[] {
  const entries: string[][] = [];
  let previousBlank = true;
  for (const line of referenceList.split(/\r?\n/)) {
    const blank = line.trim() === "";
    const indented = /^\s/.test(line);
    if (!blank && ENTRY_START.test(line.trim()) && (!indented || previousBlank || entries.length === 0)) {
      entries.push([line.trim()]);
    } else if (!blank && entries.length > 0) {
      entries.at(-1)?.push(line.trim());
    }
    previousBlank = blank;
  }
  return entries.map((parts, i) => {
    const raw = parts.join(" ").replace(/\s+/g, " ").trim();
    const start = ENTRY_START.exec(raw);
    const authors = surnamesOf(start?.[1] ?? "");
    const year = start?.[2] ?? "";
    return { number: i + 1, raw, doi: extractDoi(raw), label: labelFor(authors, year), authors, year };
  });
}

interface CitedGroup {
  authors: string;
  first: string;
  second: string | null;
  etAl: boolean;
}

function readAuthors(text: string): CitedGroup | null {
  const authors = text.replace(PREFIX, "").trim();
  if (!/^\p{Lu}/u.test(authors) || authors.split(/\s+/).length > 8) return null;
  const etAl = /\s+et al\.?$/.test(authors);
  const names = authors.replace(/\s+et al\.?$/, "").split(/\s+(?:&|and)\s+/);
  const [first, second] = names;
  if (first === undefined || names.length > 2) return null;
  return { authors, first, second: second ?? null, etAl };
}

/** Resolves one cited author group and year to exactly one reference, or null. */
function resolve(group: CitedGroup, year: string, refs: readonly Reference[]): number | null {
  let candidates = refs.filter(
    (r) =>
      r.year === year &&
      matchKey(r.authors[0] ?? "") === matchKey(group.first) &&
      (group.second === null || matchKey(r.authors[1] ?? "") === matchKey(group.second)),
  );
  if (candidates.length > 1 && group.second === null && !group.etAl) {
    candidates = candidates.filter((r) => r.authors.length === 1);
  }
  return candidates.length === 1 ? (candidates[0]?.number ?? null) : null;
}

/** Splits "Lee et al., 2019a, 2019b, p. 4" into authors and years, or null if not a citation. */
function readPart(part: string): { group: CitedGroup; years: string[] } | null {
  const tokens = part.split(",").map((t) => t.trim());
  const firstYear = tokens.findIndex((t) => YEAR_ONLY.test(t));
  if (firstYear < 1) return null;
  const group = readAuthors(tokens.slice(0, firstYear).join(", "));
  if (!group) return null;
  const years: string[] = [];
  let i = firstYear;
  while (i < tokens.length && YEAR_ONLY.test(tokens[i] ?? "")) {
    years.push(tokens[i] ?? "");
    i += 1;
  }
  if (!tokens.slice(i).every((t) => PAGES.test(t))) return null;
  return { group, years };
}

const PARENTHETICAL = /\s*\(([^()]+)\)/g;
const NARRATIVE = new RegExp(
  String.raw`(\p{Lu}[\p{L}'\-]+(?:\s+(?:&|and)\s+\p{Lu}[\p{L}'\-]+|\s+et al\.)?)\s+\((${YEAR})(?:,\s*pp?\.\s*[^)]+)?\)`,
  "gu",
);

/**
 * Finds APA in-text citations, parenthetical and narrative, and resolves each
 * to the reference list. Citation-shaped parts that match no single reference
 * are returned as unresolved so the user can see them.
 */
export function findAuthorYearCitations(
  sentence: string,
  refs: readonly Reference[],
): { citations: Citation[]; unresolved: string[] } {
  const citations: Citation[] = [];
  const unresolved: string[] = [];

  for (const match of sentence.matchAll(NARRATIVE)) {
    const group = readAuthors(match[1] ?? "");
    const ref = group ? resolve(group, match[2] ?? "", refs) : null;
    if (ref !== null) {
      citations.push({ start: match.index, end: match.index + match[0].length, refs: [ref], narrative: true });
    }
  }

  for (const match of sentence.matchAll(PARENTHETICAL)) {
    const start = match.index;
    if (citations.some((c) => start >= c.start && start < c.end)) continue;
    const found = new Set<number>();
    for (const part of (match[1] ?? "").split(";")) {
      const read = readPart(part.trim());
      if (!read) continue;
      for (const year of read.years) {
        const ref = resolve(read.group, year, refs);
        if (ref === null) unresolved.push(`${read.group.authors}, ${year}`);
        else found.add(ref);
      }
    }
    if (found.size > 0) {
      citations.push({
        start,
        end: start + match[0].length,
        refs: [...found].sort((a, b) => a - b),
        narrative: false,
      });
    }
  }

  citations.sort((a, b) => a.start - b.start);
  return { citations, unresolved };
}
