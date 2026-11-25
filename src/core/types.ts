/** The outcomes one claim can have against one source. */
export type Grade =
  | "supported"
  | "partly_supported"
  | "not_supported"
  | "cannot_tell"
  | "source_not_reachable"
  | "check_failed";

/**
 * Grades the model may give. The app alone decides "source_not_reachable"
 * (no source text) and "check_failed" (the model call itself failed).
 */
export type ModelGrade = Exclude<Grade, "source_not_reachable" | "check_failed">;

/** Numeric "[1]" citations, or APA-style "(Smith, 2020)" citations. */
export type CitationStyle = "numeric" | "author_year";

/** One entry of the reference list. */
export interface Reference {
  /** The bracket number in numeric style; the 1-based position in the list in author-year style. */
  number: number;
  raw: string;
  doi: string | null;
  /** How the app names this source: "[1]" or "Smith & Jones, 2020". */
  label: string;
  /** Surnames in author-year style; empty in numeric style. */
  authors: string[];
  /** Year in author-year style, such as "2020", "2019a" or "n.d."; null in numeric style. */
  year: string | null;
}

/** One cited sentence from the body text. */
export interface Claim {
  id: string;
  /** The sentence with its parenthetical citations removed. */
  text: string;
  /** The sentence exactly as it appeared in the input. */
  sentence: string;
  /** Reference numbers this sentence cites, in ascending order. */
  refs: number[];
  /**
   * For each cited reference, the part of the sentence that citation is
   * attached to. Equals text unless the sentence cites different sources for
   * different parts, as in "A rose (Smith, 2020) while B fell (Lee, 2019)".
   */
  scopes: Record<number, string>;
  /** Citations in this sentence that match nothing in the reference list, such as "[3]". */
  unresolved: string[];
}

/**
 * Where a source's text came from: "openalex" is an abstract only,
 * "europepmc" is open-access full text, "pasted" is whatever the user pasted.
 */
export type SourceOrigin = "openalex" | "europepmc" | "pasted" | "fixture";

/** The text of one cited source, or why it could not be obtained. */
export type SourceText =
  | { status: "ok"; text: string; origin: SourceOrigin; truncated?: boolean }
  | { status: "unreachable"; reason: string };

/** Minimal fetch signature so tests can pass a fake. */
export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;
