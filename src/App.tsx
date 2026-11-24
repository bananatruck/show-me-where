import { useEffect, useState } from "react";
import { fetchFullTextByDoi } from "./core/europepmc";
import { analyzeText, resolveSources, runCheck, type Analysis, type CheckReport } from "./core/pipeline";
import { ProviderError, createOpenRouterProvider, createReplayProvider } from "./core/provider";
import { fetchSourceByDoi, lookupDoi } from "./core/sources";
import { withTimeout } from "./core/timeout";
import type { FetchLike, SourceText } from "./core/types";
import { SAMPLE_RUN } from "./fixtures/sample";
import { loadKey, saveKey } from "./keyStore";
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
const sourceFetch = withTimeout(browserFetch, 20_000);
/** Free models can be slow; a call that hangs longer than this becomes "check failed". */
const modelFetch = withTimeout(browserFetch, 120_000);

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
  const [stored] = useState(loadKey);
  const [apiKey, setApiKey] = useState(stored.key);
  const [remember, setRemember] = useState(stored.remember);
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

  useEffect(() => {
    applyTheme(theme, false);
  }, [theme]);

  const text = mode === "sample" ? SAMPLE_RUN.text : liveText;

  function reset() {
    setAnalysis(null);
    setProblem(null);
    setReport(null);
    setServices([]);
    setError(null);
    setProgress("");
  }

  function switchMode(next: Mode) {
    setMode(next);
    setPasted({});
    reset();
  }

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    applyTheme(next, true);
    setTheme(next);
  }

  function changeKey(key: string, keep: boolean) {
    setApiKey(key);
    setRemember(keep);
    saveKey(key, keep);
  }

  function findClaims() {
    reset();
    const found = analyzeText(text);
    setAnalysis(found);
    setProblem(analysisProblem(text, found));
  }

  async function check(current: Analysis) {
    setError(null);
    setReport(null);
    setBusy(true);
    const onProgress = (done: number, total: number) =>
      setProgress(`Checked ${done} of ${total} claim and source pairs.`);
    try {
      if (mode === "sample") {
        const sampleText = sampleSources();
        const resolved: Record<number, SourceText> = {};
        for (const n of current.citedRefs) {
          resolved[n] = sampleText[n] ?? { status: "unreachable", reason: SAMPLE_MISSING };
        }
        const provider = createReplayProvider(SAMPLE_RUN.replies, "Hand-written replies (synthetic sample)");
        setSources(resolved);
        setReport(await runCheck(current, resolved, provider, onProgress));
        setServices([]);
        return;
      }
      if (apiKey.trim() === "") {
        setError("Enter your OpenRouter key to run a live check. The sample run needs no key.");
        return;
      }
      const provider = createOpenRouterProvider({ apiKey, model, fetchImpl: modelFetch });
      const called = new Set<string>();
      setProgress("Fetching source text.");
      const resolved = await resolveSources(current, pasted, (doi) =>
        lookupDoi(doi, {
          fullText: (d) => {
            called.add("Europe PMC (full-text lookup by DOI)");
            return fetchFullTextByDoi(d, sourceFetch);
          },
          abstract: (d) => {
            called.add("OpenAlex (abstract lookup by DOI)");
            return fetchSourceByDoi(d, sourceFetch);
          },
        }),
      );
      setSources(resolved);
      if (Object.values(resolved).some((s) => s.status === "ok")) called.add(provider.label);
      setServices([...called]);
      setReport(await runCheck(current, resolved, provider, onProgress));
    } catch (e) {
      setProgress("");
      const message = e instanceof Error ? e.message : String(e);
      setError(
        e instanceof ProviderError && e.kind === "auth"
          ? `${message}. Check the key and try again; nothing was graded.`
          : message,
      );
    } finally {
      setBusy(false);
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

      <main id="main">
        <section className="step" aria-labelledby="step-1">
          <h2 id="step-1">
            <span className="step-number">1</span> Paste your text
          </h2>
          <fieldset className="segmented">
            <legend>Mode</legend>
            <input id="mode-sample" type="radio" name="mode" checked={mode === "sample"} onChange={() => switchMode("sample")} />
            <label htmlFor="mode-sample">Sample run</label>
            <input id="mode-live" type="radio" name="mode" checked={mode === "live"} onChange={() => switchMode("live")} />
            <label htmlFor="mode-live">Live with your key</label>
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
                Each claim and its source text go to OpenRouter under your key. Your key stays in this browser. Nothing else is sent anywhere.
              </p>
              <div className="key-row">
                <label className="field">
                  <span>OpenRouter key</span>
                  <input type="password" autoComplete="off" value={apiKey} onChange={(e) => changeKey(e.target.value, remember)} />
                </label>
                <label className="field">
                  <span>Model id</span>
                  <input value={model} onChange={(e) => setModel(e.target.value)} aria-describedby="model-help" />
                </label>
              </div>
              <p className="quiet" id="model-help">
                Only free models, whose ids end in <code>:free</code>, are allowed.
              </p>
              <label className="check">
                <input type="checkbox" checked={remember} onChange={(e) => changeKey(apiKey, e.target.checked)} /> Remember on this device
              </label>
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
            <h2 id="step-2">
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
                          onChange={(e) => setPasted({ ...pasted, [n]: e.target.value })}
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
            <h2 id="step-3">
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
    </div>
  );
}
