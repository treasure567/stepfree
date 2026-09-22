<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

## StepFree — project guide

StepFree is a live step-free transit rerouter (curated 9-station London pilot): it watches official sources for lift outages, verifies the evidence behind a human-review gate, reroutes journeys live, and alerts travellers by email. Next.js 16 (App Router, `output: "export"`) served from Convex via `@convex-dev/static-hosting`; Convex is the entire backend.

### Deploy — prod deployment `whimsical-ferret-778` → https://whimsical-ferret-778.convex.site

- Production builds must target prod Convex. `.env.production.local` (gitignored) pins `NEXT_PUBLIC_CONVEX_URL` / `NEXT_PUBLIC_CONVEX_SITE_URL`; without it a production build bakes the localhost URL from `.env.local` and the deployed page loads but its queries never resolve.
- Backend: `pnpm exec convex deploy -y` (the `-y` is required — the confirmation prompt can't be answered non-interactively).
- Frontend: `pnpm build`, then `pnpm exec static-hosting upload --dist out --prod` (the Next static export lands in `out/`, not `dist/`). `pnpm deploy` is pnpm's own builtin — use `pnpm run deploy` to hit the script.
- After deploying, verify on the deployed URL in a fresh browser and hard-reload (Cmd/Ctrl+Shift+R). `public/sw.js` is network-first and does not cache JS, but bump its `cacheName` when the app shell changes.
- OSM/HOT map tiles are slow on first paint (~3–5s; "Loading map" shows until then) — not a bug.

### Env vars

Set with `printf '%s' <value> | pnpm exec convex env set <NAME> --prod --force` (omit the value so it reads stdin; passing `-` as the value literally stores "-").

- AgentMail sends over **SMTP** because the hackathon key lacks the REST `message_send` scope: `AGENTMAIL_SMTP_USER=stepfree@agentmail.to`, `AGENTMAIL_SMTP_PASS=<inbox id>`. Sender is `convex/emailSend.ts` (`"use node"` + nodemailer).
- `DEMO_ALERT_RECIPIENT` — fallback recipient for `/proof` alerts; must be a real email, never the inbox id.
- `AGENTMAIL_WEBHOOK_SECRET=whsec_…` — Svix signing secret for the unified `/webhooks/agentmail` endpoint.
- `PARTNER_WEBHOOK_SECRET` — HMAC secret for `/webhooks/partner/lift-status`.

### Tests & CI

- Run tests with `CONVEX_AGENT_MODE=anonymous pnpm test` (vitest). convex-test needs components registered via `test/register-components.ts` (rate-limiter, both workpools, workflow); shared seed helpers live in `test/seed.ts`.
- CI (`.github/workflows/ci.yml`): install → lint → test → build. Two gotchas: pnpm fails on ignored native build scripts in CI, so `pnpm-workspace.yaml` `allowBuilds:` must include `esbuild` and `unrs-resolver`; and `next build` type-checks the mounted `@convex-dev/workpool` source (BigInt literals), so the root `tsconfig.json` `target` must be `ES2022`+. The build step also needs a dummy `NEXT_PUBLIC_CONVEX_URL`.

### Key subsystems

- **Routing** — deterministic Dijkstra in `convex/lib/transit.ts` behind a human-review gate. A route is blocked only when an incident is `severity: "route-blocking"` **and** `humanReviewed`; unreviewed feeds stay advisory.
- **Telemetry** — `convex/activity.ts` `logActivity(ctx, …)` records every meaningful action with the provider that performed it (`convex`/`openai`/`firecrawl`/`agentmail`/`valhalla`/`tfl`/`system`); surfaced in the ops console (`/ops`, `features/ops/`).
- **Webhooks** — one Svix-verified `/webhooks/agentmail` endpoint (`convex/lib/svix.ts`) routes by event type (received → inbound parse, delivered/bounced → alert state machine, else → telemetry receipt). The partner feed uses timing-safe HMAC (`convex/lib/webhookAuth.ts`). Raw payloads are stored on `webhookReceipts`.
- **Maps** — maplibre native line layers need the vendored worker (`scripts/copy-maplibre-worker.mjs` → `public/`, `setWorkerUrl("/maplibre-gl-worker.mjs")`). The wheelchair journey is a `requestAnimationFrame` loop; clamp per-frame `dt` (≤64ms) or a backgrounded-then-resumed tab teleports the marker to the end. Immersive camera needs `maxPitch: 80`, and call `jumpTo({ pitch: 0, bearing: 0 })` before `fitBounds`.
- **Accounts** — `/account` shows the sign-in form (pre-filled demo login + "Continue as demo account") when signed out, and the profile when signed in; `/ops` is auth-gated.
