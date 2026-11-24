import type { Headline, Judgement } from "../core/grading";
import type { CheckReport, ClaimResult } from "../core/pipeline";
import type { Reference, SourceText } from "../core/types";
import { Highlighter } from "./Highlighter";

/** Outcomes the model gives are worded as its reading; the app's own outcomes are not. */
export const HEADLINE_TEXT: Record<Headline, string> = {
  supported: "Supported, in the model's reading",
  partly_supported: "Partly supported, in the model's reading",
  not_supported: "Not supported, in the model's reading",
  cannot_tell: "Cannot tell",
  source_not_reachable: "Source not reachable",
  check_failed: "Check failed",
  sources_disagree: "Sources disagree",
  not_every_source_backs_it: "Not every cited source backs it",
};

const SHORT_GRADE: Record<Headline, string> = {
  supported: "Supported",
  partly_supported: "Partly supported",
  not_supported: "Not supported",
  cannot_tell: "Cannot tell",
  source_not_reachable: "Source not reachable",
  check_failed: "Check failed",
  sources_disagree: "Sources disagree",
  not_every_source_backs_it: "Not every cited source backs it",
};

export function originText(source: SourceText | undefined): string {
  if (!source || source.status === "unreachable") return "no source text";
  switch (source.origin) {
    case "europepmc":
      return source.truncated
        ? "open-access full text from Europe PMC, first part only"
        : "open-access full text from Europe PMC";
    case "openalex":
      return "abstract only, rebuilt from OpenAlex";
    case "pasted":
      return "text you pasted";
    case "fixture":
      return "synthetic sample text";
  }
}

function SourceCheck({
  reference,
  source,
  judgement,
  highlight,
  showGrade,
}: {
  reference: Reference | undefined;
  source: SourceText | undefined;
  judgement: Judgement;
  highlight: string;
  /** Only when a claim cites several sources; otherwise the headline already says it. */
  showGrade: boolean;
}) {
  return (
    <li className="source-check">
      <div className="source-label">
        {showGrade && (
          <>
            <span className="verdict" data-grade={judgement.grade}>
              {SHORT_GRADE[judgement.grade]}
            </span>
            <br />
          </>
        )}
        {reference?.label ?? "Unknown source"}
        <br />
        {originText(source)}
      </div>
      {judgement.evidence && judgement.context ? (
        <>
          <p className="passage">
            {judgement.context.before && <span className="context">{judgement.context.before} </span>}
            <span className="visually-hidden">Verified quote: </span>
            <Highlighter color={highlight}>{judgement.evidence}</Highlighter>
            <span className="visually-hidden"> End of quote.</span>
            {judgement.context.after && <span className="context"> {judgement.context.after}</span>}
          </p>
          <div className="reading-note">
            <p className="quiet">
              The highlighted sentence is in the source, word for word. Whether it backs the claim is
              the model's reading, so read it yourself.
            </p>
            {judgement.reason && (
              <p>
                Model's reason: <span className="model-reason">{judgement.reason}</span>
              </p>
            )}
            {judgement.warnings.length > 0 && (
              <ul className="warnings" aria-label="Things to check in this sentence">
                {judgement.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : (
        <div className="reading-note">
          {judgement.discarded && (
            <p className="discarded">
              Discarded model answer:{" "}
              <s>
                {SHORT_GRADE[judgement.discarded.grade]}, quoting "{judgement.discarded.evidence}"
              </s>
            </p>
          )}
          {judgement.reasonBy === "model" ? (
            <p>
              Model's reason: <span className="model-reason">{judgement.reason}</span>
            </p>
          ) : (
            <p>{judgement.reason}</p>
          )}
        </div>
      )}
    </li>
  );
}

function ResultItem({
  result,
  references,
  sources,
  highlight,
}: {
  result: ClaimResult;
  references: readonly Reference[];
  sources: Readonly<Record<number, SourceText>>;
  highlight: string;
}) {
  const { claim, headline, perSource } = result;
  return (
    <li className="result" data-grade={headline}>
      <div className="result-head">
        <p className="verdict" data-grade={headline}>
          {HEADLINE_TEXT[headline]}
        </p>
        <p className="claim-text">{claim.text}</p>
      </div>
      <ul className="per-source" aria-label={`Sources for: ${claim.text}`}>
        {perSource.map(({ ref, judgement }) => (
          <SourceCheck
            key={ref}
            reference={references.find((r) => r.number === ref)}
            source={sources[ref]}
            judgement={judgement}
            highlight={highlight}
            showGrade={perSource.length > 1}
          />
        ))}
      </ul>
      {claim.unresolved.length > 0 && (
        <p className="reading-note">
          Also cited but not in your reference list, so not checked: {claim.unresolved.join(", ")}.
        </p>
      )}
    </li>
  );
}

export function Results({
  report,
  references,
  sources,
  services,
  highlight,
}: {
  report: CheckReport;
  references: readonly Reference[];
  sources: Readonly<Record<number, SourceText>>;
  services: readonly string[];
  highlight: string;
}) {
  return (
    <>
      <ol className="results" aria-label="Results">
        {report.results.map((result) => (
          <ResultItem
            key={result.claim.id}
            result={result}
            references={references}
            sources={sources}
            highlight={highlight}
          />
        ))}
      </ol>
      <div className="footer-panel">
        <dl>
          <dt>The app checked</dt>
          <dd>Every quote is one or more whole sentences found word for word in the source text it fetched or you pasted. Quotes that fail are discarded.</dd>
          <dt>The app did not check</dt>
          <dd>Whether a sentence really backs your claim. That is the model's reading; the warnings point at numbers, negations and hedges worth a second look.</dd>
          <dt>Model</dt>
          <dd>{report.modelLabel}</dd>
          <dt>Outside services called</dt>
          <dd>{services.length === 0 ? "None" : services.join(", ")}</dd>
        </dl>
      </div>
    </>
  );
}
