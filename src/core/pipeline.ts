import { extractClaims } from "./claims";
import {
  buildPrompt,
  headlineGrade,
  judgeReply,
  randomTag,
  type Headline,
  type Judgement,
} from "./grading";
import { ProviderError, type ModelProvider } from "./provider";
import { parseReferences, splitDocument } from "./references";
import type { CitationStyle, Claim, Grade, Reference, SourceText } from "./types";

/** What the app found in the pasted text, before anything leaves the browser. */
export interface Analysis {
  style: CitationStyle;
  claims: Claim[];
  uncited: string[];
  /** In-text citations that match no single reference, such as "Brown, 2018". */
  unresolved: string[];
  references: Reference[];
  /** Reference numbers cited by at least one claim, ascending. */
  citedRefs: number[];
}

/** Deterministic step: split the text into claims and parse the reference list. */
export function analyzeText(text: string): Analysis {
  const { body, referenceList } = splitDocument(text);
  const { style, references } = parseReferences(referenceList);
  const { claims, uncited, unresolved } = extractClaims(body, style, references);
  const cited = new Set(claims.flatMap((c) => c.refs));
  return {
    style,
    claims,
    uncited,
    unresolved,
    references,
    citedRefs: [...cited].sort((a, b) => a - b),
  };
}

export const NO_DOI_REASON = "No DOI found in this reference. Paste the source text instead.";

/**
 * Gets the text of every cited reference once. Pasted text always wins; a DOI
 * is looked up with lookupDoi; anything else is unreachable.
 */
export async function resolveSources(
  analysis: Analysis,
  pasted: Readonly<Record<number, string>>,
  lookupDoi: (doi: string) => Promise<SourceText>,
): Promise<Record<number, SourceText>> {
  const out: Record<number, SourceText> = {};
  for (const number of analysis.citedRefs) {
    const pastedText = pasted[number]?.trim();
    const reference = analysis.references.find((r) => r.number === number);
    if (pastedText) {
      out[number] = { status: "ok", text: pastedText, origin: "pasted" };
    } else if (reference?.doi) {
      out[number] = await lookupDoi(reference.doi);
    } else {
      out[number] = { status: "unreachable", reason: NO_DOI_REASON };
    }
  }
  return out;
}

export interface ClaimResult {
  claim: Claim;
  headline: Headline;
  perSource: { ref: number; judgement: Judgement }[];
}

export interface CheckReport {
  results: ClaimResult[];
  modelLabel: string;
}

/**
 * Grades every claim against every source it cites, one model call at a time
 * to stay inside free-tier rate limits. A rejected key stops the run; any
 * other failed call is recorded as check_failed, never as a grade.
 */
export async function runCheck(
  analysis: Analysis,
  sources: Readonly<Record<number, SourceText>>,
  provider: ModelProvider,
  onProgress?: (done: number, total: number) => void,
): Promise<CheckReport> {
  const total = analysis.claims.reduce((n, c) => n + c.refs.length, 0);
  let done = 0;
  const results: ClaimResult[] = [];
  for (const claim of analysis.claims) {
    const perSource: ClaimResult["perSource"] = [];
    for (const ref of claim.refs) {
      perSource.push({ ref, judgement: await judgeOne(claim, ref, sources[ref], provider) });
      done += 1;
      onProgress?.(done, total);
    }
    results.push({
      claim,
      // A cited reference that is not in the list counts as a source that could
      // not be read, so it can never sit silently behind a backing headline.
      headline: headlineGrade([
        ...perSource.map((p) => p.judgement.grade),
        ...claim.unresolved.map((): Grade => "source_not_reachable"),
      ]),
      perSource,
    });
  }
  return { results, modelLabel: provider.label };
}

function appVerdict(grade: Grade, reason: string): Judgement {
  return { grade, evidence: null, context: null, reason, reasonBy: "app", warnings: [], discarded: null };
}

async function judgeOne(
  claim: Claim,
  ref: number,
  source: SourceText | undefined,
  provider: ModelProvider,
): Promise<Judgement> {
  if (!source || source.status === "unreachable") {
    return appVerdict("source_not_reachable", source?.reason ?? NO_DOI_REASON);
  }
  const scope = claim.scopes[ref] ?? claim.text;
  const { system, user } = buildPrompt({
    sentence: claim.text,
    scope,
    source: source.text,
    tag: randomTag(),
  });
  let raw: string;
  try {
    raw = await provider.complete({ key: `${claim.id}:${ref}`, system, user });
  } catch (error) {
    if (error instanceof ProviderError && error.kind === "auth") throw error;
    const message = error instanceof Error ? error.message : String(error);
    return appVerdict("check_failed", `The model call failed: ${message}`);
  }
  return judgeReply(raw, source.text, scope);
}
