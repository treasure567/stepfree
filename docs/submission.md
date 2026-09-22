# StepFree

**Tagline:** Every planner calls the station "step-free." StepFree is the one that checks — live — and reroutes you before a broken lift becomes a dead end.

- 🌐 Live app: https://whimsical-ferret-778.convex.site
- ▶️ Break a lift yourself, no login: https://whimsical-ferret-778.convex.site/proof
- 🛠️ Operations console (demo login pre-filled): https://whimsical-ferret-778.convex.site/ops
- 💻 Repo: https://github.com/treasure567/stepfree
- 🎬 3-min demo: https://youtu.be/Iisonc0n-go
- 🐦 Launch post: https://x.com/naheem__x/status/2102456491831673126

---

## Problem you're solving

For most people a broken lift is a detour. For a wheelchair user it can be a dead end — stranded on the wrong platform, underground, with no step-free way out.

Here's the cruel part: every journey planner still calls that station "step-free" and routes you straight into the trap, because none of them know the one lift you depend on failed twenty minutes ago. You find out at the barrier — too late to choose another way, too late to turn back.

Only about a third of London Underground stations are step-free. The information that would prevent a stranding usually *exists* — it's just published on an official page nobody reads, minutes too late, in a format no planner ingests. The gap between a good day and a stranding is simply **who told you, and how fast.**

## How the app works

StepFree is a live pipeline from an official source to a warning in the traveller's inbox — with one hard rule running through it: **AI understands the world; it never chooses the route.**

1. **Read the city (Firecrawl).** Firecrawl scrapes the official TfL accessibility-works page into markdown and stores provenance — source URL, fetch time, SHA-256 hash.
2. **Understand it (OpenAI).** `gpt-5.4-mini` turns the page into a structured incident **and returns the exact sentence it relied on.** If that sentence can't be found character-for-character in the source, StepFree refuses the incident. A confident model that paraphrases its evidence is rejected.
3. **Let a human decide.** An incident only blocks a route when it is `route-blocking` **and** a reviewer has accepted it in the ops console. Unreviewed feeds stay advisory — visible, never acted on.
4. **Reroute deterministically (Convex).** The route is a plain Dijkstra search in TypeScript, running inside a Convex mutation. Same inputs, same route, every time. Convex pushes the new plan to every open screen instantly — no refresh.
5. **Reach the traveller (AgentMail).** AgentMail emails the new step-free plan before they reach the barrier. No app, no account.
6. **Close the loop (AgentMail → Convex).** The traveller just replies — *"I made it to Barbican, thank you!"* — and a Svix-verified webhook parses the intent (`arrived` / `still-stuck` / `pause`). No polling, no dashboard required.

You don't have to trust a video: on `/proof` you can **break a lift on a real journey yourself** and watch the route survive on the production backend, no login.

## Notable features

- **Watch it break, live.** `/proof` runs the failure itself — snap a lift, see the map reroute (Waterloo → Barbican, 31 → 36 min, still step-free) on the real backend, no login, no mock.
- **AI never decides the route.** Deterministic routing + a human accept-gate + verbatim-quote verification. The machine advises; the math decides.
- **A two-way email loop.** Alerts go out and replies come back through AgentMail — travellers use the one tool they already check, never an app.
- **An operations console with real telemetry.** `/ops` logs every action with the provider that performed it (Convex · OpenAI · Firecrawl · AgentMail · TfL · system), filterable by provider or date, plus an inbound-reply inbox, an alert state machine, and inspectable signed-webhook payloads.
- **Built to be attacked.** `/proof` runs a live drill that turns the production code against itself on a throwaway scope and reports, with timings, whether each guard held: forged/paraphrased evidence, cross-session bleed, replayed webhook, retried send, unreviewed feed, low-confidence claim. **6/6 held.**
- **Honest by construction.** Verbatim evidence or refusal; a real production run that found zero incidents kept the zero instead of inventing an outage.

## Why did you build this

A broken lift is one of the few everyday failures where the cost lands entirely on the people with the fewest alternatives — and where the warning that would prevent it already exists, just too late and in the wrong place.

We wanted the source, the decision, the reroute, and the warning to work as one system — while letting the traveller interact through the tool they already open every day: email. And because a *wrong* reroute strands a real person, we refused to let a model make the call. AI reads the evidence; a human and deterministic code decide the route.

## Tech stack list

- **Convex** — the entire live spine: typed database, reactive queries, transactional mutations, the Dijkstra router inside a mutation, scheduler + 4 crons, HTTP webhooks, an event bus, first-class idempotency, and a provider-attributed telemetry log. Components: `@convex-dev/static-hosting` (hosting on `convex.site`), `@convex-dev/workflow` (durable evidence + escalation workflows), `@convex-dev/workpool` ×2 (isolated scrape/LLM and outbound work), `@convex-dev/rate-limiter`, and Convex Auth.
- **Firecrawl** — scrapes the official accessibility page and records provenance (URL, fetch time, content hash).
- **OpenAI `gpt-5.4-mini`** — structured incident extraction, relevance scoring, reply interpretation — always with a verbatim quote to verify. Never schedules.
- **AgentMail** — outbound alerts + verification codes (SMTP), and inbound replies through one Svix-verified webhook.
- **TfL Unified API** — live lift-disruption context. **Valhalla** — wheelchair street routing.
- **Frontend & tests** — Next.js 16, React 19, TypeScript, Tailwind CSS, Vitest + convex-test, GitHub Actions CI.

## Challenges we ran into

- **A localhost URL shipped to production.** Our first prod build silently baked the local Convex URL into the static site — the page loaded but never fetched a thing. We now pin prod URLs in a production-only env file; the deploy is boring again.
- **The map that "didn't work" but did.** In review, the wheelchair kept teleporting past the route. The cause wasn't the routing — browsers pause animation on hidden tabs and fire one giant catch-up frame on resume, jumping the journey to the end. We clamp the per-frame delta so it can never skip the line.
- **AgentMail said no, then yes.** The hackathon key lacked the REST `message_send` scope, so we send over AgentMail's SMTP transport and verified a real delivery with a real provider message id. Inbound needed AgentMail's Svix signatures, not a generic envelope — so we wrote a Svix verifier (timestamp window, base64 HMAC) and the reply loop closed.
- **The honest zero.** Our real evidence run against the official TfL page found *zero* matching outages that day — and StepFree stored the zero instead of inventing one. The reroute on `/proof` is therefore a clearly-labelled, session-isolated controlled drill, so judges can exercise the full chain without waiting for a real lift to fail.
- **Green CI on a component-heavy backend.** Mounting Convex workpools made `next build` type-check dependency source using BigInt literals, and CI refused an unapproved native build script — fixed by bumping the TS target and allow-listing the builds, so lint → test → build stays green.

## Any success stories or metrics

We exercised the full chain in production on the real, public TfL accessibility source:

- A real **Firecrawl → OpenAI (`gpt-5.4-mini`)** run, stored with source URL, fetch time and SHA-256 hash — it found zero matching incidents, and we kept the zero.
- A real **AgentMail reroute alert delivered over SMTP** with a real provider message id.
- A real **inbound reply** — *"I made it to Barbican, thank you!"* — verified through the **Svix webhook** and parsed to intent `arrived`, surfaced in the ops Inbox. The two-way loop is closed.
- The `/proof` reroute runs on the real backend as a labelled, per-session controlled drill.
- **6 / 6** production reliability guards held on demand.

By the numbers:

| | |
| --- | --- |
| Convex handlers | **117** (queries · mutations · actions · internal · HTTP) |
| Tables · Indexes | **23** · **61** |
| Mounted Convex components | **8** |
| Durable workflows · Workpools · Crons | **2** · **2** · **4** |
| Automated tests | **107** across **22** files, green in CI |
| Reliability guards proven | **6 / 6** |

**Honest limits:** a curated 9-station London pilot (not the full TfL graph); the live TfL feed is real context while the demo incident is a labelled drill; AgentMail sends over SMTP because the key lacks the REST send scope; street routing uses a public Valhalla instance. We'd rather ship what's true than claim what isn't.

**One broken lift. Five extra minutes. No dead end.**
