/** The five outcomes a claim can have. */
export type Grade =
  | "supported"
  | "partly_supported"
  | "not_supported"
  | "cannot_tell"
  | "source_not_reachable";

/** Grades the model may give; the app alone decides "source_not_reachable". */
export type ModelGrade = Exclude<Grade, "source_not_reachable">;

/** One entry of the reference list, such as "[1] Author. Title. doi:10.1/x". */
export interface Reference {
  number: number;
  raw: string;
  doi: string | null;
}

/** One cited sentence from the body text. */
export interface Claim {
  id: string;
  /** The sentence with its citation markers removed. */
  text: string;
  /** The sentence exactly as it appeared in the input. */
  sentence: string;
  /** Reference numbers this sentence cites, in ascending order. */
  refs: number[];
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
