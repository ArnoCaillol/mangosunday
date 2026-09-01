# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Mango Sunday" — a hand-written single-page promotional site for a band, deployed on **Cloudflare Workers + Static Assets** (not Pages). `public/` is served byte-for-byte as written. A Sveltia CMS at `/admin/` lets the band edit six things; saves become commits on `main`, which redeploy the site. The single-file Worker `src/index.js` exists only to relay GitHub OAuth for that CMS.

**Everything is documented in French** — README, comment headers, console output, CMS labels, and even source identifiers. Write new comments and documentation in French to match.

> This repo sits under `C:\Users\inf.03\source\`, whose `CLAUDE.md` describes an unrelated .NET/SQL Server codebase (GMBG-Huissiers). None of it applies here.

## Commands

**There is no build, no test, and no lint step, and none should be added.** No `package.json`, no `node_modules`, no Node toolchain on this machine (`.gitignore` — "Rien a compiler, rien a installer"). `wrangler dev` is never used.

```
powershell -ExecutionPolicy Bypass -File tools/serve.ps1
```

Local preview on http://localhost:8080 serving `public/` via .NET `HttpListener`; add `-Port 8081` when 8080 is bound — the script suggests exactly that. **Mandatory for any front-end work**: `content.js` hydrates with `fetch()`, which browsers block on `file://`, so opening `index.html` directly renders the page in its static placeholder state with no dates and no links.

**Deployment**: pushing to `main` deploys everything — static assets *and* `src/index.js`. There is no deploy workflow and no wrangler CLI invocation in the repo; the two GitHub Actions workflows only compress gallery images and fetch the video thumbnail.

## Architecture

### Request lifecycle

1. **Static assets take precedence over the Worker.** If a file in `public/` matches, Cloudflare serves it and applies `_headers` and `_redirects`.
2. Only unmatched paths reach `src/index.js`: a `switch (url.pathname)` with two literal cases, `/auth` and `/callback`. No router, no method check, no 404 branch.
3. `default` returns `env.ASSETS.fetch(request)` unmodified — which is what keeps `_headers`/`_redirects` semantics intact for everything else.

`wrangler.jsonc` sets no `run_worker_first`, `html_handling`, `not_found_handling`, `compatibility_flags` or `vars`, and no KV/D1/R2. Assets-first is the default and the whole design rests on it. Two defaults are load-bearing: `html_handling: auto-trailing-slash` (what 307s `/mentions-legales.html` → `/mentions-legales` and makes the extensionless `_headers` keys correct) and `not_found_handling: none` — there is **no `public/404.html`**, so an unknown path gets Cloudflare's bare 404. Adding one means setting `not_found_handling` explicitly *and* giving it its own CSP entry. The file overrides dashboard settings; `name` must keep matching the live Worker or a *second* Worker is created instead of updating this one.

### Content round-trip

Editor saves in `/admin/` → Sveltia commits via the GitHub API to `ArnoCaillol/mangosunday`, branch `main`, authored by the editor's own GitHub account, message `Update <collection label> "<file name>"` (`Create …` on a file's first save, cf. `933b94f`) → Cloudflare's Git integration redeploys → `content.js` fetches three JSON files on load and hydrates the volatile blocks. `publish_mode: simple` — no draft/review gate, every save goes live. `/content/*` is cached 300 s, so a save is not visible immediately.

| Collection / file | JSON | Top-level shape read by content.js |
|---|---|---|
| `site` / `general` | `content/site.json` | object: `bandeau`, `ecoute`, `video`, `bio_courte` |
| `dates` / `liste` | `content/dates.json` | **object** `{"dates":[…]}` — unwrapped via `data.dates \|\| []`; items `{date,heure,salle,ville,pays,url_billets,complet}` |
| `galerie` / `photos` | `content/galerie.json` | **object** `{"photos":[…]}` once the CMS has saved — unwrapped via `data.photos \|\| data`, which also tolerates the bare `[]` still on disk; items `{fichier,alt,credit}`, max 8 |

**A top-level `list` field is serialised by Sveltia as an object keyed by the field name, not a bare array.** Applies to every new collection. It already bit `dates.json` on the CMS's first save.

Field-level contracts between `config.yml` and the JS, none of them validated:

- Every `name:` is a literal JSON key read by hand-written JS. A rename that looks cosmetic in the CMS silently makes the block vanish. Field names have a **third** consumer: the `summary:` templates that render each list row in the CMS itself.
- `video.id_youtube` is a *link or* an ID — `idYoutube()` accepts a bare 11-char ID, `youtu.be/…`, `watch?v=`, `/embed/`, `/shorts/`, `/v/`, `youtube-nocookie.com`. Production stores a full `watch?v=` URL.
- `integrationSpotify()` tolerates the `intl-xx/` locale segment and appends `?theme=0`.
- The `date` widget is pinned to `format: YYYY-MM-DD, time_format: false, picker_utc: false` — exactly what `analyserDate()` parses. Changing the format silently drops every date. The `heure` pattern mirrors content.js's own regex, and the URL patterns allow `http://` on purpose to match `urlSure()`.
- `salle`, `ville`, `titre_phare`, `alt`, `bio_courte` are required; everything else is optional, and empty means "hide the block".

### Where content lives (three layers)

- **CMS-editable**, the entire perimeter by design: bandeau, écoute links + featured track, live video, short bio, dates, gallery. Nothing else. (`config.yml:3` still says "cinq blocs" — stale; the numbered blocks and the README both say six.)
- **Hard-coded in `index.html`**: `<title>`, meta description, Open Graph, `h1`, baseline, the **long** bio, and the **band roster** (`<h3>Qui joue</h3>` + `ul.membres`, four `li` each holding `.prenom` and `.instrument`). All SEO-bearing text is served on the first request and is intentionally unreachable from the CMS. The roster shares its `repeat(auto-fit, minmax(190px,1fr))` grid with `.galerie`, so adding or removing a member needs no CSS change.
- **Hard-coded in `mentions-legales.html`**: all four legal placeholders. Layout, art direction, legal notices and SEO are excluded from the CMS by design.

Every bracketed token left in the source renders as a visible dashed `.ph` chip:

| Token | Where | Layer |
|---|---|---|
| `[VILLE]` | index.html, baseline | HTML edit |
| `[BIO LONGUE — 200 mots]` | index.html, section « Le groupe » | HTML edit only |
| `[NOM DE L'ÉDITEUR]`, `[STATUT JURIDIQUE …]`, `[ADRESSE POSTALE]`, `[NOM]` | mentions-legales.html | HTML edit only |
| `[BIO COURTE — 50 mots]` | index.html *and* site.json | CMS `bio_courte` — the one CMS field still holding a literal placeholder |

The hero's `[TITRE DU MORCEAU]` and the video façade's `[VIDÉO LIVE À VENIR]` are **gone on purpose**: their `site.json` values have been filled, so the static HTML now carries neutral fallback copy (`le morceau`, `Vidéo live à venir`) instead of a chip. `le morceau` is *exactly* facades.js's own fallback string — keep the two in sync, or a slow connection shows one wording and the hydrated page another. **Do not reintroduce bracket chips on a block that has real content**; a visitor on a slow link would see them.

The README checklist claims `[VILLE]` also appears in `<title>` and the meta description. **It does not** — those read finished copy. Do not inject a city into them.

### Hydration contract (`content.js`)

- Couples to `index.html` only through `data-*` hooks (`grep -o 'data-[a-z-]*' public/index.html`) plus three ids: `#ld-groupe`, `#dates`, `#groupe`.
- JS creates class names that exist only in CSS, never in the HTML: `.date`, `.jour`, `.salle`, `.lieu`, `.billets`, `.complet`, `.vu`, and the `data-anim` attribute. (`.tri` is the exception — it is in `index.html` *and* recreated by `facades.js`.)
- **`innerHTML` is never used** — `textContent` + `createElement` only — and every URL from JSON passes `urlSure()`, which returns null unless `new URL()` parses with protocol exactly `http:`/`https:`. Convention, not tooling. One inline style survives: `content.js` sets `fig.style.margin = "0"` on each gallery `<figure>`, the only style declaration outside `site.css` (legal under `style-src 'self'` — CSP does not intercept CSSOM setters).
- `estPlaceholder()`: a non-string, an empty/whitespace string, **or anything matching `/^\[.*\]$/`** counts as unfilled and is left alone so the chip stays visible. A legitimate value like `[extrait live]` would be silently discarded.
- `#dates` is the **last** section in `<main>` as served (zone ⑥, after `#booking` ⑤) — with zero or one upcoming date it renders at the bottom of the page. With ≥2 upcoming dates `groupe.parentNode.insertBefore(section, groupe)` moves it above `#groupe` ④, jumping `#booking` too. That call succeeds whatever `#dates`'s own parent is; the result is sane only because both are direct children of `<main>`. Nesting either changes where `#dates` lands.
- Past dates are filtered against the **visitor's local clock**; a date with no `heure` defaults to **23:59**, which is what makes "a past date disappears by itself the next day" true. Nothing prunes `dates.json` server-side.
- `ecoute.liens` is one object driving three renderings — the "Écouter ailleurs" list, the footer socials, and the JSON-LD `sameAs`. They cannot diverge.
- JSON-LD is built two ways: `sameAs` is mutated in place inside the existing `#ld-groupe` script; MusicEvents are appended as a **separate** script holding a bare array that references the group by the hard-coded `{"@id":"https://mangosunday.com/#groupe"}` — keep it in sync with the seed in `index.html`.
- `animerBandes()` runs *before* any fetch, so stripe animation survives total content failure.

### The loading veil (`data-attente`)

Hydration cannot start before `content.js` has been fetched and parsed, so there is always a window where the static fallback copy is on screen. `[data-attente]` covers a volatile block with an opaque shimmering `::after` for that window. It is on the hero's track label and the short bio; **not** on `.facade-vide`, which is already `position:absolute` — `[data-attente]{position:relative}` has the same specificity and would win, displacing the element.

The veil cannot get stuck, and it takes all three guardrails together:

1. `revelerBlocs()` strips every `data-attente` in a **`finally`**, so even an exception mid-hydration reveals the page.
2. If the script never arrives at all (network cut, JS disabled), the CSS `abandon` animation retires the veil by itself at 6 s via `fill: forwards`, uncovering the hard-coded fallback text.
3. Under `prefers-reduced-motion`, the global `animation-duration:.01ms !important` rule at the end of `site.css` collapses both animations, so those visitors get no shimmer and an immediate reveal.

Guardrail 3 is why the veil must never be built from `transition`s or from JS-driven timing — it relies on that global rule catching it.

The veil is **opaque on purpose**: a translucent tint lets the `[BIO COURTE]` chip underneath show through, which defeats the point.

**`<link rel="modulepreload" href="/js/facades.js">` in the `<head>` is load-bearing.** `facades.js` is a static `import` of `content.js`, so without the hint the browser cannot discover it until `content.js` is parsed — measured as a full extra round trip before hydration (facades.js started at 373 ms instead of 13 ms). Deleting the line silently lengthens the veil window on exactly the slow connections it exists for.

### Privacy posture

Zero third-party requests fire before a user click. Measured: the homepage is 12 requests / 18 KB against a single host, while the YouTube iframe alone costs **14 requests, 965 KB and four Google hosts** (`youtube-nocookie.com`, `fonts.gstatic.com`, `www.google.com`, `jnn-pa.googleapis.com`) before anyone presses play. `nocookie` does suppress cookies — 0 were set — but the requests still carry the visitor's IP, so **the absence of a cookie banner rests on making no request at all, not on the nocookie domain.** Loading the player eagerly, or sourcing the thumbnail from `i.ytimg.com`, both cost that property and would require a consent banner.

The video thumbnail is therefore **self-hosted**, fetched server-side by CI (see below). Spotify/YouTube players stay CSS/thumbnail façades; `facades.js` injects the iframe only on click (`{once:true}`, `loading="lazy"`, `referrerPolicy="strict-origin-when-cross-origin"`, YouTube always via `www.youtube-nocookie.com`). Fonts are self-hosted (4 woff2, latin subset) so no font CDN sees the visitor's IP. This is the whole reason the site ships with **no cookie banner**, and `frame-src` in `_headers` makes it structural.

### Visual identity (`site.css`)

- Tokens live in one `:root`, French-named. `--encre` and `--nuit` are the same hex under two semantic names. The tokens are the only source of truth *inside the stylesheet*, but the palette is hand-copied twice outside it: `assets/favicon.svg` hard-codes five of the hexes and redraws the stripe motif as three `<rect>`s, and `index.html` repeats `--creme` as `<meta name="theme-color">`. A palette change is three edits.
- **`--grain` has a mandatory application pattern.** It goes on a dedicated `::after` — `content:""; position:absolute; inset:0; z-index:0; pointer-events:none` — never straight into `background-image`, where the noise paints at full opacity and drowns the ground colour. Blend mode differs by ground: `multiply` at `opacity:.06` on light (`.hero`, `.booking`), `screen` at `.09` on `.nuit` (multiplying on near-black is invisible). Each zone's inner wrapper (`.hero-in`, `.bloc-in`) needs `position:relative; z-index:1` to stay above the grain layer. `--grain` is an inline SVG data URI, which is why `img-src 'self' data:` is load-bearing.
- **One theme only, asserted not defaulted.** No `prefers-color-scheme` block exists anywhere; the light theme *is* the band's identity. Media queries are exactly `max-width:560px`, `min-width:900px`, `prefers-reduced-motion:reduce`, `print`.
- `index.html` and `site.css` are numbered in lockstep with circled digits ①–⑦ marking the same zones. To find a section's CSS, search for its digit.
- Naming is French, hyphenated, **not BEM** — variants are co-applied classes (`bloc nuit`, `btn btn-primaire`, `bandes bandes-nuit`).

## Traps

### The CSP / COOP / OAuth cluster

This is where the project has already regressed twice.

1. **Never put a CSP in the global `/*` block.** Cloudflare *cumulates* headers from every matching rule, and a browser receiving two CSPs applies their **intersection** — a strict `/*` CSP renders the deliberately looser `/admin/*` CSP inert and the admin comes up blank. Fixed in `1a17cd1`. Corollary: **every new HTML page needs its own CSP entry in `_headers` or it ships with no CSP at all.**
2. **Never put `Cross-Origin-Opener-Policy` on `/admin/*`.** COOP `same-origin` on the page that *opens* a popup severs `window.opener` the moment the popup navigates to another origin. The admin opens a popup to GitHub; the token came back with nobody to hand it to and Sveltia reported a bare "Authentication aborted". COOP is on `/`, `/mentions-legales`, `/confidentialite` and nowhere else. Fixed in `2fd1750`; `src/index.js` still carries the defensive `!window.opener` branch.
3. **`/callback` ships its own per-request nonce CSP** plus `Cache-Control: no-store` and `X-Robots-Tag: noindex, nofollow`, and deliberately no COOP. Do not "consolidate" it into `_headers` or drop the nonce — under `script-src 'self'` the inline relay script is blocked silently and the login popup spins forever with no error. Its `style-src 'unsafe-inline'` exists for one reason: the relay page carries a `style=` attribute on `<body>`. Tighten it to `'none'` and the error message renders unstyled at full width.
4. **The relay posts to `window.location.origin`**, not a configurable origin, so `base_url` in `config.yml` must be the exact origin serving `/admin/`. A mismatch makes the browser discard the message silently — the historic `ORIGINE_ADMIN` failure mode, eliminated on purpose.
5. **No inline *executable* `<script>` and no `onclick=""` on any public page.** Homepage is `script-src 'self'` with no `'unsafe-inline'`; the two legal pages are `script-src 'none'`. The one inline block, `<script type="application/ld+json" id="ld-groupe">`, is a data block — not executed, not subject to `script-src` — and `content.js` rewrites its `textContent` in place.
6. **The `Permissions-Policy` allowlist is deliberately short.** `autoplay`, `fullscreen`, `encrypted-media`, `clipboard-write` and `picture-in-picture` are *not* denied, because `facades.js` injects both players with `allow="autoplay; clipboard-write; encrypted-media; picture-in-picture"` + `allowfullscreen`, and the YouTube embed URL carries `autoplay=1` so the video starts on the click that consented to it. "Hardening" the header with the usual `autoplay=(), fullscreen=()` breaks click-to-play with no error — and `serve.ps1` sends no `Permissions-Policy`, so it cannot be reproduced locally.
7. **Cloudflare's Worker Settings page has TWO "Variables and secrets" sections.** The one inside *Builds* feeds the build and is never visible at runtime. `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` go in the **first** section, the Worker's own. Wrong section ⇒ `/auth` redirects to GitHub with `client_id=undefined`.
8. **A newly added secret applies only to the NEXT version.** The running version keeps going without it — trigger a redeploy or the fix appears to do nothing.
9. **Do not create `public/auth` or `public/callback`.** Either shadows the OAuth relay silently — no Worker log entry at all.

`/auth` mints `crypto.randomUUID()` as state, sets `etat=<uuid>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`, and 302s to GitHub with `scope=public_repo,read:user` (deliberately not `repo`). No `redirect_uri` is sent — the callback URL lives entirely in the GitHub OAuth App registration. `/callback` verifies the cookie against the returned state, POSTs **JSON** `{client_id, client_secret, code}` with `User-Agent: mangosunday-oauth`, clears the cookie, and hands the token over with the Decap/Sveltia protocol: `'authorization:github:success:' + JSON.stringify(JSON.stringify(resultat))` — the **double** stringify is required, as is the listen-for-`message`-then-resend handshake. Every outcome returns **HTTP 200**, including a failed exchange, which posts `{error: "…"}` (GitHub's `error_description`, or `"GitHub injoignable"` when the fetch itself throws). Outages never appear as non-2xx in Workers observability.

### `_headers` specifics

Load-bearing tokens: homepage `frame-src https://open.spotify.com https://www.youtube-nocookie.com https://bandcamp.com` — the first two are what the facades inject; **bandcamp.com is currently unused**, do not read it as proof a Bandcamp embed exists. Homepage `connect-src 'self'` is what allows hydration at all. In the admin CSP, the unpkg/jsdelivr entries exist because Sveltia is CDN-loaded; `connect-src data:` and `https://www.githubstatus.com` were each added after being observed blocked; `manifest-src 'self' blob:` exists only for Sveltia's PWA manifest — **the public site is not a PWA**.

Rule keys are extensionless on purpose (see `html_handling` above; links, canonicals and the sitemap were realigned in `208e20e`). `_redirects` has exactly one rule, `/admin  /admin/  301`, and it is what puts requests inside the `/admin/*` header scope — `/admin` does not match `/admin/*`, so deleting the redirect serves the CMS without its loosened CSP.

### The production domain is already wired in everywhere

`https://mangosunday.com` is hard-coded across seven files under `public/` — canonical, `og:url`, `og:image` and all four JSON-LD URLs in `index.html`; the canonicals of both legal pages; the `Sitemap:` line of `robots.txt`; the single `<loc>` in `sitemap.xml`; and the `@id` pair in `content.js` — while the site actually serves from `mangosunday.arnaud-caillol.workers.dev`. This is deliberate: the `X-Robots-Tag: noindex` in `_headers` is what makes it harmless until the domain is branched. **Do not "fix" these to the workers.dev origin.** The only origin that must match reality today is `base_url` in `config.yml`, plus the OAuth callback URL. (The README points the band at `https://mangosunday.com/admin/`, which does not resolve yet; the working address is the workers.dev one.)

Cutover is three coordinated edits, all required together:

1. GitHub OAuth App callback URL → `https://mangosunday.com/callback`
2. `base_url` in `config.yml` → the new origin (trap 4)
3. Delete `X-Robots-Tag: noindex` **from inside the `/*` block** of `_headers`. `_headers` is a block format — an indented line belongs to the preceding path, so appending it at the end of the file would land it in `/content/*` and cover only the three JSON files. This makes only the homepage indexable, and that is the intent: both legal pages carry their own permanent `<meta name="robots" content="noindex, follow">` and `sitemap.xml` deliberately lists `/` alone, its comment noting that listing noindex pages would be a contradictory signal. **Do not remove the per-page metas along with the global header**; `follow` rather than `nofollow` is also deliberate, so link equity still flows from the footer.

### Both list collections are unwrapped in `demarrer()` — keep it that way

`monterDates` and `monterGalerie` both bail on a non-array (`monterGalerie` on `!Array.isArray(items)`), and Sveltia writes a top-level list as an object. So `demarrer()` unwraps each one inline: `data.dates || []` for dates, `data.photos || data` for the gallery. The gallery form differs on purpose — `|| data` keeps working while `galerie.json` is still the hand-committed bare `[]`, and starts unwrapping by itself the moment the band's first save turns it into `{"photos":[…]}`.

Removing either unwrap reintroduces a failure with no console error: the block simply never renders and `[data-bloc-galerie]` stays hidden. Dates hit this in `56d1227`; the gallery was fixed later, before any photo had been published. **A fourth collection needs the same treatment on the day it is added, not on the day it breaks.**

### Other failure modes

- **All three reads now carry their own `.catch()`**, so the `Promise.all` cannot reject and mounting always runs. This is load-bearing, not tidiness: `site.json` used to have none, and a single failure on it returned from `demarrer()` *before any mounting*, blanking dates, gallery, platform links and footer socials at once. Removing any of the three catches brings that back — and now also strands the loading veil.
- **Unguarded `querySelector` derefs**: `[data-bandeau-texte]`, `[data-bloc-plateformes]`, `[data-bloc-galerie]`, and `bouton.disabled` in both facade mounts. Renaming an inner hook throws mid-hydration; because the facade mounts run last and there is no try/catch, both play buttons stay dead.
- **Booleans are compared with `=== true`.** A string `"true"` in `bandeau.actif` or `complet` makes the banner never show, and a sold-out concert render its ticket link.
- **`plateforme` offers spotify/bandcamp/youtube but only Spotify can embed**, and only when `url_phare` is an `open.spotify.com` URL matching `/track|album|playlist|artist|episode/ID`. Anything else replaces the `<button>` with an `<a target="_blank">` — a working but different UI. Note `bouton.replaceWith(a)` discards the whole button, **including the `[data-titre-phare]` span and its dashed chip**: with an unfilled `titre_phare` the link just reads "Écouter le morceau". That is the one place where a missing chip is not evidence of filled content. The chip persists only in the other branch — an invalid `url_phare`, which just leaves the button `disabled`.
- **Two divergent placeholder tests**: `estPlaceholder()` in content.js (not exported) vs the weaker `titre && !titre.startsWith("[")` in facades.js. They disagree on values like `" [TITRE]"`.
- **`ecoute.liens` keys must stay in sync with `etiquette()`** in facades.js (spotify, bandcamp, youtube, instagram, deezer, apple), which falls back to `|| cle`. A seventh platform renders a link labelled with the raw lowercase key.
- **An element toggled by `hidden` needs its own `[hidden]{display:none}` rule as soon as its base rule sets a `display`** — otherwise that `display` beats the UA `[hidden]` rule and the "empty field makes the block disappear" promise breaks. Load-bearing today: `.bandeau` and `.dates` (both `display:flex`). `.bloc` and `.etat-vide` also carry the rule but set no `display`, so theirs is belt-and-braces.
- **The 3px `--encre` border on `.btn` is accessibility, not decoration**: mangue on sable is 1,65:1 against its surround and the border is what satisfies WCAG 1.4.11. On light grounds text must be `--encre`/`--terre-encre`/`--brun-encre`, never mangue/orange (2,1:1); mangue is typographic only inside `.nuit` (7,2:1) — the sole asymmetry in the palette and the only reason the dark band exists.
- **The hero has a hard vertical budget**: the play button must stay visible without scrolling at 360×640 with the banner active. Breakage is invisible on desktop.
- **`.bandes` is exactly five `<i>` children** with hard-coded nth-child heights/widths/colours (the logo gradient order), hand-copied into **five** places across three HTML files: `index.html` ×3 (after the hero, the `bandes-nuit` variant, the footer), `mentions-legales.html`, `confidentialite.html`. A separate three-`<i>` variant, `.facade-bandes`, sits in the video façade and follows its own rules. Adding or removing a child in any of them falls outside the nth-child rules and the stripe silently disappears.
- **Never hard-code `data-anim` into the HTML.** CSS uses it to collapse stripes to `scaleX(0)`; only JS adds it, after checking `prefers-reduced-motion` and `IntersectionObserver`. Without JS the stripes are simply visible; hard-coding it makes them permanently invisible.
- **Dead ternary** in the JSON-LD builder: both branches of `eventStatus` are `"https://schema.org/EventScheduled"`. Correct action is to collapse it, not to invent a SoldOut status — sold-out is already expressed as `availability: SoldOut` on the offer.
- **`analyserDate` is rollover-tolerant**: `"2026-13-01"` gives `mois = 12`, `MOIS[12]` is `undefined`, and the row renders the literal text "undefined". Unreachable through the CMS, reachable by hand-editing `dates.json`.
- **Gallery `<img>` is hard-coded `width=600 height=400`** — deliberate layout reservation, not intrinsic dimensions (CI resizes to 1600 px, CSS forces `aspect-ratio: 3/2; object-fit: cover`). "Correcting" it reintroduces layout shift.
- **Logo replacement needs no code change**: overwrite `assets/img/logo.webp`, keep it square. `og.png` is 358 KB — above the size where some messengers stop generating a preview; only PNG export is available on this machine.

### The local server is not production

`tools/serve.ps1` applies **neither `_headers` nor `_redirects`**, has no route table, and emits only `Content-Type` plus `Cache-Control: no-store`. Consequences:

- `/mentions-legales` and `/confidentialite` **404 locally** — it only appends `index.html` to paths ending in `/`. Use `.html` locally; the 404 is not a broken link. `/admin` 404s too; type `/admin/`.
- CSP/COOP/Permissions-Policy regressions are invisible locally and appear only after deploy.
- `/auth` and `/callback` do not exist locally, so **admin login from localhost cannot complete** — the popup hangs silently because the relay posts to the workers.dev origin, not `localhost:8080`. Worse, `base_url` points at production: a successful local login would commit to the real `main`. Edit content through the deployed `/admin/`.
- Caching is inverted (`no-store` locally vs 1 year / 7 days / 300 s in production), so cache staleness can never be reproduced locally.
- The MIME map is a **closed list** (html/css/js/mjs/json/svg/png/jpg/webp/avif/woff2/ico/txt/xml/yml — so `/admin/config.yml` is readable locally); everything else is served as `application/octet-stream`. A new asset type fails locally and works in production — add the extension to `$types` rather than debugging the page.
- There is **no per-request try/catch**: the whole loop sits inside one `try/finally`, so a single exception (a client aborting mid-write, a locked file) ends the loop and stops the server. An unexplained "server stopped" means restart it.
- Root is `$PSScriptRoot/../public`, so the script must stay in `tools/`. It binds `http://localhost:$Port/` only — not reachable from a phone on the LAN, but no elevation needed. The traversal guard is a case-insensitive string-prefix check with no trailing-separator normalisation; fine for localhost, do not lift it into anything exposed.

### CI image pipeline (`.github/workflows/optimise-images.yml`)

The first of the repo's two build steps, added deliberately against the project's no-build rule. Triggers only on push to `main` touching `public/assets/img/galerie/**`. Resizes to max 1600 px (`withoutEnlargement`), JPEG q82 progressive mozjpeg, PNG compressionLevel 9 + `palette: true`, then derives `.avif` (q55/effort 4) and `.webp` (q78) as **same-basename siblings** — a contract `content.js` reconstructs independently by string-stripping the extension. There is no manifest on either side. sharp is pinned in the workflow YAML; with no `package.json`, that line *is* the dependency declaration.

- **The anti-loop guard is `if: github.actor != 'github-actions[bot]'`**, and it works only because the push uses the default `GITHUB_TOKEN` identity. Switching to a PAT or deploy key re-arms an infinite loop; the `concurrency` group serialises runs but does not stop them. `permissions: contents: write` is what lets the bot push at all — remove it (or flip the repo to read-only default permissions) and every run goes green through the optimise step then 403s on `git push`.
- **There is no `workflow_dispatch`.** To re-run the pipeline you must actually change a file under `galerie/`.
- **A gallery upload produces two deployments** (editor's commit, then the bot's optimisation commit) — a visitor in that window gets the uncompressed image, because the `.avif`/`.webp` siblings do not exist yet. The CMS caps uploads at 1 500 000 bytes and 8 photos, so CI compression is a second line of defence, not the first.

**`<picture>` does not fall back on a 404 — verified, and this is load-bearing.** A `<source>` is chosen on MIME type alone, never on whether the file exists; once chosen, a 404 is a final load error and the `<img src>` is *not* tried. Since the derivatives only appear after the bot's commit, every freshly uploaded photo would render broken for the whole two-deployment window, and any image CI skips would stay broken forever. `pictureAvecDerives()` in facades.js is what prevents that: on the first `error` it strips the `<source>` elements and retries the original file, which is the only one guaranteed to exist. Both the gallery and the video thumbnail go through it. **Do not "simplify" it back to a plain `<picture>`**, and note its `error` listener deliberately omits `{once:true}` — it must fire once per fallback tier.
- **`.rotate()` bakes in EXIF orientation.** A portrait phone photo is physically rotated by the bot commit, which is why a re-upload sometimes "fixes" a sideways photo on its own.
- **Derivatives are made from the recompressed file, not the original.** Steps 1–2 rewrite the source in place, then step 3 re-reads it, so `.avif`/`.webp` inherit the q82 JPEG's generation loss. Raising JPEG quality improves all three outputs; raising only AVIF/WebP quality cannot recover what step 2 discarded.
- **`readdir` is not recursive** but the path filter is `**`. A photo in `galerie/2026/` triggers a full CI run and is silently skipped, then served unoptimised. It still *displays*, but only because of `pictureAvecDerives` — see below; the fallback is not something `<picture>` does on its own.
- **Only `.jpg`/`.jpeg`/`.png` are processed.** Anything else (`.webp`, `.heic`, …) is committed and served untouched.
- **Derivative names collide across extensions**: `photo.jpg` and `photo.png` both write `photo.avif`/`photo.webp`; readdir order decides the winner.
- **Per-image failures are swallowed** — logged as `ignorée <file>` and the step stays green. A total failure is indistinguishable from an already-optimised folder except in the job log.
- **Staleness is mtime-based and meaningless on CI** (`actions/checkout` rewrites all timestamps). Replacing an image under the same filename can leave the previous `.avif`/`.webp` in place, so modern browsers show the old photo while the `<img>` fallback holds the new one. Combined with the 7-day `/assets/img/*` cache: **always give a new photo a new filename.**
- PNGs re-enter the recompression branch every run (`isProgressive` is never set for PNG output), so idempotence rests on byte-identical sharp output plus the `git status --porcelain` check. `palette: true` also quantises to 256 colours, which bands photographic PNGs.
- `public/assets/img/galerie/` is empty and therefore untracked — it does not exist in a fresh clone; the script handles that by logging and returning.

### Video thumbnail pipeline (`.github/workflows/vignette-video.yml`)

The repo's **second** build step. Triggers on push to `main` touching `public/content/site.json`, plus `workflow_dispatch` — the gallery workflow's lack of a manual trigger is a known annoyance, and here it is also the only way to generate a thumbnail for a video that is already in place. Downloads `i.ytimg.com/vi/<id>/{maxresdefault,sddefault,hqdefault}.jpg` server-side, recompresses with the gallery's exact settings, derives `.avif`/`.webp`, and commits to `public/assets/img/video/`.

- **The filename carries the video id** (`vignette-<id>.jpg`). `_headers` caches `/assets/img/*` for 7 days, so overwriting a fixed name would serve the previous video's thumbnail for a week. `facades.js` rebuilds the same path from `idYoutube()` — no manifest on either side, same convention as the gallery derivatives.
- **`idYoutube()` is duplicated into the CI script**, and the copy is marked as such. It cannot be imported: with no `package.json` there is no `type` field, so Node reads a `.js` as CommonJS and the ES import fails. **Changing `idYoutube()` in facades.js means changing it in `vignette-video.mjs` too** — if they diverge, CI writes a file under a name the browser never requests, the thumbnail silently never appears, and the abstract façade just stays.
- **YouTube sometimes serves a grey 120×90 image instead of a 404**, so variants under 640 px wide are rejected rather than trusted.
- If no variant is usable the script **returns without deleting anything** — keeping a stale thumbnail beats falling back to the abstract façade by accident.
- Source and derivatives are checked separately, so a `.jpg` dropped in by hand gets its `.avif`/`.webp` completed on the next run rather than being treated as already done.
- No loop is possible: the trigger watches `site.json` while the job only ever commits images, and the `github.actor` guard backs that up.
- `.facade` keeps its abstract decor (`.facade-soleil`, `.facade-bandes`) until the image actually loads — `facades.js` adds `a-vignette` in the `load` handler, never optimistically. The `::after` scrim exists so the play button's contrast does not depend on the photo underneath.

### CMS pinning

**Do not remove the version pin** (`@sveltia/cms@0.201.1` on unpkg — the CMS is pre-1.0 and the admin could break overnight with no repo change) and **do not add `type="module"`** (the distributed bundle is a classic script). The config is kept Decap-compatible so swapping CMS means replacing exactly that one script tag. `media_folder` is the repo path `public/assets/img/galerie`; `public_folder` is the browser path `/assets/img/galerie` — `content.js` independently rejects any `fichier` not starting with `/assets/img/` or `assets/img/`.
