# StepFree

> ## The train doors close behind you. You wheel toward the only lift up — and the sign reads **OUT OF ORDER**. You are stranded underground, on the wrong platform, and no one is coming.

For a wheelchair user, one broken lift is not a delay. **It is a dead end.**

And here is the cruel part: every journey planner in the world will still call that station "step-free" and let you roll straight into the trap — because none of them know the one lift you depend on failed twenty minutes ago. You find out at the barrier. Too late to choose another way. Too late to turn back.

**StepFree exists to reach you _before_ you get there.**

▶ **[Watch a lift break and the route survive — live, no login](https://whimsical-ferret-778.convex.site/proof)** · [Live app](https://whimsical-ferret-778.convex.site) · [Repo](https://github.com/treasure567/stepfree) · Video: <!-- VIDEO_URL --> _coming_

---

## This is not hypothetical. It happens every single day.

_Real people. Real words. Every quote links to the original — go read them._

> 🇬🇧 A 20-year-old wheelchair user had **"three panic attacks"** when a broken lift and the wrong platform left her stranded — more than two hours on a single journey.
> — [ITV News, 2025](https://www.itv.com/news/london/2025-08-15/wheelchair-user-had-three-panic-attacks-after-frustrating-london-train-journey)

> 🇬🇧 A wheelchair user in south London says he has been left stranded in step-free station lifts **"30 times this year"** — one broken lift after another.
> — [Southwark News, 2026](https://southwarknews.co.uk/area/borough/wheelchair-user-makes-the-shocking-claim-that-he-has-been-stranded-in-station-lifts-30-times-this-year/)

> 🇺🇸 **"People with disabilities are stranded every day … because of constant elevator outages."**
> — Madeleine Richman, attorney, in [Streetsblog NYC, 2024](https://nyc.streetsblog.org/2024/10/03/subway-elevators-are-not-just-a-nice-lift-but-a-basic-civil-right)

> 🇬🇧 Ashley Armstrong, 28, who has cerebral palsy, was **left trapped for an hour** at a tram stop by a broken lift — and no one answered when she called for help.
> — [Manchester Evening News, 2024](https://www.pressreader.com/uk/manchester-evening-news/20240329/281715504622517)

> 🇺🇸 A public elevator by Portland's Union Station stayed broken for **two years**; people in wheelchairs were **carried down the stairs**, and neighbours said they felt **"forgotten and ignored."**
> — [KGW, Portland](https://www.kgw.com/article/news/investigations/broken-elevator-portland-union-station-neighbors-stuck-two-years/283-cebad000-93fa-428e-bdac-dac3b353d947)

> 🇺🇸 At a Metro-North station, staff were reduced to **carrying wheelchair users down the steps** while the lift went unfixed for months.
> — [Mid Hudson News, 2026](https://midhudsonnews.com/2026/04/12/metro-north-slow-to-fix-broken-elevator-at-train-station-wheelchairs-being-carried/)

> 🇨🇦 A woman in a wheelchair said she felt **"shafted"** by a broken elevator — at a _brand-new_ station.
> — [CBC News, 2018](https://www.cbc.ca/news/canada/toronto/ttc-accessibility-broken-elevator-vaughan-1.4656090)

> 🇺🇸 **"When a subway platform is a trap."** CBS's _60 Minutes_ called it, plainly, **"the New York City subway's accessibility problem."**
> — [New York Daily News](https://www.pressreader.com/usa/new-york-daily-news/20141213/281814282203481) · [CBS News](https://www.cbsnews.com/news/the-new-york-city-subway-accessibility-problem-60-minutes/)

> 👶 **The forums are full of it, too.** A London mum, unable to lift her baby and pram up a flight of station steps with no step-free route, was flatly refused help by staff — left, she wrote, feeling she had to **"apologise for existing."**
> — [Mumsnet forum thread](https://www.mumsnet.com/talk/am_i_being_unreasonable/1806808-Refused-help-with-pram-by-tube-station-staff-Surely-that-is-not-right)

### The scale of it — this is millions of people

- 🇬🇧 **London:** only about **a third of Tube stations are step-free** ([TfL](https://tfl.gov.uk/transport-accessibility/wheelchair-access-and-avoiding-stairs)) — the Mayor's _target_ is a mere **50% by 2030** ([Time Out](https://www.timeout.com/london/news/10-more-london-tube-stations-have-been-prioritised-to-get-step-free-access-080524)) — and only **22%** have fully accessible trains ([SW Londoner](https://www.swlondoner.co.uk/news/21072023-only-22-of-londons-tube-stations-have-fully-accessible-trains)).
- 🇺🇸 **New York:** only about **30% of subway stations even have an elevator**, and **nearly 1 in 10 elevators is out of service at any given moment** ([amNewYork / 2023 NYC Council report](https://www.amny.com/nyc-transit/nearly-10-of-mta-elevators-out-of-service-at-any-given-time-report/)).
- 👶🧓🧳 And it is **not just wheelchair users.** It is parents with buggies, older travellers, a traveller with heavy luggage, anyone on crutches or with a leg in a cast — everyone the stairs quietly shut out.

---

## So we built StepFree

**StepFree is a live step-free layer for public transit.** When a station lift fails, it catches the evidence, reroutes a wheelchair or mobility-impaired traveller around the broken lift, and emails them the new route **before they reach the barrier** — while there is still time to choose another way.

**Meet Maya.** She plans **Waterloo → Barbican, 31 min via Bond Street.** Bond Street's lift fails. Before she reaches it, StepFree reroutes her via **London Bridge (36 min, +5 min)** — live, on the map, with no page refresh — and emails her the new way down. She never hits the wall.

Built for the Convex **All Gas** hackathon on **Convex + Firecrawl + OpenAI + AgentMail**.

- **Live:** https://whimsical-ferret-778.convex.site
- **Judge demo (live, no login):** https://whimsical-ferret-778.convex.site/proof
- **Repo:** https://github.com/treasure567/stepfree
- **Video:** <!-- VIDEO_URL -->

## The safety boundary — read this first

> **AI can read the notice. It cannot declare a route safe.**

A wrong reroute strands a real person, so the accessibility decision is never left to a language model.

- **Routing is deterministic.** A Dijkstra shortest-path engine over an accessible station graph computes every route (`convex/lib/transit.ts`). No LLM is ever in the routing decision.
- **A route blocks only on human-reviewed evidence.** An incident removes a station from routing only when its severity is `route-blocking` **and** `humanReviewed === true`. That flag is set only by an authenticated reviewer (`convex/review.ts`) or carried by the controlled drill inside its own session.
- **The official TfL live feed is advisory-only.** Real lift disruptions sync every 5 minutes and appear as context, but they carry no `humanReviewed` flag, so they never block a route until a human accepts them.
- **Invented evidence is refused.** Every candidate must carry a short source excerpt that exists _verbatim_ in the scraped page. A fabricated excerpt fails verification and no incident is created (`convex/lib/excerpt.ts`).
- **Low-confidence and unknown-station candidates stay pending.** Acceptance requires a verified excerpt, a resolved station, and confidence ≥ 0.7 (`convex/review.ts`).

## How it works

1. A traveller plans a step-free journey (demo: **Waterloo → Barbican, 31 min via Bond Street**).
2. **Firecrawl** scrapes the official TfL _stations, lifts and escalators works and closures_ page to clean markdown, on a 6-hour cron.
3. **OpenAI** (`gpt-5.4-mini`, strict JSON schema) extracts incident candidates and, for each one, a short **verbatim source excerpt**.
4. StepFree verifies the excerpt exists character-for-character in the Firecrawl markdown, resolves the station name against the graph, hashes the source, and stores the candidate as **pending** with full provenance.
5. A **human reviewer** accepts or rejects each candidate. Only an accepted candidate (verified excerpt + resolved station + confidence ≥ 0.7) becomes a routing incident with `humanReviewed: true`.
6. **Convex** holds all state and serves reactive live queries. The instant Bond Street is blocked, the route re-solves to **London Bridge (36 min, +5 min)** — live, no page refresh, no polling.
7. **AgentMail** emails the traveller the new route and the added time, before they reach the barrier.

## How each sponsor does real work

- **Firecrawl — the source of truth.** `POST /v2/scrape` on one fixed TfL page returns `onlyMainContent` markdown with a 6-hour `maxAge`. The URL is hard-coded (users cannot supply one), which also makes it SSRF-safe.
- **OpenAI — structured extraction, never decisions.** The Responses API (`/v1/responses`) runs `gpt-5.4-mini` with a `strict` `json_schema` and `store: false`. It is instructed not to infer missing facts and to return an exact source excerpt per candidate. Its output is candidates for review — never a route.
- **Convex — the backbone (see _Convex depth_).** Every piece of state, the reactive reroute, the scheduler, the crons, auth, rate limiting, and the static site all live in Convex.
- **AgentMail — last-mile delivery.** Sends account verification codes today, and route alerts through an idempotent queue with a stored provider message ID and a delivery status machine.

## Notable features

- **Deterministic routing behind a human-reviewed gate** — the safety boundary above, enforced in code.
- **Freshness and provenance** — every incident and candidate stores the source URL, fetch time, **SHA-256 content hash**, model name, and the verbatim excerpt. The `/proof` page shows all of it.
- **Idempotent alert pipeline** — route changes fan out to affected watches, dedupe on a unique key per watch + route change, respect a per-watch alert budget (so a flapping lift can't spam), and move through a `queued → sending → sent → delivered/bounced/failed` state machine. Duplicate incident events collapse to one email.
- **Session isolation** — a per-session `demoIncidents` overlay means one judge's drill never touches another judge's view or global state.
- **Warn before the barrier** — the alert exists to arrive while the traveller can still act.

## Convex depth

- **Full function surface:** queries, mutations, actions, and internal queries/mutations/actions across `alerts`, `review`, `monitoring`, `watches`, `tfl`, `drill`, `routes`, and more.
- **Scheduler (decoupled delivery):** enqueue and deliver are separate. Accepting a candidate or evaluating a station schedules `internal.alerts.deliverAlert` via `ctx.scheduler.runAfter(0, ...)`, so the mutation stays transactional and the provider call happens off the write path.
- **Crons:** TfL lift-disruption sync every **5 minutes**; Firecrawl + OpenAI evidence extraction every **6 hours**.
- **HTTP router:** registers the `@convex-dev/static-hosting` catch-all _around_ the component-mounted `/auth` routes, so auth wins for its own paths and the static app serves everything else.
- **Reactive live queries:** the `/proof` reroute updates with no polling and no refresh — a route query re-runs automatically when incident state changes.
- **Convex Auth:** password + username providers gate profiles, journey history, email verification, and the reviewer boundary.
- **`@convex-dev/rate-limiter`:** named limits for email sends and code attempts, street-route calls, community reports, journey saves, demo controls, and per-watch / global alert budgets.
- **`@convex-dev/static-hosting`:** serves the entire static-exported Next.js app from `convex.site`.
- **Idempotency & dedup:** content-hash dedup on monitoring runs; idempotency keys on alerts, journeys, and email verification; stale-write protection (a `sending` claim can only be made from `queued`).

## The `/proof` judge page — what to click

Open **https://whimsical-ferret-778.convex.site/proof** (no login). Every button calls the real production backend, and the route is drawn on a **live MapLibre map**.

1. **Pick a journey** — choose any two stations (defaults to Waterloo → Barbican). The route draws on the map with numbered station markers.
2. **Break a lift on this route** — watch the map **reroute in real time**: the broken station turns red ("lift down"), the original line fades, and a new line redraws from **31 min via Bond Street** to **36 min via London Bridge** — live, no refresh.
3. **Evidence behind the reroute** — inspect the source, `gpt-5.4-mini`, the SHA-256 content hash, the confidence, the verbatim excerpt, and the review state.
4. **Send the reroute alert** — enqueue an AgentMail alert (idempotent: one incident, one email).
5. **Run the safety checks** — executes the actual guard code and reports whether it held: invented evidence is refused, one visitor's drill cannot reroute another (session isolation), and unreviewed feeds cannot reroute.
6. **Restore the lift / Reset my drill** — return to baseline.

**Headline:** one broken lift, **31 → 36 minutes**, rerouted live and warned before the barrier.

## Tech stack

- **Frontend:** Next.js 16 (static export), React 19, TypeScript, `maplibre-gl` (MapLibre + OpenStreetMap tiles), installable PWA.
- **Backend:** Convex — schema, queries/mutations/actions, internal functions, scheduler, crons, HTTP router, Convex Auth, `@convex-dev/rate-limiter`, `@convex-dev/static-hosting`.
- **External services:** Firecrawl (official-page scrape), OpenAI `gpt-5.4-mini` (Responses API, structured JSON), AgentMail (email delivery), TfL Unified API (live lift disruptions), Valhalla (wheelchair street routing).

## Challenges / what broke

- **Keeping the model out of the safety path.** The hard part was not calling an LLM — it was designing so the LLM's output is powerless until a human accepts it. The `humanReviewed` gate lives in the routing engine, not the UI.
- **Verifying the model didn't invent the notice.** The verbatim-excerpt check (whitespace-collapsed substring match, minimum length) is what lets us trust an extraction without trusting the model's prose. The `/proof` guard proves a forged excerpt is rejected.
- **No-refresh reroute without polling.** Route fingerprints let a watch decide whether anything actually changed, so live queries drive the UI and alerts only fire on real route changes.
- **AgentMail send permission.** See _Honest limits_ — the pipeline is complete; the provider key can't yet send.

## Honest limits

- The London pilot is a **curated 9-station network** (9 stations, 9 connections), not the full TfL graph.
- Live TfL lift data is **real** and shown as context; the Bond Street incident on `/proof` is a **clearly-labelled controlled drill** so judges can run the full chain on demand rather than waiting for a real-world outage.
- **AgentMail send currently returns HTTP 403** because the provided API key needs `message_send` permission / account verification. The full alert pipeline — queue, idempotency, per-watch budget, and status machine — is built and verified end-to-end **except the final provider call**; delivery resumes the moment the key can send. Account-verification code delivery uses the same provider and the same limitation applies.
- Street routing uses a **public Valhalla instance** (10 m – 25 km per request) and public OSM tiles — fine for a demo, not a launch.

## Security

- **OTP with a secret pepper.** Verification codes are hashed with **SHA-256 and a secret pepper** (`OTP_PEPPER`) alongside the request's idempotency key, never stored in plaintext. Codes expire after **10 minutes**, lock after **5 failed attempts**, and a new request supersedes older active codes.
- **Auth.** Convex Auth (password + username) gates profile edits, journey history, email verification, and the reviewer-only accept/reject boundary.
- **Rate limits.** `@convex-dev/rate-limiter` covers email sends, code attempts, street-route calls, community reports, journey saves, demo controls, and per-watch / global alert budgets.
- **Session isolation.** Drill state is scoped to an opaque session id, so one visitor's actions never affect another.
- **Other controls.** The evidence crawler uses a fixed URL (no SSRF), provider keys stay in Convex environment variables, and alert recipients are masked in queries.

## Local setup

```bash
pnpm install

# Set the external-service keys in the Convex deployment environment:
pnpm exec convex env set FIRECRAWL_API_KEY   <your-key>
pnpm exec convex env set OPENAI_API_KEY      <your-key>
pnpm exec convex env set AGENTMAIL_API_KEY   <your-key>
pnpm exec convex env set AGENTMAIL_INBOX_ID  <your-inbox-id>
pnpm exec convex env set OTP_PEPPER          <a-long-random-secret>
# Optional: OPENAI_MODEL (defaults to gpt-5.4-mini)

pnpm setup:local   # seeds the 9-station pilot network
pnpm dev
```

Open http://localhost:3000.

## Tests / verification

34 focused tests across 5 files (`pnpm test`, Vitest + `convex-test`) cover the deterministic routing gate — baseline 31 min, the +5 min Bond Street reroute via London Bridge, session isolation, restoration, and the human-reviewed-only block that keeps advisory / unreviewed feed incidents from rerouting anyone — plus verbatim excerpt verification, the peppered OTP hash, station-name resolution, and input validation.

```bash
pnpm lint
pnpm exec tsc --noEmit
pnpm exec tsc -p convex/tsconfig.json --noEmit
pnpm build
```

## Links

- **Live:** https://whimsical-ferret-778.convex.site
- **Judge demo:** https://whimsical-ferret-778.convex.site/proof
- **Repo:** https://github.com/treasure567/stepfree
- **Video:** <!-- VIDEO_URL -->
- **Build log:** [`hackathon.md`](hackathon.md)
- **Architecture diagrams (Excalidraw, open at excalidraw.com):** [`docs/diagrams/`](docs/diagrams/)
- **Competitive analysis:** [`docs/comparison.md`](docs/comparison.md)
- **Demo video script:** [`docs/video-script.md`](docs/video-script.md)
