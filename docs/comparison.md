# StepFree vs the field — a candid competitive read

The Convex "All Gas" hackathon has 73 tagged apps. Roughly 69 of them use AgentMail, so email delivery is table stakes — not a differentiator. This is an honest read of where StepFree actually stands, measured against the hardest bars in the field: **Parallel** (the strongest engineering build) and **Faultline** (the closest domain analog and the deepest Convex build).

The thesis for the whole document: StepFree is not the most-tested or deepest-schema submission in the field. It is the only one that turns a live infrastructure failure into a **person-specific, pre-emptive reroute** — in a domain nobody else touched.

---

## Dimension-by-dimension: StepFree vs Parallel

| Dimension | StepFree | Parallel | Verdict for StepFree |
|---|---|---|---|
| **One-line pitch** | A station lift fails; StepFree reroutes a wheelchair traveller around it and emails the step-free route before they reach the barrier. | Plans a conference team's schedule so they collectively catch the talks that matter. | **WINS** on stakes and legibility — a stranded person vs a fuller calendar. |
| **Sponsor workflow depth** (all 4) | Firecrawl scrapes lift-status → OpenAI reads and must cite → Convex schedules & stores with provenance → AgentMail delivers. One loop, all four sponsors doing real work. | All four wired deep, plus named Convex components (workflow, workpool, static-hosting, firecrawl-convex). | **PARS** on breadth; **behind** on component/abstraction depth. |
| **AI vs deterministic boundary** | OpenAI classifies the incident; a deterministic **Dijkstra** over the station graph picks the route. The model never chooses the path. | Same discipline — AI understands, deterministic code decides. | **PARS** — and StepFree's decision is a genuine graph algorithm with a correct answer, not a scoring heuristic. |
| **Provenance / anti-hallucination** | OpenAI must return a **verbatim excerpt**; StepFree re-verifies it against the Firecrawl markdown. Every record carries source URL, fetch time, SHA-256 hash, model, and excerpt. | Strong boundary; provenance present. | **PARS, slight edge** on the specific verify-the-quote-against-the-hash mechanism. Faultline's blind second-reader is the tougher bar here. |
| **Idempotency / webhook / stale-write** | Station fan-out index, idempotent enqueue, per-watch budget, scheduler-driven delivery, provider message-id + status state-machine. Even TfL's official live feed is **advisory until a human accepts it**. | workpool/workflow components handle durability. | **PARS** — real distributed-systems hygiene. Faultline (monitoring self-overwriting government data) is the tougher analog. |
| **No-login demo + headline metric** | `/proof`, no login: **31 min via Bond Street → 36 via London Bridge (+5)**, rerouted live with no refresh. | `/judges` page runs adversarial checks against production code; one headline number (15.5 → 91.1). | **PARS** on the no-login live demo; **behind** on the adversarial judge harness as a standalone artifact. |
| **Automated test count** | Thinnest column — materially short of the leaders; being grown. | 356 tests / 46 files. | **BEHIND.** Honest gap. (Faultline reports 371 CI checks; ReliefGrid 167 tests.) |
| **Production run** | Runs on real TfL live data and real London stations; the reroute is live. No named real-world event deployment yet. | Verified production run (ViVE 2026). | **BEHIND** on a verified end-to-end event; **pars** on running against real production data. |
| **Everyday-app usefulness** | Millions of disabled, mobility-impaired and elderly travellers, plus parents with buggies. Lift outages are a daily reality on the network. Recurring and personal. | B2B conference planning — valuable, but narrow and episodic. | **WINS.** |
| **Social proof** | Low today; the launch posts are the play. | — | **BEHIND** the vote leader (codex.et, 14 votes via a mobilized community). Honest gap. |
| **Convex depth** | static-hosting component with an app-owned catch-all around the `/auth` routes; scheduler, fan-out index, status state-machine. Idiomatic, not the deepest. | workflow, workpool, static-hosting, firecrawl-convex. | **PARS** on idiomatic use; **behind** Faultline's 33 tables / 181 functions / 8 crons / vector + full-text search. |

---

## The narrative

### Where StepFree pars the engineering bar

- **The AI/deterministic split is real, not decorative.** OpenAI understands the incident; a **Dijkstra over the station graph** decides the route. Routing is a genuine graph problem with a correct answer — not a prompt asked nicely.
- **Provenance is end-to-end.** A claim only moves the system if OpenAI returns a **verbatim excerpt** that StepFree re-checks against the **SHA-256'd Firecrawl markdown**. Source URL, fetch time, hash, model and excerpt ride on every record.
- **The human gate is strict.** Only a human-reviewed incident — or a controlled, session-isolated drill — can reroute a real traveller. Even TfL's official live feed is **advisory until a human accepts it**, the same self-overwriting-data problem Faultline takes seriously.
- **The alert pipeline is a real decoupled system**, not a for-loop that emails people: station fan-out index, idempotent enqueue, per-watch budget, scheduler-driven delivery, and a provider message-id + status state-machine.
- **All four sponsors do real work in one loop**, and `/proof` lets a judge watch a live reroute with no login and a concrete headline number.

### Where StepFree must catch up

- **Test count.** This is the honest weak column. Parallel ships 356 tests across 46 files; Faultline reports 371 CI checks. StepFree's automated suite is materially thinner and has to grow before it can claim the engineering crown outright. Right now correctness leans more on design discipline than on coverage.
- **A truly-delivered email.** The pipeline composes, enqueues and tracks the alert through a provider message-id state-machine — but the final AgentMail **send is currently blocked on a key permission** we haven't cleared. The one artifact a judge might most want — a real reroute email landing in a real inbox — is not yet demonstrable end-to-end. We are stating that plainly rather than implying delivery works.
- **A named production run.** StepFree runs on real data, but hasn't done a verified real-world event deployment the way Parallel did at ViVE 2026.

### Where StepFree wins decisively

- **It is the only disability / accessibility app in a 73-app field.** No one else is building for this user. That is not a marketing angle — it is an uncontested lane with real, underserved stakes.
- **It is proactive where the whole field is reactive.** Every other build — including **Pigeon**, StepFree's pattern-twin — tells you *after* something changed. StepFree's entire value is the **timing gap**: it beats the traveller to the barrier. Finding out the lift is broken when you arrive is the exact problem StepFree exists to erase.
- **The stakes are visceral and specific.** "You'll miss a talk" and "you're physically stranded with no step-free way down" are not the same magnitude, and judges feel the difference.
- **The decision is a genuine algorithm.** Deterministic routing over a real station graph is a hard, correct-answer problem — precisely the kind of decision the "AI understands, code decides" philosophy is meant to protect, and here it actually does.

### Risks / where we're weaker (no spin)

- The automated test suite is thin relative to the leaders; correctness currently rests more on design discipline than on coverage.
- The reroute email is not yet verifiably delivered end-to-end (AgentMail key permission). Until that clears, delivery is a claim, not a demonstrated fact.
- Convex schema depth trails Faultline by a wide margin (their 33 tables / 181 functions dwarf ours).
- Social proof and votes are low; we are relying on late, well-targeted launch posts rather than a mobilized community like codex.et's.
- Routing quality is only as good as the station adjacency and step-free metadata behind it. The real network is larger and messier than the demo slice, and edge cases — partial outages, multi-lift stations, step-free gaps at interchanges — will stress it.
- Single-city today (London / TfL). Generalization to other networks is designed-for but unproven.
- Upstream dependence on Firecrawl scrape freshness and TfL feed correctness — mitigated by the human gate and provenance, not eliminated.

### The moat

The pipeline is not the moat — plenty of teams built pipelines. The moat is the **intersection nobody else occupies**: a live infrastructure failure, turned into a *person-specific, time-critical, pre-emptive* reroute, decided by a deterministic graph algorithm, backed by a verifiable provenance chain, in the one domain — accessibility — the entire field ignored.

Reactive monitors report that the world changed. **StepFree changes your path before you hit the wall.** Copying it means owning the graph, the provenance discipline, the human gate and the domain empathy at the same time — and then still being second to the idea.
