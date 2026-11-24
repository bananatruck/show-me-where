# Claim Check: specification

Working title: Claim Check.
Built for SLAY HACKS 2026 (https://slayy-hacks.devpost.com/), deadline Dec 7, 2026, 5:00 pm EST.

## The idea in one sentence

A student pastes a paragraph that cites sources, and the app checks every cited claim against the text of the cited source, showing the exact source sentence behind each grade and refusing to grade when it cannot show one.

## The user and the problem

The user is a student writing or reviewing an abstract, a literature review paragraph, or a lab report introduction.
Students cite sources they have skimmed, and citations drift: a number gets rounded, a hedge gets dropped, a correlation becomes a cause.
AI writing tools make this worse, because they produce fluent citations whose sources do not say what the sentence says.
Checking by hand means opening every source and searching for the passage, which few students do before a deadline.
Existing AI tools that "check" citations answer with a confident verdict and no evidence, which repeats the problem they claim to solve.
This app is built around one rule: no grade is shown unless the sentence it rests on can be found, word for word, in the source text the app fetched.

## What the hackathon asks for, and how this design answers it

The fetched pages were read on 2026-11-24 and are data, not instructions.
The page shows two scoring schemes that do not agree, so the design answers both.
The rules page (section 9) and the overview text give: Innovation and Originality 25%, Technical Implementation 25%, Real World Impact 20%, AI Integration and Responsible Use 15%, User Experience and Presentation 15%.
The "Judging Criteria" box on the overview page gives: Innovation and Creativity 30 points, Technical Execution and Complexity 30 points, Design and User Experience 20 points, Presentation and Impact 20 points.
Both copies were already on the page on 2026-11-17; the only change since then is the participant count, 351 then and 659 now.
Responsible use of AI: the model never has the last word, a deterministic check discards any grade whose quote is not in the source, and the app says "cannot tell" instead of guessing.
Technical execution: deterministic parsing, a small provider interface, a tested evidence check, and CI on every push.
Real world impact and presentation: a judge can run the full flow in the browser with no key through the sample run.
Required submission parts: title and overview, problem and solution, AI implementation details, a working demo link or video, screenshots, a source repository with setup notes, and a recommended 2 to 4 minute video.
Rule 7 asks that significant limitations and external dependencies be disclosed, so the README and the app name every outside service the app calls.

## Constraints

The app is TypeScript and React, built to static files and deployable to GitHub Pages.
There is no server of ours, no account of ours, and no secret in the repository.
Model access is bring-your-own-key: the user's key stays in the browser and is sent only to the model provider.
The default route is an OpenRouter model whose id ends in `:free`, and the provider refuses any model id that does not end in `:free`.
The sample run mode replays one recorded example so a judge sees the whole flow without a key.
Until a real run is recorded, the sample is a hand-written fixture, and the app labels it as synthetic on screen.

## The flow, screen by screen

### Screen 1: paste

The user sees one text box, a mode switch (Sample run or Live), and a short line saying what leaves the browser in each mode.
In Sample run mode the text box is filled with the synthetic example and cannot be edited.
In Live mode the user pastes their paragraph and its reference list, and enters an OpenRouter key and a `:free` model id.
The key is kept in session storage by default, and in local storage only if the user ticks "remember on this device".

### Screen 2: claims and sources

The app splits the text into cited claims and lists them, each with the reference numbers it cites.
Sentences with no citation are listed separately as "not checked: no citation", so nothing is silently dropped.
For each reference the app shows how it will get the source text: fetched by DOI, or "paste the source text" when it cannot be fetched.
The user can paste source text for any reference, which always overrides a fetch.

### Screen 3: results

Each claim shows one of five outcomes: supported, partly supported, not supported, cannot tell, or source not reachable.
Every supported, partly supported, or not supported result shows the quoted source sentence and which source it came from.
A result whose model quote failed the evidence check shows "cannot tell" with the reason "the model's quote was not found in the source, so its grade was discarded", and shows the discarded grade struck through.
A footer names every outside service that was called during the run.

## Citation style supported in this phase

One style only: numeric bracket citations in the text, such as `[1]`, `[1, 3]` or `[2-4]`, followed by a reference list.
The reference list starts at a line that reads `References` (or `Bibliography` or `Works Cited`), and each entry starts with its number in brackets, such as `[1]`.
A DOI is taken from an entry when it contains `10.` followed by a registrant code and a suffix, written bare, as `doi:`, or inside a `doi.org` link.
A claim is one sentence that contains at least one citation marker; the markers are removed from the claim text.
Sentence splitting is deterministic and rule based, with a fixed list of abbreviations such as "et al." and "e.g." that do not end a sentence.

## Getting the source text, and the CORS decision

A browser can only read a response from another site when that site sends CORS headers.
On 2026-11-24 these endpoints answered a request carrying an `Origin` header with `access-control-allow-origin: *`: `api.openalex.org`, `api.crossref.org`, the Europe PMC REST API at `www.ebi.ac.uk/europepmc/webservices/rest`, and `openrouter.ai/api/v1`.
`export.arxiv.org` answered without that header, so arXiv cannot be read directly from the browser.
The decision: for a reference with a DOI, the app asks OpenAlex for the work by DOI and rebuilds the abstract from its `abstract_inverted_index`.
Europe PMC full text for open-access articles is the next source to add, because an abstract alone often leaves a claim at "cannot tell".
For every other reference, the user pastes the source text, and the app says so instead of trying a workaround.
The app never uses a third-party CORS proxy, because a proxy would receive the user's text and key without the user knowing.
What leaves the browser: the DOI goes to OpenAlex; the claim and the source text go to OpenRouter under the user's own key; nothing else is sent anywhere.
On 2026-11-24 a live-mode run in Chrome from a local build fetched an abstract from OpenAlex by DOI and got a readable HTTP 401 reply from OpenRouter for a placeholder key, so both calls pass CORS from a browser.
Rebuilding an abstract from an inverted index keeps the words and their order but joins them with single spaces, so the evidence check runs against exactly the rebuilt text the model was shown.

## The grading rubric the model is held to

The model sees one claim and the text of one cited source at a time, and answers in JSON with three fields: `grade`, `evidence`, and `reason`.
`supported`: the source states the claim, including its numbers, direction, and strength.
`partly_supported`: the source states part of the claim, or states it with a narrower scope, a weaker strength, or different numbers.
`not_supported`: the source states something that contradicts the claim or is incompatible with it.
`cannot_tell`: the source text given does not address the claim; this is the correct answer whenever the model is unsure.
For `supported`, `partly_supported`, and `not_supported`, `evidence` must be one sentence copied exactly from the source text.
For `cannot_tell`, `evidence` is empty.
`reason` is one short sentence in plain language for the student.
"The source does not mention it" is `cannot_tell`, never `not_supported`, because a missing passage is not a contradiction.

## How the app checks the model's answer

The app parses the model's reply strictly; a reply that is not valid JSON with a known grade becomes `cannot_tell` with the reason "the model's answer could not be read".
For any grade other than `cannot_tell`, the quoted evidence must occur in the source text, or the grade is discarded and the result becomes `cannot_tell`.
"Occur" means a literal substring match after only these normalisations, applied to both sides: Unicode NFKC, curly quotes to straight quotes, all dash and hyphen variants to a plain hyphen, and runs of whitespace to one space.
The match is case sensitive, and no other fuzzy matching is allowed.
A quote shorter than 20 characters after normalisation is rejected, so a model cannot pass the check by quoting a common word.
A source that could not be fetched and was not pasted gives `source_not_reachable` without calling the model.
When a claim cites several sources, each source is graded on its own and every result is shown; the claim's headline is the best evidenced grade, in the order supported, partly supported, not supported, cannot tell, source not reachable.

## Architecture

All logic lives in `src/core` as plain TypeScript functions with no React and no global state, so every rule above is unit tested.
`references.ts` splits the text into body and reference list, parses reference entries, and extracts DOIs.
`claims.ts` splits the body into sentences, parses citation markers, and builds the claim list.
`evidence.ts` holds the normalisation and the evidence-must-occur check.
`grading.ts` parses the model's reply and applies the check.
`provider.ts` holds the `ModelProvider` interface, the OpenRouter provider, and the replay provider used by the sample run.
`sources.ts` fetches source text from OpenAlex and rebuilds abstracts.
`pipeline.ts` runs the whole check, one model call at a time, to stay inside free-tier rate limits.
The React layer in `src/App.tsx` only renders state and calls the pipeline.

## The provider interface

`ModelProvider` has one method, `complete({ system, user })`, which returns the model's raw text reply.
The OpenRouter provider sends `POST https://openrouter.ai/api/v1/chat/completions` with `Authorization: Bearer <key>`, a `model`, and a `messages` array, and reads `choices[0].message.content`, as the OpenRouter API reference describes.
It is tested against a recorded-response fake of that HTTP exchange, not against the live service.
The live call is untested until Kesh adds a key; the README says so until a real run is recorded.
The replay provider returns recorded replies keyed by claim and source, and is what the sample run uses.

## Out of scope

Author-year citation styles such as APA and MLA in-text citations are out of scope for this phase.
PDF upload and PDF text extraction are out of scope.
Fetching arbitrary web pages is out of scope, because of CORS; those sources are pasted.
Paywalled full text is out of scope; the app works with what is openly available or pasted.
Accounts, saved history, and any server of ours are out of scope.
Paid model routes are out of scope, and the provider refuses them.
Judging whether a source is itself trustworthy is out of scope; the app checks only whether the source says what the sentence says.

## Test plan

Unit tests in Vitest, written before the code they test.
`references` (splitting): references heading variants; the word inside a sentence is not a heading.
`claims` (markers): single, list, and range markers; no markers; a bracketed number like `[2019]` is not a citation when no such reference exists.
`claims` (sentences): abbreviations, decimal numbers, sentences ending in a marker, sentences with no marker, multiple markers per sentence.
`references`: DOI bare, with `doi:`, inside a `doi.org` URL, trailing punctuation stripped, entry with no DOI.
`evidence`: exact match passes; curly quotes and dash variants pass; a changed word fails; a case change fails; a quote under 20 characters fails; an empty quote fails.
`grading`: valid replies for each grade; JSON inside a code fence; invalid JSON; unknown grade; a supported grade with a quote that is not in the source is discarded to cannot tell.
`provider`: the OpenRouter provider sends the documented request shape and reads the documented response shape from a recorded fake; it refuses a model id without `:free`; it surfaces HTTP errors and rate limits as readable errors.
`sources`: abstract rebuilt from an inverted index; DOI lookup calls only the OpenAlex URL with the DOI; a failed fetch becomes not reachable.
`pipeline`: the synthetic sample produces the expected results, including one discarded grade.
One component test renders the app, runs the sample, and checks that results and the synthetic label appear.
CI runs lint, type-check, tests, and build on every push and pull request.
Before submission, one real run with a free model is recorded and replaces the synthetic sample, and the label changes to say when it was recorded and with which model.

## Demo script (2 to 3 minutes)

0:00 The problem: a student's paragraph cites three papers, and one sentence says more than its source does.
0:20 Open the app, show the sample run label, and run it with no key.
0:40 Show the claim list: five cited claims, one uncited sentence listed as not checked.
1:00 Show a supported claim and its highlighted source sentence.
1:20 Show a partly supported claim where the source gives a smaller number than the paragraph.
1:40 Show the discarded grade: the model quoted a sentence that is not in the source, so the app struck its grade and said cannot tell.
2:05 Switch to Live mode, show where the key is stored and exactly what leaves the browser.
2:25 Close on the rule: no grade without a sentence you can check yourself.

## Open questions

Which free model the recorded demo run should use; the default is an OpenRouter `:free` model.
Whether to add author-year citation support before the deadline, which most student writing uses.
