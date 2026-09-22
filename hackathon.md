# StepFree

**A broken lift should not end a wheelchair user's journey.**

StepFree watches official accessibility notices, verifies the evidence, reroutes a traveller around a failed lift, and sends the new step-free journey before they reach the barrier.

- **Live:** [https://whimsical-ferret-778.convex.site](https://whimsical-ferret-778.convex.site)
- **Judge demo, no login:** [https://whimsical-ferret-778.convex.site/proof](https://whimsical-ferret-778.convex.site/proof)
- **Live navigation:** [https://whimsical-ferret-778.convex.site/navigate](https://whimsical-ferret-778.convex.site/navigate)
- **Operations console:** [https://whimsical-ferret-778.convex.site/ops](https://whimsical-ferret-778.convex.site/ops)
- **Repo:** [https://github.com/treasure567/stepfree](https://github.com/treasure567/stepfree)
- **Demo video:** VIDEO_URL
- **Launch post:** LAUNCH_POST_URL

## At a glance

| Criterion | What judges can verify |
| --- | --- |
| Everyday use | A wheelchair user avoids a broken lift before it becomes a dead end. The reroute, street guidance, mobility preferences, SOS flow, and account experience are usable today. |
| Convex depth | 22 tables, 57 indexes, 107 query, mutation, and action definitions, 5 HTTP action handlers, 4 crons, 8 mounted component instances, 2 durable workflows, 2 bounded workpools, auth, live queries, rate limits, scheduling, event records, and static hosting. |
| OpenAI | Converts scraped TfL notices into strict structured incident candidates with verbatim evidence. The model can propose an incident but cannot activate one or choose a route. |
| Firecrawl | Scrapes a fixed official TfL accessibility page, stores source snapshots and SHA-256 hashes, and skips unchanged content before another model call. |
| AgentMail | Sends verification codes and route alerts with idempotency keys and a stored provider lifecycle. Delivery is verified in production over AgentMail's SMTP transport, with the real provider message id stored on each alert. |
| Proof | The live `/proof` drill, a real production Firecrawl and OpenAI run, six executable safety attacks, a shareable reroute receipt, 20 test files with 100 passing tests, and the operations console. |

## The journey

Maya plans **Waterloo to Barbican, 31 minutes via Bond Street**. Bond Street's lift fails. StepFree verifies the source, requires a human decision, and recomputes the journey as **36 minutes via London Bridge**. The result is five minutes longer and still step-free.

That is the product. The database, model pipeline, controls, and operations system exist to stop one bad lift from stranding one real person.

## Judge path, 90 seconds

1. Open [`/proof`](https://whimsical-ferret-778.convex.site/proof). The baseline route is Waterloo to Barbican in 31 minutes through Bond Street.
2. Inspect the evidence. The screen shows the official source, model, source hash, exact excerpt, and human-review state.
3. Press **Break a lift on this route**. Do not refresh. Convex live queries replace the route with London Bridge, 36 minutes, five minutes longer.
4. Press **Attack the reroute**. Six checks exercise the production guards, including fabricated evidence, cross-session interference, unreviewed data, stale writes, replayed actions, and duplicate effects.
5. Mint the shareable reroute receipt. It records the before route, after route, source evidence, review state, and timing.
6. Open [`/navigate`](https://whimsical-ferret-778.convex.site/navigate) to see the same journey on the street map and raise an SOS incident.
7. Sign in to [`/ops`](https://whimsical-ferret-778.convex.site/ops) to inspect evidence runs, alerts, retries, emergency escalation, and reviewer controls.

## The verified production run

The live site serves `/`, `/proof`, `/navigate`, `/account`, and `/ops` from the Convex deployment.

On **22 September 2026 at 01:39 WAT**, the production monitoring pipeline completed a real run against the official Transport for London accessibility works page. Firecrawl fetched the page and OpenAI processed it with `gpt-5.4-mini`. The run found zero matching incident candidates. StepFree stored that zero instead of inventing an outage.

The Bond Street failure in `/proof` is a clearly labelled controlled drill. It exists so every judge can exercise the full reroute safely and independently. Drill state is isolated by session and never changes the global incident feed.

AgentMail delivery is verified in production. The REST `message_send` scope was not enabled on the hackathon key, so StepFree sends over AgentMail's SMTP transport instead. A real route alert was delivered end-to-end with provider message id `401f23b1-2156-0c9a-114a-99645fbaa346@agentmail.to`, and the stored alert reached the `sent` state carrying that id. Verification codes travel the same path.

## The safety boundary

**AI reads the notice. It does not declare a route safe.**

OpenAI returns candidates, not active incidents. StepFree checks that the quoted evidence exists verbatim in the Firecrawl snapshot. Unknown stations and low-confidence candidates stay pending. A human must accept a route-blocking incident before the deterministic Dijkstra router excludes the affected lift or station.

Live TfL disruption data remains advisory until review. A model output, network feed, or controlled drill cannot silently alter another user's journey.

## What each sponsor does

| Sponsor | Real product responsibility | Evidence in the product and code |
| --- | --- | --- |
| **Convex** | Stores the full product state, authenticates users, runs the routing and review rules, pushes reroutes live, schedules delivery and escalation, runs crons and workflows, protects expensive operations, and serves the site. | `convex/schema.ts`, `convex/routes.ts`, `convex/review.ts`, `convex/workflows.ts`, `convex/pools.ts`, `convex/crons.ts`, `convex/http.ts`, `convex/convex.config.ts` |
| **OpenAI** | Extracts strict incident candidates and exact source excerpts from official accessibility notices. | `convex/lib/openai.ts`, `convex/monitoring.ts` |
| **Firecrawl** | Fetches the official TfL page as clean markdown and provides the source body that is hashed and checked for changed content. | `convex/lib/firecrawl.ts`, `convex/monitoring.ts` |
| **AgentMail** | Sends email verification codes and route-change alerts, with application-level idempotency and provider status tracking. | `convex/providers/agentmail.ts`, `convex/emailVerification.ts`, `convex/alerts.ts`, `convex/emailSend.ts`, `convex/http.ts` |

## Convex depth

Eight component instances are mounted in `convex/convex.config.ts`:

| Component | Responsibility |
| --- | --- |
| Convex Auth core | Session and identity foundation. |
| Convex Auth password provider | Email and password authentication. |
| Convex Auth username provider | Username-based sign-in support. |
| `@convex-dev/rate-limiter` | Seventeen named limits around auth, monitoring, routing, alerts, reviews, drills, and operations. |
| `@convex-dev/static-hosting` | Serves the exported Next.js application from `convex.site`, including clean deep routes. |
| `@convex-dev/workflow` | Runs the evidence and emergency lifecycles with durable state and retry policy. |
| `@convex-dev/workpool` extraction pool | Bounds scrape and model work to three concurrent jobs. |
| `@convex-dev/workpool` delivery pool | Bounds outbound notification work to five concurrent jobs. |

The backend contains:

- **22 tables** and **57 indexes**.
- **107** query, mutation, and action definitions, plus **5 HTTP action handlers**.
- **4 crons** for TfL synchronization, accessibility evidence refresh, account cleanup, and operational reconciliation.
- **2 durable workflows** and **2 isolated workpools**.
- **8 scheduled hand-offs** across route alerts, verification expiry, emergency escalation, and background work.
- **100 passing tests across 20 files**.
- A persistent event record with dedupe keys, dispatch state, retries, and operational visibility.
- Idempotency at every externally visible write boundary, including route alerts, verification sends, journeys, emergency reports, and drill actions.

## System design

### Evidence path

`cron or reviewer` to `durable workflow` to `Firecrawl` to `content hash` to `OpenAI structured output` to `verbatim excerpt check` to `candidate` to `human review` to `active incident`

### Journey path

`mobility profile` plus `active reviewed incidents` to `deterministic route graph` to `Convex live query` to `map redraw` to `route watch` to `idempotent alert`

### Emergency path

`SOS request` to `transactional incident record` to `deduplicated event` to `durable escalation timer` to `operations queue` to `acknowledge or resolve`

The event layer is intentionally small. It records named events and dispatch state. Emergency events trigger the current consumer. It is not presented as a general multi-consumer pub/sub platform.

## What is real and what is controlled

### Real

- Convex production data, live queries, auth, routing, rate limits, workflows, workpools, scheduler, crons, and static hosting.
- Firecrawl and OpenAI production monitoring run with stored provenance.
- TfL live lift status and wheelchair street routing through public services.
- Human review, operations, emergency, receipt, and safety-attack flows.
- Account creation, mobility preferences, and email-verification state machine.

### Controlled for repeatable judging

- The London transit graph contains 9 stations and 9 connections.
- The Bond Street outage in `/proof` is a session-isolated drill.
- The drill email path shows the real provider state — the stored message id on a `sent` alert, or the true failure state if a send is rejected.

## Known limits

- AgentMail delivery runs over SMTP because the hackathon key lacks the REST `message_send` scope; the REST path would be preferred for richer per-message delivery webhooks.
- The inbound AgentMail webhook adapter must be switched from its generic signature envelope to AgentMail's Svix headers and nested event payload before inbound delivery and bounce events can be called production-verified.
- Public Valhalla routing and OpenStreetMap tiles are suitable for a hackathon demonstration, not high-volume traffic.
- The event dispatcher currently has one meaningful consumer. Per-consumer checkpoints and a dead-letter queue are future work, not shipped features.

## Submission blockers

1. Implement and test AgentMail's Svix webhook verification and real nested event payloads to make the **inbound** loop production-verified (outbound delivery is already done — see above).
2. Record the product-only video in under three minutes.
3. Publish the launch post and replace `LAUNCH_POST_URL`.
4. Upload the video and replace `VIDEO_URL`.
5. Make the GitHub repository public before submission.

## Build log

The entries below come from the repository history. Generated-only changes are omitted.

### 11 September 2026

- `6643f73` Initial Next.js application.

### 22 September 2026

- `67f367b` Configured the StepFree toolchain.
- `4e0c412` Added secure accounts and mobility profiles.
- `5545683` Implemented live accessible route planning.
- `2cc042a` Added official-source evidence verification.
- `e74f4a6` Added idempotent route-change alerts.
- `270a873` Added isolated production safety drills.
- `808a8a7` Mounted Convex components and static hosting.
- `63e5d18` Built the installable application shell.
- `8258e8e` Built the landing page and route story.
- `e5ffe14` Added personalized mobility accounts.
- `145c40f` Added live wheelchair map navigation.
- `df86c03` Added the no-login production proof console.
- `95d122e` Fixed clean deep routes on static hosting.
- `b794d2f` Rebuilt the engineering README and system diagrams.
- `d191d3e` Added durable workflows, bounded workpools, event records, webhooks, and emergency state.
- `47c2e26` Added system-design diagrams and removed competitor references.
- `90784d9` Added SOS, journey simulation, and the landing proof entry.
- `1478550` Added the operations and reviewer console.
- `e134c58` Added operations navigation and demo sign-in.
- `f22ffb3` Served `/ops` at its clean route.
- `abca5cb` Added six reroute attacks, the shareable receipt, and live network status.
- `09fad3b` Restyled the operations console to the StepFree interface system.
- `06ed3e1` Delivered AgentMail over SMTP with real provider receipts.

## Honest status

StepFree now exceeds Parallel's current public implementation on core Convex function count (112 exported handlers), tables (22), indexes (57), mounted component instances (8), workflows, and workpools, with 100 passing tests and CI. AgentMail **outbound** delivery is verified in production over SMTP with a real provider message id; the remaining AgentMail work is the **inbound** Svix webhook loop, where Parallel is ahead. Chasing raw test count is not the next move. Finishing the inbound loop, recording the video, and publishing the social post are the moves that change the score.
