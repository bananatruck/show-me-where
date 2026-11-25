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
// Authors, an optional "(Ed.)" or "(Eds.)" marker, then "(year)" or a full date "(2020, May 14)".
const ENTRY_START = new RegExp(
  String.raw`^(\S[^(]*?)(?:\s*\((?:Eds?|Trans|Comp)\.?\)\.?)?\s*\(\s*(${YEAR})(?:,\s*[^)]*)?\s*\)`,
);
const INITIALS = /^(?:\p{Lu}\.(?:\s*-?\s*\p{Lu}\.)*|Jr\.?|Sr\.?|\.\.\.|\u2026)$/u;
/** Lowercase surname particles, as in "van der Berg" or "de la Cruz". */
const PARTICLE = String.raw`(?:van|von|der|den|de|del|della|di|da|du|la|le|ter|ten|dos|das)`;
const STARTS_LIKE_A_NAME = new RegExp(String.raw`^(?:${PARTICLE}\s+)*\p{Lu}`, "u");
const PAGES = /^(?:pp?\.|para\.|chap\.)\s*\S+$/;
const PREFIX = /^(?:e\.g\.,?|i\.e\.,?|see(?:\s+also)?|cf\.|also)\s+/i;

/** Case- and accent-insensitive key for comparing names. */
export function matchKey(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[\u2018\u2019]/g, "'")
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
  if (!STARTS_LIKE_A_NAME.test(authors) || authors.split(/\s+/).length > 8) return null;
  const etAl = /\s+et al\.?$/.test(authors);
  const names = authors.replace(/\s+et al\.?$/, "").split(/\s+(?:&|and)\s+/);
  const [first, second] = names;
  if (first === undefined || names.length > 2) return null;
  return { authors, first, second: second ?? null, etAl };
}

/** Resolves one cited author group and year to exactly one reference, or null. */
function resolve(group: CitedGroup, year: string, refs: readonly Reference[]): number | null {
  // APA names one author alone, two with "&", and three or more with "et al.";
  // the author count must agree so a citation never lands on a different work.
  const count = group.etAl ? (n: number) => n >= 3 : group.second !== null ? (n: number) => n === 2 : (n: number) => n === 1;
  const candidates = refs.filter(
    (r) =>
      r.year === year &&
      count(r.authors.length) &&
      matchKey(r.authors[0] ?? "") === matchKey(group.first) &&
      (group.second === null || matchKey(r.authors[1] ?? "") === matchKey(group.second)),
  );
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
// A name word: optional lowercase particles, then a capitalised word.
const NAME_WORD = String.raw`(?:${PARTICLE}\s+)*\p{Lu}[\p{L}\p{M}'\u2018\u2019\-]+`;
// Up to six name words, so group names such as "World Health Organization" fit.
const NAME_RUN = String.raw`${NAME_WORD}(?:\s+${NAME_WORD}){0,5}`;
// Every pattern fragment is a constant; no input text is interpolated.
const NARRATIVE = new RegExp(
  String.raw`(?<![\p{L}\p{M}\p{N}'\u2018\u2019\-])(${NAME_RUN}(?:\s+(?:&|and)\s+${NAME_RUN}|\s+et al\.)?)\s+\((${YEAR}(?:,\s*${YEAR})*)(?:,\s*pp?\.\s*[^)]+)?\)`,
  "gu",
);
const NAME_WORD_START = new RegExp(NAME_WORD, "gu");

/** Words that can open a sentence before a narrative citation, as in "Recently Brown (2018)". */
const LEAD_INS = new Set(
  "the recently however also similarly likewise later earlier previously moreover furthermore notably additionally thus hence indeed conversely finally first second third then still yet in by for".split(
    " ",
  ),
);

/**
 * Offsets inside a narrative author run where a reading could start, longest
 * first. Only opening words such as "Recently" may be dropped, so part of a
 * compound surname ("Garc\u00EDa M\u00E1rquez") is never dropped to reach a
 * different author.
 */
function readingStarts(run: string): number[] {
  const firstGroup = run.split(/\s+(?:&|and)\s+|\s+et al\./)[0] ?? run;
  return [...firstGroup.matchAll(NAME_WORD_START)]
    .map((m) => m.index)
    .filter((offset) =>
      run
        .slice(0, offset)
        .split(/\s+/)
        .filter(Boolean)
        .every((word) => LEAD_INS.has(word.toLowerCase())),
    );
}

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
    const run = match[1] ?? "";
    const years = (match[2] ?? "").split(",").map((year) => year.trim());
    const starts = readingStarts(run);
    let found = false;
    // The run can begin with an ordinary capitalised word such as "Recently",
    // so try each reading from the longest down and keep the first that resolves.
    for (const offset of starts) {
      const group = readAuthors(run.slice(offset));
      const resolved = years.map((year) => group ? resolve(group, year, refs) : null);
      const numbers = resolved.filter((ref) => ref !== null);
      if (numbers.length > 0) {
        citations.push({
          start: match.index + offset,
          end: match.index + match[0].length,
          refs: [...new Set(numbers)].sort((a, b) => a - b),
          narrative: true,
        });
        for (const [i, year] of years.entries()) {
          if (resolved[i] === null && group) unresolved.push(`${group.authors}, ${year}`);
        }
        found = true;
        break;
      }
    }
    if (!found) {
      const shortest = readAuthors(run.slice(starts.at(-1) ?? 0));
      if (shortest) {
        for (const year of years) unresolved.push(`${shortest.authors}, ${year}`);
      }
    }
  }

  for (const match of sentence.matchAll(PARENTHETICAL)) {
    const start = match.index;
    if (citations.some((c) => start >= c.start && start < c.end)) continue;
    const found = new Set<number>();
    let offset = start + match[0].indexOf("(") + 1;
    const parts = (match[1] ?? "").split(";").map((text) => {
      const partStart = offset;
      offset += text.length + 1;
      const read = readPart(text.trim());
      const numbers: number[] = [];
      if (read) {
        for (const year of read.years) {
          const ref = resolve(read.group, year, refs);
          if (ref === null) unresolved.push(`${read.group.authors}, ${year}`);
          else {
            found.add(ref);
            numbers.push(ref);
          }
        }
      }
      return {
        start: partStart + text.length - text.trimStart().length,
        end: partStart + text.trimEnd().length,
        read,
        refs: numbers,
      };
    });
    if (found.size === 0) continue;
    // Only citation-only parentheses may be removed whole. In mixed groups,
    // remove runs of citation parts and one separator, preserving every qualifier
    // and a semicolon between any remaining non-citation parts.
    if (parts.every((part) => part.read !== null)) {
      citations.push({
        start,
        end: start + match[0].length,
        refs: [...found].sort((a, b) => a - b),
        narrative: false,
      });
    } else {
      for (const [i, part] of parts.entries()) {
        if (!part.read || parts[i - 1]?.read) continue;
        let last = i;
        while (parts[last + 1]?.read) last += 1;
        const previous = parts[i - 1];
        const next = parts[last + 1];
        citations.push({
          start: previous?.end ?? start + match[0].indexOf("(") + 1,
          end: previous
            ? next ? (parts[last]?.end ?? part.end) : start + match[0].length - 1
            : (next?.start ?? part.end),
          refs: [...new Set(parts.slice(i, last + 1).flatMap((p) => p.refs))].sort((a, b) => a - b),
          narrative: false,
        });
      }
    }
  }

  citations.sort((a, b) => a.start - b.start);
  return { citations, unresolved };
}
