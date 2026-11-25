# Devpost submission text: Show Me Where

Copy each section into the matching Devpost field.
Placeholders in angle brackets must be filled in by Kesh before submitting.

## Project name

Show Me Where

## Elevator pitch (one line)

Paste a paragraph with citations and see, for every claim, the exact sentence from the source behind it, or an honest "cannot tell".

## Problem and solution

Students cite sources they have skimmed, and citations drift: a number gets rounded, a hedge gets dropped, a correlation becomes a cause.
AI writing tools make this worse, because they write fluent sentences whose cited sources do not say what the sentence says.
Checking by hand means opening every source and hunting for the passage, which few students do before a deadline.
Show Me Where is for students checking their own abstract, literature review, or lab report introduction before they hand it in.
It finds every cited claim, reads the cited source, and shows the one source sentence each grade rests on, highlighted inside the sentences around it.
If the model cannot quote a whole sentence that really is in the source, the app throws its grade away and says "cannot tell".
The student ends up reading the right sentence of the right source, which is the check they would have skipped.

## What it does

1. Paste a paragraph and its reference list, in APA author-year style or numbered style.
2. The app lists every cited claim, every sentence with no citation, and every citation that matches nothing in the reference list (bracketed numbers above 999 are read as years).
3. For each source with a DOI, it reads open-access full text from Europe PMC, or else the abstract from OpenAlex. Other sources can be pasted in.
4. Each claim is checked against each of its sources.
   When a sentence cites different sources in independent clauses, each source is checked against the part its citation follows.
   The whole sentence is used for a shared opening frame such as "No evidence shows that" or "It is unlikely that", a later part without its own clause opener and subject, text after the final citation other than punctuation, narrative citations such as "Smith (2020) found", a single citation group, or any part shorter than three words.
   A later part's subject counts as shown only when a word such as "the", "it" or a number starts it, or when one or two words are followed by a verb such as "was" or "did"; continuations such as "but reduces mortality" or "while significantly reducing mortality" keep the shared subject by using the whole sentence.
   A source cited more than once is checked against the whole sentence, while other sources can keep their own scopes.
5. Results show the model's reading (supported, partly supported, not supported) or the app's own outcome (cannot tell, source not reachable, check failed, sources disagree), with the verified sentence highlighted in context.

A sample run, labelled on screen as a synthetic hand-written example, shows every outcome with no key and no network calls.

## AI implementation

- Model: a free OpenRouter model, called from the browser with the student's own key through the OpenRouter chat completions API. The default is `google/gemma-4-31b-it:free`, and the app refuses any model id that does not end in `:free`.
- The model gets a fixed rubric, the student's sentence, the part of it cited to one source, and that source's text, and must answer in JSON with a grade, one whole sentence copied from the source, and a reason.
- The app, not the model, decides what reaches the student. A grade survives only if its quote is one or more whole sentences found word for word in the source text, after normalising only quotes, dashes, ligatures, invisible characters and whitespace. Quoting part of a sentence is rejected, because a fragment can drop a "no evidence that".
- Kept grades are worded as the model's reading, and each quote is shown between its neighbouring sentences so the student can see a "However" or a change of population.
- Deterministic warnings flag a number in the claim that the quote lacks, and negations, hedges, or earlier-work wording in the quote that the claim lacks. Warnings never change a grade.
- When the claim has extractable key words, a quote that shares none of them is discarded, so a model steered into quoting an unrelated real sentence gets nothing through.
  A claim with no extractable key words skips this keyword check, while the quote must still be long enough and match whole source sentences.
- A claim shows a backing grade only if every cited source backs it; otherwise it reads "Sources disagree" or "Not every cited source backs it".
  Disagreement requires opposing grades on the same cited scope; opposing grades on different scopes give "Not every cited source backs it".
- A failed model call is shown as "check failed", never as a grade.
- Source text is fenced in the prompt with a random tag for each call, and the rules are repeated after it, to reduce prompt injection from hostile source text.
- Everything except the model's reading is deterministic TypeScript, covered by unit and component tests.

## Responsible use, limitations and outside dependencies

- The app cannot tell whether a real sentence really backs a claim. It says so beside every quote and in the summary panel, and asks the student to read the sentence.
- Abstracts often do not cover a claim, so claims checked against an abstract often end at "cannot tell". The app names whether it read full text, an abstract, or pasted text.
- It reads only open-access full text; paywalled papers, PDFs, and web pages must be pasted.
- It supports numbered and APA author-year citations only.
- Its prompt-injection defences lower the risk from hostile text but do not remove it: a hostile source could still steer the model to a real sentence that shares a word with the claim.
- Sentence boundaries come from a rule-based splitter; an abbreviation it does not know can still end a sentence early.
- A reference line the parser does not recognise is joined to the entry above it; step 2 shows every source's text so the student can check.
- Outside services, called only in a live run: Europe PMC (the DOI is sent), OpenAlex (the DOI is sent), and OpenRouter (each claim and its source text are sent, with the student's own key). Free OpenRouter models have rate limits, so a long paragraph can hit them; such calls show as "check failed".
- The key is kept only in the page's memory, never in browser storage, and is forgotten when the student switches to the sample run or closes the page. There is no server, proxy, account, or analytics of ours.
- <Fill in after a real run: which model was used for the recorded example and on what date. Until then the sample in the app is a hand-written synthetic example, and the app says so.>

## How it was built

- TypeScript, React and Vite, built as a static site; Vitest and Testing Library for tests; ESLint and type-checking in GitHub Actions on every push.
- Europe PMC REST API and OpenAlex API for source text; OpenRouter chat completions API for the model.
- The highlighter stroke is adapted from Magic UI's MIT-licensed Highlighter component and draws with rough-notation (MIT). Fonts are Atkinson Hyperlegible and Source Serif 4 (SIL OFL), bundled.
- The project was built by AI coding agents directed by Kesh and reviewed by independent automated reviewers.

## Built with

typescript, react, vite, vitest, openrouter, europe-pmc, openalex, github-actions

## Try it out

- Live demo: <GitHub Pages URL, once deployed>
- Source code: <GitHub repository URL>

## Screenshots to upload

From `docs/screenshots/`, in this order:

1. `desktop-3-results.jpg`: verified sentences highlighted in context.
2. `desktop-4-discarded-and-disagree.jpg`: a discarded grade and two sources that disagree.
3. `desktop-1-paste.jpg`: the paste step with the synthetic sample label.
4. `desktop-2-claims-and-sources.jpg`: claims, uncited sentences, and sources.
5. `phone-2-results.jpg`: the results on a phone.
6. `desktop-6-results-dark.jpg`: the dark theme.
7. `error-2-no-citations.jpg`: an error that says what to fix.

## Video

Script: `submission/DEMO-SCRIPT.md`.
Video link: <YouTube or Vimeo URL after recording>
