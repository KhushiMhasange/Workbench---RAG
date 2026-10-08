# Web UI

Next.js 16 (App Router) + React 19 + Tailwind v4. It is a thin client: every fact comes from the
Python backend, and no model runs in the browser.

```bash
npm install
cp .env.example .env.local     # NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
npm run dev                    # http://localhost:3000
```

The backend must be running (`make serve` in the repository root) or the header will show
`offline` and the ask box will report a connection error. CORS is restricted to
`localhost:3000` / `127.0.0.1:3000` on the Python side.

## Pages

| Route | What it is |
|---|---|
| `/` | ask a question; the answer streams token by token over SSE, with citation chips and the full list of retrieved passages |
| `/sources` | the 150 passages with their ids, filterable - the same ids the evaluation set asserts on |
| `/evaluation` | the measured retrieval and groundedness numbers from `data/eval_results.json`, straight from the last `make eval` |

## Design decisions

* **One accent, two themes.** Sage green (`#4e6a52` light, `#8fae92` dark) is used for exactly
  three things: interactive affordances, the brand mark, and the passage a citation points at.
  Everything else is neutral, so a green element always means "this came from the system".
* **Tokens, not hardcoded colours.** Every colour, radius, and shadow is a CSS custom property in
  `globals.css`, exposed to Tailwind through `@theme inline`. Adding a third theme means adding
  one block, not hunting hex codes.
* **Contrast is checked, not eyeballed.** Body text is 16:1 (light) / 14.9:1 (dark); muted text
  6.4:1 / 7.6:1; the sage accent clears 4.5:1 against its own background in both themes, so it is
  safe for text and not only for large type.
* **No flash of the wrong theme.** The theme choice is applied by a tiny inline script in
  `<head>` before first paint, then hydrated by `ThemeProvider`.
* **Refusals are designed, not errors.** A refused answer gets an amber notice that explains
  *why* ("not in the corpus" vs "withheld because the claim could not be verified") and still
  shows the nearest passages, so a user can judge the retrieval themselves.
* **Everything is reachable by keyboard**: citation chips are focusable, the composer submits on
  Enter and inserts a newline on Shift+Enter, focus rings are visible on every interactive
  element, and the streaming region is an `aria-live="polite"` region.
* **Respects `prefers-reduced-motion`**, and never animates layout - the streaming caret is the
  only motion.
* **Responsive from 360px up**: the passage sidebar becomes a disclosure under the answer on
  small screens rather than a horizontal scroll.

## Client code

```
src/
  app/
    layout.tsx          shell, skip link, theme bootstrap, header/footer
    page.tsx            ask page (client)
    sources/page.tsx    corpus browser
    evaluation/page.tsx  server component, reads /api/eval/summary
  components/
    chat-panel.tsx      the conversation state machine
    answer-text.tsx     renders [n] markers as focusable citation chips
    source-list.tsx     passage cards with similarity scores
    corpus-browser.tsx  filterable passage list
    eval-report.tsx     measurement tables
    site-header.tsx     nav + backend status + theme control
    theme-provider.tsx  system/light/dark with no flash
    ui.tsx              Card, Badge, Notice, Stat, Skeleton
  lib/
    api.ts              typed fetch + SSE reader
    types.ts            shared response types
```
