# Mission Builder

All three phases of the platform-builder concept in one deployable app: a
mission pack library, a guided Claude-powered setup interview, and live
connector-spec generation for physical sensing assets. Standalone
Node/Express app — the frontend never sees your Anthropic API key, every
call to Claude happens server-side.

## Architecture

```
public/library.html  → Phase 1: browse mission packs (outcomes, asset
                        types, scenario library, autonomy defaults, gaps)
public/index.html     → Phase 2 + 3: the setup interview (chat UI + live
                        manifest panel), with per-asset connector-spec
                        generation for physical/hardware assets
server.js             → Express server: serves the frontend, calls Anthropic
packs.js              → mission pack definitions (single source of truth)
```

- `GET /api/packs` — returns the full mission pack library, used by both
  the library page and the interview's pack picker.
- `POST /api/interview-turn` — takes the running conversation + manifest
  state, calls the Anthropic Messages API with a forced tool call so the
  reply always comes back as structured JSON (no prompt-and-hope parsing),
  and returns it to the browser. For any physical asset the user mentions,
  the agent asks for manufacturer/model/other details before recording it.
- `POST /api/generate-asset-spec` — Phase 3, now grounded in a real web
  search rather than pure model recall. Two Anthropic calls: (1) a research
  pass using Anthropic's hosted `web_search_20250305` tool, which looks up
  the actual manufacturer/model and reports what it found plus source
  URLs; (2) a forced tool call that turns those findings into the
  structured spec (protocol, data format, field mapping, confidence,
  sources, what still needs verifying). Kept as two separate calls
  deliberately — forcing `tool_choice` onto the structured tool in the same
  call would compete with letting the model search freely first.
- A simple in-memory per-IP rate limiter guards `/api/interview-turn`; a
  tighter one guards `/api/generate-asset-spec` specifically, since the
  added web-search round trip costs more (tokens + Anthropic's per-search
  fee) than a plain interview turn. Neither is production-grade (resets on
  redeploy, single process) — swap in Redis or a DB-backed limiter before
  this sees real traffic.

## Run it locally

```bash
npm install
cp .env.example .env      # then edit .env and paste your real key
npm start
```

Visit `http://localhost:3000` for the setup interview, or
`http://localhost:3000/library.html` for the pack library. The library's
"Configure this pack" button links to the interview with that pack
preselected (`/index.html?pack=<id>`).

## Deploy to Render

1. Push this folder to a GitHub repo.
2. In the Render dashboard: **New +** → **Blueprint**, point it at the repo
   (it will pick up `render.yaml` automatically). Or: **New +** → **Web
   Service**, connect the repo, set:
   - Build command: `npm install`
   - Start command: `npm start`
3. In the service's **Environment** tab, add `ANTHROPIC_API_KEY` with your
   real key. `render.yaml` intentionally leaves this as `sync: false` so
   Render prompts you for it instead of expecting it in the repo — **never
   commit your actual key**.
4. Deploy. Render gives you a `https://<service-name>.onrender.com` URL.

## Known limitations to fix before wider use

- **No auth** — anyone with the URL can run interviews and generate specs,
  spending your API budget, bounded only by the per-IP rate limiter. Fine
  for a small internal demo; add a shared passphrase or real auth before
  sharing more broadly.
- **No persistence** — conversation and manifest state (including
  generated connector specs) live only in the browser tab. A refresh loses
  progress. Worth adding a database (Render Postgres, or even SQLite) once
  this is validated, so manifests can be saved, revisited, and compared
  across sessions.
- **Two mission packs** — `packs.js` currently has Health Event
  Surveillance and Water System Contamination. Adding a new pack is just
  adding an object to the `PACKS` array; no other code changes needed on
  either page.
- **Connector specs are drafts** — the model is instructed to flag
  low-confidence/unrecognized devices rather than guess confidently, but
  every generated spec still needs a real engineer to verify against
  actual vendor documentation before anything gets built against it.
