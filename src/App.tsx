import { useState } from "react";
import { analyzeText, resolveSources, runCheck, type Analysis, type CheckReport } from "./core/pipeline";
import { createOpenRouterProvider, createReplayProvider } from "./core/provider";
import { fetchSourceByDoi } from "./core/sources";
import type { Grade, SourceText } from "./core/types";
import { SAMPLE_RUN } from "./fixtures/sample";
import { loadKey, saveKey } from "./keyStore";

type Mode = "sample" | "live";

const GRADE_LABEL: Record<Grade, string> = {
  supported: "Supported",
  partly_supported: "Partly supported",
  not_supported: "Not supported",
  cannot_tell: "Cannot tell",
  source_not_reachable: "Source not reachable",
};

/** A free model listed by OpenRouter on 2026-11-24; free ids change, so the field is editable. */
const DEFAULT_MODEL = "google/gemma-4-31b-it:free";

function sampleSources(): Record<number, SourceText> {
  const out: Record<number, SourceText> = {};
  for (const [n, text] of Object.entries(SAMPLE_RUN.sources)) {
    out[Number(n)] = { status: "ok", text, origin: "fixture" };
  }
  return out;
}

export function App() {
  const [mode, setMode] = useState<Mode>("sample");
  const [liveText, setLiveText] = useState("");
  const [stored] = useState(loadKey);
  const [apiKey, setApiKey] = useState(stored.key);
  const [remember, setRemember] = useState(stored.remember);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [pasted, setPasted] = useState<Record<number, string>>({});
  const [report, setReport] = useState<CheckReport | null>(null);
  const [services, setServices] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const text = mode === "sample" ? SAMPLE_RUN.text : liveText;

  function reset() {
    setAnalysis(null);
    setReport(null);
    setServices([]);
    setError(null);
  }

  function changeKey(key: string, keep: boolean) {
    setApiKey(key);
    setRemember(keep);
    saveKey(key, keep);
  }

  async function check(current: Analysis) {
    setError(null);
    setReport(null);
    setBusy(true);
    try {
      if (mode === "sample") {
        const provider = createReplayProvider(SAMPLE_RUN.replies, "Recorded replies (synthetic)");
        setReport(await runCheck(current, sampleSources(), provider));
        setServices([]);
        return;
      }
      const provider = createOpenRouterProvider({
        apiKey,
        model,
        fetchImpl: (input, init) => window.fetch(input, init),
      });
      const called = new Set<string>();
      const sources = await resolveSources(current, pasted, (doi) => {
        called.add("OpenAlex (DOI lookup)");
        return fetchSourceByDoi(doi, (input, init) => window.fetch(input, init));
      });
      if (current.claims.some((c) => c.refs.some((r) => sources[r]?.status === "ok"))) {
        called.add(provider.label);
      }
      setReport(await runCheck(current, sources, provider));
      setServices([...called]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: "50rem", margin: "0 auto", padding: "1rem", fontFamily: "system-ui, sans-serif", lineHeight: 1.5 }}>
      <h1>Claim Check</h1>
      <p>Paste a paragraph with numbered citations and its reference list. Every grade comes with the source sentence it rests on, or it is not given.</p>

      <fieldset>
        <legend>Mode</legend>
        <label>
          <input type="radio" name="mode" checked={mode === "sample"} onChange={() => { setMode("sample"); reset(); }} />
          {" "}Sample run (no key)
        </label>
        <br />
        <label>
          <input type="radio" name="mode" checked={mode === "live"} onChange={() => { setMode("live"); reset(); }} />
          {" "}Live (your OpenRouter key)
        </label>
      </fieldset>

      {mode === "sample" ? (
        <>
          <p role="note"><strong>{SAMPLE_RUN.label}</strong></p>
          <p>Nothing leaves your browser in the sample run.</p>
        </>
      ) : (
        <>
          <p>
            In a live run, each DOI is sent to OpenAlex to fetch the abstract, and each claim with its source text is sent to OpenRouter under your key.
            Your key is kept only in this browser. Nothing else is sent anywhere.
          </p>
          <p>
            <label>
              OpenRouter key
              <br />
              <input type="password" autoComplete="off" value={apiKey} onChange={(e) => changeKey(e.target.value, remember)} />
            </label>
            <br />
            <label>
              <input type="checkbox" checked={remember} onChange={(e) => changeKey(apiKey, e.target.checked)} />
              {" "}Remember on this device
            </label>
            <br />
            <label>
              Model id
              <br />
              <input value={model} onChange={(e) => setModel(e.target.value)} />
            </label>
            {" "}Only ids ending in <code>:free</code> are allowed.
          </p>
        </>
      )}

      <p>
        <label>
          Text to check
          <br />
          <textarea
            rows={12}
            style={{ width: "100%" }}
            value={text}
            readOnly={mode === "sample"}
            onChange={(e) => { setLiveText(e.target.value); reset(); }}
          />
        </label>
      </p>
      <button type="button" onClick={() => { reset(); setAnalysis(analyzeText(text)); }}>
        Find claims
      </button>

      {analysis && (
        <section>
          <h2>Claims and sources</h2>
          <ol aria-label="Cited claims">
            {analysis.claims.map((c) => (
              <li key={c.id}>{c.text} <small>cites [{c.refs.join(", ")}]</small></li>
            ))}
          </ol>
          {analysis.claims.length === 0 && <p>No cited claims found. Citations must look like [1] and match a numbered reference list.</p>}
          <h3>Not checked: no citation</h3>
          <ul aria-label="Not checked: no citation">
            {analysis.uncited.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
          <h3>Sources</h3>
          <ul>
            {analysis.citedRefs.map((n) => {
              const ref = analysis.references.find((r) => r.number === n);
              return (
                <li key={n}>
                  [{n}] {ref?.raw}
                  <br />
                  <small>
                    {mode === "sample"
                      ? "Synthetic source text from the sample."
                      : ref?.doi
                        ? `Abstract fetched from OpenAlex by DOI ${ref.doi}, unless you paste the text below.`
                        : "No DOI: paste the source text below, or this source is not reachable."}
                  </small>
                  {mode === "live" && (
                    <>
                      <br />
                      <label>
                        Source text for [{n}]
                        <br />
                        <textarea
                          rows={3}
                          style={{ width: "100%" }}
                          value={pasted[n] ?? ""}
                          onChange={(e) => setPasted({ ...pasted, [n]: e.target.value })}
                        />
                      </label>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          <button type="button" disabled={busy || analysis.claims.length === 0} onClick={() => void check(analysis)}>
            Check claims
          </button>
        </section>
      )}

      {error && <p role="alert">{error}</p>}
      {busy && <p>Checking, one claim at a time...</p>}

      {report && (
        <section>
          <h2>Results</h2>
          <ol aria-label="Results">
            {report.results.map(({ claim, headline, perSource }) => (
              <li key={claim.id} data-grade={headline}>
                <strong>{GRADE_LABEL[headline]}</strong>: {claim.text}
                <ul>
                  {perSource.map(({ ref, judgement }) => (
                    <li key={ref}>
                      Source [{ref}]: {GRADE_LABEL[judgement.grade]}.
                      {judgement.evidence && <blockquote>{judgement.evidence}</blockquote>}
                      {judgement.discarded && (
                        <> Discarded model grade: <s>{GRADE_LABEL[judgement.discarded.grade]}, quoting "{judgement.discarded.evidence}"</s>.</>
                      )}
                      {" "}{judgement.reason}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
          <footer>
            <p>Model: {report.modelLabel}</p>
            <p>Outside services called: {services.length === 0 ? "none" : services.join(", ")}</p>
          </footer>
        </section>
      )}
    </main>
  );
}
