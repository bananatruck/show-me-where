import { useEffect, useRef, useState } from "react";
import { fetchFullTextByDoi } from "./core/europepmc";
import { analyzeText, resolveSources, runCheck, type Analysis, type CheckReport } from "./core/pipeline";
import { ProviderError, createOpenRouterProvider, createReplayProvider } from "./core/provider";
import { fetchSourceByDoi, lookupDoi } from "./core/sources";
import { withSignal, withTimeout } from "./core/timeout";
import type { FetchLike, SourceText } from "./core/types";
import { SAMPLE_RUN } from "./fixtures/sample";
import { forgetStoredKeys } from "./keyStore";
import { Results } from "./ui/Results";
import { HIGHLIGHT, applyTheme, initialTheme, type Theme } from "./ui/theme";

type Mode = "sample" | "live";

/** A free model listed by OpenRouter on 2026-11-24; free ids change, so the field is editable. */
const DEFAULT_MODEL = "google/gemma-4-31b-it:free";

const SAMPLE_MISSING =
  "The sample has no text for this source. In a live run you would paste it in step 2.";

function sampleSources(): Record<number, SourceText> {
  const out: Record<number, SourceText> = {};
  for (const [n, text] of Object.entries(SAMPLE_RUN.sources)) {
    out[Number(n)] = { status: "ok", text, origin: "fixture" };
  }
  return out;
}

const browserFetch: FetchLike = (input, init) => window.fetch(input, init);
/** A slow source service is treated as unreachable, so the lookup moves on. */
const SOURCE_TIMEOUT_MS = 20_000;
/** Free models can be slow; a call that hangs longer than this becomes "check failed". */
const MODEL_TIMEOUT_MS = 120_000;

/** Problems found in step 1, worded as what to do next. */
function analysisProblem(text: string, analysis: Analysis): string | null {
  if (text.trim() === "") return "Paste a paragraph and its reference list first.";
  if (analysis.references.length === 0) {
    return "No reference list found. Put a line that says References above your list.";
  }
  if (analysis.claims.length === 0) {
    const unmatched =
      analysis.unresolved.length > 0
        ? ` These citations match nothing in your reference list: ${analysis.unresolved.join("; ")}.`
        : "";
    return `No cited sentences found. Citations must look like (Smith, 2020) or [1] and match an entry in your reference list.${unmatched}`;
  }
  return null;
}

export function App() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [mode, setMode] = useState<Mode>("sample");
  const [liveText, setLiveText] = useState("");
  // The key lives only in memory; it is gone when the page closes.
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [pasted, setPasted] = useState<Record<number, string>>({});
  const [sources, setSources] = useState<Record<number, SourceText>>({});
  const [report, setReport] = useState<CheckReport | null>(null);
  const [services, setServices] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>("");
  const [busy, setBusy] = useState(false);
  /** Identifies the newest check; a check that is no longer newest must not write state. */
  const runRef = useRef(0);
  /** Aborts the newest check's outside requests when that check is superseded. */
  const abortRef = useRef<AbortController | null>(null);
  const step2Ref = useRef<HTMLHeadingElement>(null);
  const step3Ref = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    applyTheme(theme, false);
  }, [theme]);

  useEffect(() => {
    forgetStoredKeys();
  }, []);

  // Move focus to each step as it appears, so keyboard and screen-reader users land on it.
  useEffect(() => {
    if (analysis && !problem) step2Ref.current?.focus();
  }, [analysis, problem]);

  useEffect(() => {
    if (report) step3Ref.current?.focus();
  }, [report]);

  const text = mode === "sample" ? SAMPLE_RUN.text : liveText;

  function invalidateCheck() {
    // Any check still running belongs to the text being replaced; disown it
    // and cancel its requests, so no more claims or key leave the browser.
    runRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    setReport(null);
    setSources({});
    setServices([]);
    setError(null);
    setProgress("");
  }

  function reset() {
    invalidateCheck();
    setAnalysis(null);
    setProblem(null);
  }

  function switchMode(next: Mode) {
    setMode(next);
    setPasted({});
    if (next === "sample") setApiKey("");
    reset();
  }

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    applyTheme(next, true);
    setTheme(next);
  }

  function findClaims() {
    reset();
    const found = analyzeText(text);
    setAnalysis(found);
    setProblem(analysisProblem(text, found));
  }

  async function check(current: Analysis) {
    runRef.current += 1;
    const run = runRef.current;
    const live = () => runRef.current === run;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    // Cancelled when this check is superseded; the timeouts added below still apply.
    const runFetch = withSignal(browserFetch, controller.signal);
    setError(null);
    setReport(null);
    setBusy(true);
    // Every outside service this run has contacted, so an error can say so too.
    const called = new Set<string>();
    const onProgress = (done: number, total: number) => {
      if (live()) setProgress(`Checked ${done} of ${total} claim and source pairs.`);
    };
    try {
      if (mode === "sample") {
        const sampleText = sampleSources();
        const resolved: Record<number, SourceText> = {};
        for (const n of current.citedRefs) {
          resolved[n] = sampleText[n] ?? { status: "unreachable", reason: SAMPLE_MISSING };
        }
        const provider = createReplayProvider(SAMPLE_RUN.replies, "Hand-written replies (synthetic sample)");
        const result = await runCheck(current, resolved, provider, onProgress);
        if (!live()) return;
        setSources(resolved);
        setServices([]);
        setReport(result);
        setProgress("");
        return;
      }
      if (apiKey.trim() === "") {
        setError("Enter your OpenRouter key to run a live check. The sample run needs no key.");
        return;
      }
      const provider = createOpenRouterProvider({
        apiKey,
        model,
        fetchImpl: withTimeout(runFetch, MODEL_TIMEOUT_MS),
      });
      setProgress("Fetching source text.");
      const resolved = await resolveSources(current, pasted, (doi) =>
        lookupDoi(doi, {
          fullText: async (d) => {
            if (controller.signal.aborted) return { status: "unreachable", reason: "The check was cancelled." };
            called.add("Europe PMC (full-text lookup by DOI)");
            return fetchFullTextByDoi(d, withTimeout(runFetch, SOURCE_TIMEOUT_MS));
          },
          abstract: async (d) => {
            // A cancelled check does not move on to the next source.
            if (controller.signal.aborted) return { status: "unreachable", reason: "The check was cancelled." };
            called.add("OpenAlex (abstract lookup by DOI)");
            return fetchSourceByDoi(d, withTimeout(runFetch, SOURCE_TIMEOUT_MS));
          },
        }),
      );
      if (!live()) return;
      setSources(resolved);
      if (Object.values(resolved).some((s) => s.status === "ok")) called.add(provider.label);
      setServices([...called]);
      const result = await runCheck(current, resolved, provider, onProgress, live);
      if (!live()) return;
      setReport(result);
      setProgress("");
    } catch (e) {
      if (!live()) return;
      setProgress("");
      const message = e instanceof Error ? e.message : String(e);
      const contacted =
        called.size > 0 ? ` Already contacted in this run: ${[...called].join(", ")}.` : "";
      setError(
        e instanceof ProviderError && e.kind === "auth"
          ? `${message}. Check the key and try again. No results are shown.${contacted}`
          : `${message}${contacted}`,
      );
    } finally {
      if (live()) setBusy(false);
    }
  }

  return (
    <div className="page">
      <a className="skip-link" href="#main">
        Skip to the checker
      </a>
      <header className="masthead">
        <div>
          <h1>
            Show Me <span className="where">Where</span>
          </h1>
          <p>Check whether your sources say what your sentences say. Every grade comes with the source sentence behind it, or no grade is given.</p>
        </div>
        <button type="button" className="theme-toggle" onClick={toggleTheme} aria-pressed={theme === "dark"}>
          Dark theme
        </button>
      </header>

      <main id="main" tabIndex={-1}>
        <section className="step" aria-labelledby="step-1">
          <h2 id="step-1">
            <span className="step-number">1</span> Paste your text
          </h2>
          <fieldset className="segmented">
            <legend>Mode</legend>
            <span className="seg">
              <input id="mode-sample" type="radio" name="mode" checked={mode === "sample"} onChange={() => switchMode("sample")} />
              <label htmlFor="mode-sample">Sample run</label>
            </span>
            <span className="seg">
              <input id="mode-live" type="radio" name="mode" checked={mode === "live"} onChange={() => switchMode("live")} />
              <label htmlFor="mode-live">Live with your key</label>
            </span>
          </fieldset>

          {mode === "sample" ? (
            <div className="reading">
              <p className="note" role="note">
                {SAMPLE_RUN.label}
              </p>
              <p className="quiet">Nothing leaves your browser in the sample run.</p>
            </div>
          ) : (
            <div className="reading">
              <p className="quiet">
                In a live run, each DOI goes to Europe PMC for open-access full text, then to OpenAlex for the abstract if there is no full text.
                Each claim and its source text go to OpenRouter under your key. Your key is kept only in this page's memory, never stored, and is forgotten when you switch to the sample run or close the page. Nothing else is sent anywhere.
              </p>
              <div className="key-row">
                <label className="field">
                  <span>OpenRouter key</span>
                  <input type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
                </label>
                <label className="field">
                  <span>Model id</span>
                  <input value={model} onChange={(e) => setModel(e.target.value)} aria-describedby="model-help" />
                </label>
              </div>
              <p className="quiet" id="model-help">
                Only free models, whose ids end in <code>:free</code>, are allowed.
              </p>
            </div>
          )}

          <label className="field">
            <span>Text to check</span>
            <textarea
              className="document"
              value={text}
              readOnly={mode === "sample"}
              aria-describedby="text-help"
              onChange={(e) => {
                setLiveText(e.target.value);
                // Pasted source text belongs to the old document's reference numbers.
                setPasted({});
                reset();
              }}
            />
          </label>
          <p className="quiet reading" id="text-help">
            Use APA citations such as (Smith &amp; Jones, 2020) or numbered ones such as [1], with a References heading above the list.
          </p>
          <button type="button" className="button" onClick={findClaims}>
            Find claims
          </button>
          {problem && (
            <p className="message" role="alert">
              <strong>Nothing to check yet.</strong> {problem}
            </p>
          )}
        </section>

        {analysis && !problem && (
          <section className="step" aria-labelledby="step-2">
            <h2 id="step-2" tabIndex={-1} ref={step2Ref}>
              <span className="step-number">2</span> Claims and sources
            </h2>
            <ol className="claims" aria-label="Cited claims">
              {analysis.claims.map((c) => (
                <li key={c.id}>
                  {c.text}
                  {c.refs.map((r) => (
                    <span className="chip" key={r}>
                      {analysis.references.find((ref) => ref.number === r)?.label}
                    </span>
                  ))}
                </li>
              ))}
            </ol>
            {analysis.uncited.length > 0 && (
              <>
                <h3>Not checked: no citation</h3>
                <ul aria-label="Not checked: no citation" className="reading">
                  {analysis.uncited.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </>
            )}
            {analysis.unresolved.length > 0 && (
              <>
                <h3>Cited but not in your reference list</h3>
                <ul aria-label="Cited but not in your reference list">
                  {analysis.unresolved.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </>
            )}
            <h3>Sources</h3>
            <ul className="sources">
              {analysis.citedRefs.map((n) => {
                const ref = analysis.references.find((r) => r.number === n);
                return (
                  <li key={n}>
                    <span className="raw">{ref?.raw}</span>
                    <br />
                    <span className="quiet">
                      {mode === "sample"
                        ? SAMPLE_RUN.sources[n]
                          ? "Synthetic sample text."
                          : SAMPLE_MISSING
                        : ref?.doi
                          ? `DOI ${ref.doi}: full text from Europe PMC if open access, else the abstract from OpenAlex. Text you paste below is used instead.`
                          : "No DOI, so this source cannot be fetched. Paste its text below, or it will be marked not reachable."}
                    </span>
                    {mode === "live" && (
                      <label className="field">
                        <span>Source text for {ref?.label}</span>
                        <textarea
                          rows={3}
                          value={pasted[n] ?? ""}
                          onChange={(e) => {
                            invalidateCheck();
                            setPasted({ ...pasted, [n]: e.target.value });
                          }}
                        />
                      </label>
                    )}
                  </li>
                );
              })}
            </ul>
            <button type="button" className="button" disabled={busy} onClick={() => void check(analysis)}>
              Check claims
            </button>
            <p className="quiet" aria-live="polite">
              {progress}
            </p>
            {error && (
              <p className="message" role="alert">
                <strong>The check stopped.</strong> {error}
              </p>
            )}
          </section>
        )}

        {analysis && report && (
          <section className="step" aria-labelledby="step-3">
            <h2 id="step-3" tabIndex={-1} ref={step3Ref}>
              <span className="step-number">3</span> What the sources say
            </h2>
            <Results
              report={report}
              references={analysis.references}
              sources={sources}
              services={services}
              highlight={HIGHLIGHT[theme]}
            />
          </section>
        )}
      </main>
      <footer className="site-footer quiet">
        <a href={`${import.meta.env.BASE_URL}THIRD_PARTY_NOTICES.txt`}>Licences and third-party notices</a>
      </footer>
    </div>
  );
}
