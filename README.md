# Claim Check

Paste a paragraph that cites sources, and Claim Check grades each cited claim against the cited source, showing the exact source sentence behind every grade.
If the model's quoted sentence cannot be found word for word in the source, the app throws the grade away and says "cannot tell".

Built for SLAY HACKS 2026.
The full design is in [SPEC.md](SPEC.md).

## Status

This is the walking skeleton: the plain page, the parsing, the evidence check, the provider interface, and the sample run all work and are tested.
The visual design is not done yet.
The sample run is a hand-written synthetic example, and the app says so on screen.
The live model call is written against the documented OpenRouter API and tested only against a recorded-response fake; it has not yet been run with a real key.

## Run it

You need Node 26 and pnpm 10.

```sh
pnpm install
pnpm dev        # local dev server
pnpm test       # unit and component tests
pnpm lint
pnpm typecheck
pnpm build      # static files in dist/
```

## How it works

1. The text is split into body and reference list at a `References` heading.
2. Each sentence with a numeric citation such as `[1]` or `[2, 3]` becomes a claim; sentences without one are listed as not checked.
3. For each cited reference with a DOI, the abstract is fetched from OpenAlex; any other source text is pasted by the user.
4. Each claim is sent with one source's text to a free OpenRouter model, which must answer with a grade, one quoted sentence, and a reason.
5. The app keeps the grade only if the quoted sentence occurs in the source text after normalising quotes, dashes and whitespace.

## What leaves the browser

In the sample run, nothing.
In a live run, each DOI goes to OpenAlex (`api.openalex.org`), and each claim with its source text goes to OpenRouter (`openrouter.ai`) under your own key.
Your key is stored only in this browser: session storage by default, local storage if you tick "remember on this device".
No proxy and no server of ours is involved.
Only OpenRouter model ids ending in `:free` are accepted.

## Limits

Only numeric bracket citations are supported for now.
An abstract often does not cover a claim, so many claims end at "cannot tell" until full-text sources are added.
Sources without a DOI must be pasted, because most websites block reading from another site's page.
