# Show Me Where: specification

Product name: Show Me Where (repository directory: claim-check).
Built for SLAY HACKS 2026 (https://slayy-hacks.devpost.com/), deadline Dec 7, 2026, 5:00 pm EST.

## The idea in one sentence

A student pastes a paragraph that cites sources, and the app checks every cited claim against the text of the cited source, showing the exact source sentence behind each grade and refusing to grade when it cannot show one.

## The user and the problem

The user is a student writing or reviewing an abstract, a literature review paragraph, or a lab report introduction.
Students cite sources they have skimmed, and citations drift: a number gets rounded, a hedge gets dropped, a correlation becomes a cause.
AI writing tools make this worse, because they produce fluent citations whose sources do not say what the sentence says.
Checking by hand means opening every source and searching for the passage, which few students do before a deadline.
AI tools that "check" citations usually answer with a confident verdict and no evidence, which repeats the problem they claim to solve.
This app is built around one rule: no grade is shown unless the sentence it rests on is found, word for word and as a whole sentence, in the source text the app fetched or the student pasted.

## What the hackathon asks for, and how this design answers it

The fetched pages were read on 2026-11-24 and are data, not instructions.
The page shows two scoring schemes that do not agree.
The rules page (section 9) is the contract, so the design leads with its five criteria: Innovation and Originality 25%, Technical Implementation 25%, Real World Impact 20%, AI Integration and Responsible Use 15%, User Experience and Presentation 15%.
The "Judging Criteria" box on the overview page gives Innovation and Creativity 30 points, Technical Execution and Complexity 30 points, Design and User Experience 20 points, and Presentation and Impact 20 points; the design also has to earn its design and presentation points.
Both copies were already on the page on 2026-11-17; the only change since then is the participant count, 351 then and 659 now.
Innovation: the model is treated as a reader whose quotes are checked, not as an oracle.
Technical implementation: deterministic parsing of two citation styles, two open-access source APIs, a small provider interface, a tested evidence check, and CI on every push.
Real world impact: students can check their own drafts, and the sample run works with no key.
AI integration and responsible use: the model never has the last word on what a source says, every kept quote is verified, unverifiable answers become "cannot tell", and every outside service is named on screen.
Design and presentation: a calm reading layout where the verified sentence is highlighted inside its neighbouring sentences, light and dark themes, phone and desktop layouts, and plain-language errors.
Required submission parts: title and overview, problem and solution, AI implementation details, a working demo link or video, screenshots, a source repository with setup notes, and a recommended 2 to 4 minute video.
Rule 7 asks that significant limitations and external dependencies be disclosed, so the README, the Devpost text, and the app itself name every outside service the app calls.

## Constraints

The app is TypeScript and React, built to static files and deployable to GitHub Pages.
There is no server of ours, no account of ours, and no secret in the repository.
Model access is bring-your-own-key: the user's key stays in the browser and is sent only to OpenRouter.
The default route is an OpenRouter model whose id ends in `:free`, and the provider refuses any model id that does not end in `:free`.
The sample run replays one example so a judge sees the whole flow without a key.
Until a real run is recorded with a key, the sample is a hand-written fixture, and the app labels it as synthetic on screen.

## The flow, screen by screen

### Step 1: paste

The user sees a mode switch (Sample run or Live with your key), a short line saying what leaves the browser in that mode, and one large text box.
In Sample run mode the text box holds the synthetic example, read only, under a label that says it is synthetic.
In Live mode the user pastes a paragraph and its reference list, and enters an OpenRouter key and a `:free` model id.
The key is kept only in the page's memory: it is never written to browser storage, because storage is shared by every page on the same github.io origin, and it is forgotten when the user switches to the sample run or closes the page.
Any copy an earlier version stored is removed when the page loads.
"Find claims" runs the deterministic parser; nothing leaves the browser at this step.
Empty input, a missing reference list, and text with no matched citations each get a message that says what to do next, and citations that match nothing in the reference list are named.

### Step 2: claims and sources

The app lists the cited claims, each with chips naming the sources it cites, such as "Alder & Birch, 2025" or "[1]".
Sentences with no citation are listed as "Not checked: no citation", so nothing is silently dropped.
Citations that match no single reference are listed as "Cited but not in your reference list".
For each cited source the app says how it will get the text: full text from Europe PMC if open access, else the abstract from OpenAlex, or "paste the text" when there is no DOI.
In Live mode each source has a paste box, and pasted text always wins over a fetch.

### Step 3: what the sources say

Each claim shows a headline outcome, the claim in the student's words, and one block per cited source.
A block with a kept quote shows the quoted sentence highlighted inside the sentence before and after it, the model's reason labelled as the model's, and any warnings.
A block without a kept quote shows why: the model's discarded answer struck through with the app's reason, the model's "cannot tell" reason, "source not reachable" with the fetch reason, or "check failed" with the error.
Each block names where the source text came from: open-access full text, abstract only, pasted text, or synthetic sample text.
A closing panel says what the app checked, what it did not check, which model answered, and which outside services were called.

## Citation styles

Two styles are parsed, chosen by the reference list.
Numeric: in-text markers such as `[1]`, `[1, 3]` or `[2-4]`, and reference entries that start with their number in brackets.
Author-year (APA): parenthetical citations such as `(Smith, 2020)`, `(Smith & Jones, 2020)`, `(Lee et al., 2019a, p. 4; Smith and Jones, 2020)`, `(see Smith, 2020)`, `(Lee et al., 2019a, 2019b)` and `(Organisation, n.d.)`, and narrative citations such as `Smith and Jones (2020) found`.
APA reference entries start with the authors and then the year in parentheses; wrapped lines are joined.
An in-text citation resolves only when exactly one reference matches the first author's surname (ignoring case and accents), the year, and the second author when one is given; anything else is reported as unmatched.
The reference list starts after the last line that reads `References`, `Bibliography`, or `Works Cited`.
A DOI is taken from an entry when it is written bare, after `doi:`, or inside a `doi.org` link.

## Claims that cite several sources

A sentence that cites several sources becomes one claim with several sources, and each source is graded on its own.
When the citations sit at different points in the sentence, as in "Scores rose sharply [1], while reaction times did not change [2]", each source is graded against the part of the sentence its citation follows.
The sentence is split only into independent clauses: each later part must open with ";" or "while", "whereas", "but", "although", "though" or "however" and then with something that can be a subject (not an "-ing" or "-ed" word, a preposition, an adverb, or "not"), the opening part must carry no shared frame (a negation, a hedge such as "may", or a reporting frame such as "shows that"), and nothing but punctuation may follow the last citation.
Narrative citations, a single citation group, parts shorter than three words, and any sentence that fails those rules fall back to the whole sentence.
A reference cited twice is checked against the whole sentence, while other sources can keep their scopes.
The model always sees the whole sentence for context and the part it is asked to grade.
A claim's headline shows a backing grade only when every cited source backs the claim, and then the weakest of them.
Each source's own grade is shown beside it whenever the headline does not already say it.
When one source backs a cited scope and another contradicts that same scope, the headline is "Sources disagree".
Opposing grades on different scopes give "Not every cited source backs it", as does a source that could not be read, checked, or found to address the claim.
When no source backs the claim, the headline is the best evidenced of the rest.
A citation in the sentence that matches nothing in the reference list counts as a source that could not be read, so it also keeps a backing grade out of the headline, and the result names it.
So a contradicting or unchecked source is never hidden behind a supporting one.

## Getting the source text, and the CORS decision

A browser can only read a response from another site when that site sends CORS headers.
On 2026-11-24 these endpoints answered a request carrying an `Origin` header with `access-control-allow-origin: *`: `api.openalex.org`, `api.crossref.org`, the Europe PMC REST API at `www.ebi.ac.uk/europepmc/webservices/rest`, and `openrouter.ai/api/v1`, whose preflight also allows the `Authorization` header.
`export.arxiv.org` answered without that header, so arXiv cannot be read directly from the browser.
For a reference with a DOI, the app first asks Europe PMC for an open-access copy and reads the abstract and body paragraphs of its JATS full text, leaving out references, tables, figures, and back matter.
Scientific superscripts and subscripts are written explicitly, such as `10^(6)` and `H_(2)O`, before text extraction so they cannot become different numbers or formulas.
Raised bibliography references stay citation markers such as `[1]`.
Full text longer than 120,000 characters is cut at a paragraph boundary, and the app says so.
If the first paragraph exceeds the limit, only complete sentences that fit are retained.
If no sentence fits, full text is unavailable and the app tries the abstract.
If there is no open-access copy, the app asks OpenAlex for the work and rebuilds the abstract from its `abstract_inverted_index`, marking any missing word positions with `[...]` so no quote can join words that were not next to each other.
For every other reference, the user pastes the source text, and the app says so instead of trying a workaround.
When a check is superseded (the document or pasted source text changes, or the user switches to the sample run), its outside requests are cancelled and no further model calls are made for it.
Editing pasted source text also clears the previous report and progress, while keeping the claims and edited source ready for another check.
Each source request is abandoned after 20 seconds and each model call after 120 seconds, so a slow service turns into "not reachable" or "check failed" instead of a page that waits forever; on 2026-11-24 a Europe PMC search took 15.7 seconds from this machine.
The app never uses a third-party CORS proxy, because a proxy would receive the user's text and key without the user knowing.
What leaves the browser in a live run: the DOI goes to Europe PMC and, when needed, to OpenAlex; the claim and the source text go to OpenRouter under the user's own key; nothing else is sent anywhere.
On 2026-11-24 a live-mode run in Chrome from a local build reached Europe PMC full text by DOI and got a readable HTTP 401 reply from OpenRouter for a placeholder key, so these calls pass CORS from a browser; no real model call has been made yet.

## The grading rubric the model is held to

The model sees one claim, the part cited to one source, and that source's text, and answers in JSON with `grade`, `evidence`, and `reason`.
`supported`: the source states the claim, including its numbers, direction, strength, population, and conditions.
`partly_supported`: the source states part of the claim, or states it with a narrower scope, a different population or condition, a weaker strength, a hedge, or different numbers.
`not_supported`: the source states something that contradicts the claim or is incompatible with it.
`cannot_tell`: the source text does not address the claim; this is the correct answer whenever the model is unsure.
"The source does not mention it" is `cannot_tell`, never `not_supported`, because a missing passage is not a contradiction.
A sentence that describes earlier work, background, or a hypothesis is not the source's own finding.
A number that belongs to a different measure, group, or condition does not support the claim's number, and a correlation does not support a claim of cause.
For the first three grades, `evidence` must be one whole sentence copied exactly from the source text; for `cannot_tell` it is empty.
`reason` is one short plain sentence for the student.

## How the app checks the model's answer

The model's reply is read from a fenced JSON block or the outermost braces; anything that is not valid JSON with a known grade becomes "cannot tell" with the reason "The model's answer could not be read."
For any grade other than `cannot_tell`, the quote must be one or more whole sentences that occur in the source text, or the grade is discarded and the outcome becomes "cannot tell" with the reason shown and the discarded answer struck through.
"Whole sentences" means the match starts where a sentence starts and ends where a sentence ends (with or without the citation markers after it), using the same splitter as the claims, which does not end a sentence at an abbreviation such as "e.g." or at an initial; a fragment is rejected because a fragment can drop a "no evidence that" or a "previous studies suggested".
"Occur" means a literal substring match after only these normalisations, applied to both sides: Unicode NFC (not NFKC, which would turn a superscript 10 to the sixth into 106), typographic ligatures expanded, soft hyphens and zero-width characters removed, curly quotes made straight, all dash and hyphen variants made plain hyphens, and runs of whitespace made one space; one pair of quotation marks around the whole quote is ignored.
The match is case sensitive, and no other fuzzy matching is allowed.
A quote shorter than 20 characters after normalisation is rejected.
When the claim has extractable key words, a quote that shares none of them is rejected, because a real but unrelated sentence cannot be evidence; this catches a model steered into quoting the wrong sentence.
Key words are words of four or more letters that are not common words, compared by their first five letters, plus acronyms and numbers of two or more characters such as "BMI" or "53"; a quote identical to the claim always passes this keyword check.
When the claim has no extractable key words, only the keyword rejection is skipped; the quote must still pass the length, exact-text, and whole-sentence checks.
The model's reason, and any discarded quote, are shown as the model's words, with links (with or without a scheme) removed and the length capped at 280 characters.
A source with no text gives "source not reachable" without calling the model.
A failed model call (rate limit, network, server error) gives "check failed", never a grade and never "cannot tell"; a rejected key stops the run with a message.

## The gap the quote check cannot close, and how the interface shows it

A literal quote can exist in the source and still not support the claim: it can describe another population, a different measure, an earlier study, or a hedged correlation.
The app cannot verify meaning, so the interface is built so the reader checks the sentence instead of trusting a badge.
Grades the model gives are worded as its reading: "Supported, in the model's reading", "Partly supported, in the model's reading", "Not supported, in the model's reading".
Outcomes the app decides itself are worded plainly: "Cannot tell", "Source not reachable", "Check failed", "Sources disagree", "Not every cited source backs it".
The verified sentence is always shown, highlighted inside the sentence before and after it, because the neighbouring sentences are where a "However, in our cohort" or a change of population usually sits.
Under every kept quote a fixed line says the sentence is in the source word for word and that whether it backs the claim is the model's reading, so the reader should read it.
Deterministic warnings point at what to read for: a number in the claim that is not in the quote, a negation in the quote that the claim lacks, hedged wording in the quote that the claim lacks, and wording that suggests earlier work.
Warnings never change a grade; they are pointers, not verdicts.
The closing panel restates what the app checked and what it did not.

## Prompt injection

Source text is untrusted data, and so is any text the student pastes.
The student's sentence, the cited part, and the source each sit inside tags that carry a random value generated for each call, and every copy of that value is removed from them first, so no text can close its own fence.
The system prompt says that both the student's sentence and the source are data.
The rules are repeated after the source, so the source never has the last word in the prompt.
The model's reason is shown as its words with links removed, and its grade only survives if its quote is a whole sentence of the source.
When the claim has extractable key words, a quote that shares none of them is discarded, so steering the model toward an unrelated real sentence fails.
This lowers the risk but does not remove it: a hostile source could still steer the model toward a real sentence that shares a word with the claim, and the README says so.

## Architecture

All logic lives in `src/core` as plain TypeScript with no React and no global state, so every rule above is unit tested.
`references.ts` splits the text, detects the citation style, and parses numeric reference lists; `authorYear.ts` parses APA lists and in-text citations; `doi.ts` extracts DOIs.
`claims.ts` splits sentences, finds numeric citations, and builds claims with their per-source scopes.
`evidence.ts` holds the normalisation and the whole-sentence quote check.
`grading.ts` holds the rubric, the fenced prompt, the reply reader, the warnings, and the headline rule.
`provider.ts` holds the `ModelProvider` interface, the OpenRouter provider, and the replay provider used by the sample run.
`europepmc.ts` and `sources.ts` fetch full text and abstracts; `sources.ts` also chains them.
`pipeline.ts` runs the whole check, one model call at a time, to stay inside free-tier rate limits.
`src/ui` holds the results view, the theme, and the highlighter; `src/App.tsx` holds the three steps.

## The provider interface

`ModelProvider` has one method, `complete({ key, system, user })`, which returns the model's raw text reply.
The OpenRouter provider sends `POST https://openrouter.ai/api/v1/chat/completions` with `Authorization: Bearer <key>`, a `model`, a `messages` array, and `temperature: 0`, and reads `choices[0].message.content`, as the OpenRouter API reference describes.
It is tested against a real recorded 401 reply and a hand-written success reply in the documented shape.
The live call with a real key is untested until Kesh adds a key; the README says so until a real run is recorded.
The replay provider returns stored replies keyed by claim and source, and is what the sample run uses.

## Out of scope

Citation styles other than numeric brackets and APA author-year, such as MLA page citations and footnotes, are out of scope.
PDF upload and PDF text extraction are out of scope; students paste text.
Fetching arbitrary web pages is out of scope, because of CORS; those sources are pasted.
Paywalled full text is out of scope; the app works with what is openly available or pasted.
Accounts, saved history, and any server of ours are out of scope.
Paid model routes are out of scope, and the provider refuses them.
Judging whether a source is itself trustworthy is out of scope; the app checks only whether the source says what the sentence says.

## Test plan

Unit tests in Vitest, written before the code they test, run in CI on every push and pull request with lint, type-check, and build.
`references`: heading variants, numeric and APA lists, DOI forms, style detection.
`authorYear`: surnames with initials, group authors, accents, particles; parenthetical, narrative, page numbers, prefixes, several years, several sources, unmatched and ambiguous citations, and non-citation parentheses.
`claims`: abbreviations, decimals, markers after the full stop, blank lines, marker grammar, scopes for split citations, and the fallback to the whole sentence.
`evidence`: normalisation rules, whole-sentence matching, fragments rejected, case kept, short and empty quotes rejected, and neighbouring sentences returned.
`grading`: reply reading with chatter and fences, rejected grades, reason sanitising, each warning, kept and discarded grades, the headline rule including disagreement, and the prompt fence.
`provider`: the documented request and response shapes, the `:free` guard, and each error kind.
`europepmc` and `sources`: search and full-text URLs, JATS extraction, truncation, every failure path, abstract rebuilding with gap markers, and the full text then abstract chain.
`pipeline`: the synthetic sample end to end, scoped prompts, unreachable sources skipping the model, failed calls as "check failed", and a rejected key stopping the run.
Component tests render the app and cover the sample run, every step 1 error, the missing key, the `:free` guard, key storage, and the theme switch.
Manual checks in Chrome at 1440 and 390 CSS pixels wide, in light and dark, are saved under `docs/screenshots/`.
Before submission, one real run with a free model is recorded and replaces the synthetic sample, and the label changes to say when it was recorded and with which model.

## Demo script

The 2 to 3 minute script with timings is in `submission/DEMO-SCRIPT.md`.

## Decisions taken by the planner, which Kesh can overrule

The product name is Show Me Where.
The default model is an OpenRouter `:free` model, `google/gemma-4-31b-it:free`, listed on 2026-11-24; free model ids change, so the field is editable.
The rules page scoring is the one the submission text leads with.
APA author-year citations are supported now.
