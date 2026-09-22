# Convex All Gas Hackathon — StepFree

## Project

**StepFree** — a live step-free accessibility layer for public transit.

## One-line summary

When a station lift fails, StepFree catches the evidence, reroutes a wheelchair or mobility-impaired traveller around the broken lift, and emails them the new route before they reach the barrier.

## Links

- **Live:** https://whimsical-ferret-778.convex.site
- **Judge demo (live, no login):** https://whimsical-ferret-778.convex.site/proof
- **Repo:** https://github.com/treasure567/stepfree
- **Video:** <!-- VIDEO_URL -->

## Primary user

Wheelchair users and people with mobility-related disabilities navigating public transport, for whom one out-of-service lift is a dead end, not a delay.

## Problem

Conventional journey planners describe a station as "accessible" while a critical lift, entrance, or interchange is currently out of service. The traveller discovers the failure only after reaching the barrier — on the wrong platform, with no step-free way up.

## What we built

A Next.js 16 client and a Convex backend that turn official access notices into verified, routable evidence and reroute around failures in real time.

- Deterministic accessible transit routing over a curated London graph (Dijkstra, `convex/lib/transit.ts`).
- A Firecrawl → OpenAI → human-review → Convex evidence pipeline that only ever _proposes_ incidents; a human accepts them into routing.
- Verbatim source-excerpt verification that refuses invented evidence (`convex/lib/excerpt.ts`).
- Live reactive rerouting with no page refresh, driven entirely by Convex live queries.
- A decoupled, idempotent alert pipeline (route watches → station index → scheduler → AgentMail) with a delivery status machine.
- Live TfL lift-disruption ingestion every 5 minutes, shown as advisory context.
- A session-isolated `/proof` drill so judges can run the whole chain on demand.
- Accounts with mobility preferences, AgentMail email verification (hashed, peppered, expiring OTP codes), wheelchair street routing (Valhalla) with turn-by-turn guidance, and an installable PWA.

## The story we demo

Maya plans **Waterloo → Barbican, 31 min via Bond Street**. Bond Street's lift fails. StepFree detects the evidence, a reviewer accepts it, and the route re-solves to **London Bridge (36 min, +5 min)** — live, with no refresh — then emails Maya the new route before she reaches the barrier.

## The safety boundary

**AI can read the notice; it cannot declare a route safe.** Routing is deterministic graph search — no LLM in the decision. A route blocks only on a human-reviewed, route-blocking incident (or the controlled drill within its own session). The official TfL live feed is advisory-only until a human accepts it. Fabricated excerpts are refused; unknown-station and low-confidence candidates stay pending. Every reroute is backed by a verified official source and a human review.

## Stack

- **Frontend:** Next.js 16 (static export), React 19, TypeScript, `maplibre-gl` (MapLibre + OpenStreetMap), installable PWA.
- **Backend:** Convex — schema, queries/mutations/actions, internal functions, scheduler, crons, HTTP router, Convex Auth, `@convex-dev/rate-limiter`, `@convex-dev/static-hosting`.
- **External services:** Firecrawl, OpenAI `gpt-5.4-mini` (Responses API, strict JSON), AgentMail, TfL Unified API, Valhalla.

## Sponsor usage (all do real work)

### Firecrawl

Scrapes one fixed TfL _stations, lifts and escalators works and closures_ page to clean markdown (`POST /v2/scrape`, `onlyMainContent`, 6-hour `maxAge`) on a 6-hour cron. The URL is hard-coded — users cannot supply one — which keeps the crawler SSRF-safe. A SHA-256 content hash skips redundant OpenAI work when the page is unchanged.

### OpenAI

`gpt-5.4-mini` via the Responses API with a `strict` `json_schema` and `store: false` extracts incident candidates and a short **verbatim source excerpt** for each. It is instructed not to infer missing facts. It never decides routes — its output is candidates for human review.

### Convex

Owns everything: auth, user profiles, stations, lifts, connections, incidents, candidates, journeys, route watches, alerts, source snapshots, rate limits, transactional mutations, the scheduler and crons, and the reactive live queries that push a reroute to the browser with no refresh. `@convex-dev/static-hosting` serves the whole static-exported app from `convex.site`; the HTTP router mounts the static catch-all around the component's `/auth` routes.

### AgentMail

Delivers account verification codes and traveller route alerts. Route alerts flow through an idempotent queue (unique key per watch + route change), a per-watch send budget, and a `queued → sending → sent → delivered/bounced/failed` status machine, storing the provider message ID.

## Production story

- **Shipped to production** on Convex + `convex.site` (static-hosting component), with a live no-login judge demo at `/proof`.
- **State is transactional and reactive.** Incident mutations invalidate route queries automatically; there is no second database and no polling.
- **External calls are treated as non-transactional boundaries.** Monitoring records a processing run before OpenAI work, then completed/failed; email records pending before delivery, then sent/failed; alerts claim `sending` only from `queued`.
- **Idempotency throughout** — content-hash dedup on monitoring runs, idempotency keys on alerts/journeys/email verification, duplicate incident events collapse to one email.

## Honest limits

- The London pilot is a **curated 9-station network** (9 stations, 9 connections), not the full TfL graph.
- Live TfL lift data is real and shown as context; the Bond Street incident on `/proof` is a **clearly-labelled controlled drill** so judges can run the full chain on demand.
- **AgentMail send currently returns HTTP 403** — the provided API key needs `message_send` permission / account verification. The full pipeline (queue, idempotency, per-watch budget, status machine) is built and verified end-to-end **except the final provider call**; delivery resumes the moment the key can send.
- Street routing uses a public Valhalla instance (10 m – 25 km) and public OSM tiles — suitable for a demo, not a high-volume launch.

## What's next

Full TfL network import, contracted/self-hosted routing and tiles, a reviewer operations console, and turning live TfL advisories into reviewed incidents at scale.
