import type { FetchLike, SourceText } from "./types";

/**
 * Rebuild an OpenAlex abstract in position order. Missing positions become
 * "[...]" so that no quote can join words that were not next to each other.
 */
export function rebuildAbstract(index: Record<string, number[]>): string {
  const words = new Map<number, string>();
  for (const [word, positions] of Object.entries(index)) {
    for (const position of positions) {
      words.set(position, word);
    }
  }
  const out: string[] = [];
  let previous: number | null = null;
  for (const [position, word] of [...words.entries()].sort(([a], [b]) => a - b)) {
    if ((previous === null && position > 0) || (previous !== null && position > previous + 1)) {
      out.push("[...]");
    }
    out.push(word);
    previous = position;
  }
  return out.join(" ");
}

/** The two ways to get a DOI's text, injectable for tests. */
export interface DoiLookups {
  fullText: (doi: string) => Promise<SourceText>;
  abstract: (doi: string) => Promise<SourceText>;
}

/**
 * Open-access full text first, because an abstract often does not cover a
 * claim; the abstract second. When neither is available, both reasons are kept.
 */
export async function lookupDoi(doi: string, lookups: DoiLookups): Promise<SourceText> {
  const full = await lookups.fullText(doi);
  if (full.status === "ok") return full;
  const abstract = await lookups.abstract(doi);
  if (abstract.status === "ok") return abstract;
  return { status: "unreachable", reason: `${full.reason} ${abstract.reason}` };
}

/** Build the OpenAlex work URL for a DOI with only the required fields. */
export function openAlexWorkUrl(doi: string): string {
  return `https://api.openalex.org/works/doi:${encodeURIComponent(doi)}?select=id,doi,title,abstract_inverted_index`;
}

function isAbstractIndex(value: unknown): value is Record<string, number[]> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every(
      (positions: unknown) =>
        Array.isArray(positions) &&
        positions.every(
          (position: unknown) =>
            typeof position === "number" &&
            Number.isSafeInteger(position) &&
            position >= 0,
        ),
    )
  );
}

function hasCompletePositions(index: Record<string, number[]>): boolean {
  const seen = new Set<number>();
  let last = -1;
  for (const [word, positions] of Object.entries(index)) {
    if (positions.length > 0 && word.trim() === "") return false;
    for (const position of positions) {
      if (seen.has(position)) return false;
      seen.add(position);
      last = Math.max(last, position);
    }
  }
  // Every position from zero must have exactly one word. A gap could hide
  // a negation, and a conflict could overwrite one, so neither is evidence.
  return seen.size === last + 1;
}

/** Fetch a DOI's abstract or explain why source text must be pasted. */
export async function fetchSourceByDoi(
  doi: string,
  fetchImpl: FetchLike,
): Promise<SourceText> {
  let response: Response;
  try {
    response = await fetchImpl(openAlexWorkUrl(doi));
  } catch {
    return {
      status: "unreachable",
      reason: "Could not reach OpenAlex. Paste the source text instead.",
    };
  }

  if (!response.ok) {
    return {
      status: "unreachable",
      reason:
        response.status === 404
          ? "OpenAlex has no record for this DOI. Paste the source text instead."
          : `OpenAlex answered HTTP ${response.status}. Paste the source text instead.`,
    };
  }

  const unreadable: SourceText = {
    status: "unreachable",
    reason: "OpenAlex sent a reply that could not be read. Paste the source text instead.",
  };
  let work: unknown;
  try {
    work = await response.json();
  } catch {
    return unreadable;
  }

  if (typeof work !== "object" || work === null || Array.isArray(work)) {
    return unreadable;
  }
  const index = "abstract_inverted_index" in work
    ? work.abstract_inverted_index
    : null;
  if (index !== null && !isAbstractIndex(index)) {
    return unreadable;
  }
  if (index !== null && !hasCompletePositions(index)) {
    return {
      status: "unreachable",
      reason: "OpenAlex sent an incomplete or conflicting abstract. Paste the source text instead.",
    };
  }
  const text = index === null ? "" : rebuildAbstract(index);
  if (text === "") {
    return {
      status: "unreachable",
      reason: "OpenAlex has no abstract for this work. Paste the source text instead.",
    };
  }
  return { status: "ok", text, origin: "openalex" };
}
