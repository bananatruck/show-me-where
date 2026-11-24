import type { FetchLike, SourceText } from "./types";

/** Rebuild an OpenAlex abstract in position order, skipping gaps. */
export function rebuildAbstract(index: Record<string, number[]>): string {
  const words = new Map<number, string>();
  for (const [word, positions] of Object.entries(index)) {
    for (const position of positions) {
      words.set(position, word);
    }
  }
  return [...words.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, word]) => word)
    .join(" ");
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
  const text = index === null ? "" : rebuildAbstract(index);
  if (text === "") {
    return {
      status: "unreachable",
      reason: "OpenAlex has no abstract for this work. Paste the source text instead.",
    };
  }
  return { status: "ok", text, origin: "openalex" };
}
