# StepFree — system architecture

This document is the full engineering map of StepFree: the deterministic incident → reroute → alert → escalation path, and every subsystem that supports it. Nothing here is decorative — each piece deepens that one path.

## Capability map (audited, reproducible)

Numbers come from `scripts/audit-convex.sh`, run against this repo.

| Capability | Count / detail | Where |
| --- | --- | --- |
| Convex functions | **77** (20 public queries, 18 public mutations, 3 public actions, 36 internal) | across `convex/*.ts` |
| Tables | **20** | `convex/schema.ts` |
| Indexes | **55** | every table fully indexed; no full scans |
| Mounted components | **5** (auth, rate-limiter, static-hosting, workflow, workpool ×2) | `convex/convex.config.ts` |
| Durable workflows | **2** (evidence pipeline, emergency escalation) | `convex/workflows.ts` |
| Workpools | **2** (`extractionPool`, `deliveryPool`) | `convex/pools.ts` |
| HTTP routes | **4** (AgentMail delivery + inbound, partner lift-status, health) | `convex/http.ts` |
| Webhook signature verification | **HMAC-SHA256, timing-safe** | `convex/lib/webhookAuth.ts` |
| Event bus | idempotent publish on `dedupeKey` + scheduler dispatch | `convex/events.ts` |
| Idempotency | first-class claim helper, used by every ingress | `convex/lib/idempotency.ts` |
| Crons | **3** (TfL sync, evidence workflow, cleanup) | `convex/crons.ts` |
| Emergency service | SOS → event → durable escalation | `convex/emergency.ts` |
| Automated tests | **54** across 10 files | `convex/**/*.test.ts` |

**Foundational guarantees:** deterministic Dijkstra routing behind a human-review gate, Convex Auth, the rate-limiter on every ingress, verbatim-excerpt evidence verification, and per-session isolation.

## New components

```mermaid
flowchart TB
    subgraph App["StepFree Convex app"]
      direction TB
      Core["core functions"]
    end
    subgraph Components["mounted components (5)"]
      Auth["@convex-dev/auth"]
      RL["@convex-dev/rate-limiter"]
      SH["@convex-dev/static-hosting"]
      WF["@convex-dev/workflow"]
      WPx["workpool · extractionPool"]
      WPd["workpool · deliveryPool"]
    end
    App --> Auth
    App --> RL
    App --> SH
    App --> WF
    App --> WPx
    App --> WPd
```

## Durable evidence workflow (workflow + workpool together)

The 6-hour evidence run becomes a durable workflow whose heavy scrape/LLM step is bounded by `extractionPool`. A crash resumes from the last completed step instead of re-scraping.

```mermaid
flowchart TD
    Cron["cron · every 6h"] --> Start["workflow.start(evidenceWorkflow)"]
    Start --> S1["step.runAction · refresh evidence (retry, bounded by extractionPool)"]
    S1 --> S2["step.runMutation · record run + candidates"]
    S2 --> OC{"onComplete"}
    OC -- "success" --> Done["run marked complete"]
    OC -- "error" --> Fail["run marked failed · retried next cycle"]
```

## Event bus

A single idempotent publish point decouples producers (reviewer accepts, lift restored, SOS raised, webhook received) from consumers (alerts, escalation, reconciliation). Duplicate events collapse on `dedupeKey`.

```mermaid
flowchart LR
    P1["incident.accepted"] --> BUS[("events table\nidempotent on dedupeKey")]
    P2["route.changed"] --> BUS
    P3["emergency.raised"] --> BUS
    P4["webhook.received"] --> BUS
    BUS --> D["dispatch (scheduler)"]
    D --> H1["→ enqueue alerts"]
    D --> H2["→ start escalation workflow"]
    D --> H3["→ reconcile delivery"]
```

## Webhook ingress with HMAC verification + idempotency

Every inbound webhook is verified (timing-safe HMAC-SHA256), de-duplicated on the provider event id, then reduced to an internal mutation. Handlers narrow `unknown` and fail closed.

```mermaid
sequenceDiagram
    participant Ext as Provider (AgentMail / partner)
    participant H as httpAction /webhooks/*
    participant V as verifyHmacSignature
    participant R as webhookReceipts
    participant M as internal mutation

    Ext->>H: POST body + signature header
    H->>V: HMAC-SHA256(secret, rawBody)
    V-->>H: valid?
    H->>R: seen this event id? (idempotent)
    alt invalid signature
        H-->>Ext: 401
    else duplicate
        H-->>Ext: 200 (no-op)
    else accepted
        H->>M: apply effect (narrowed, validated)
        M-->>H: ok
        H-->>Ext: 200
    end
```

**Delivery webhook** advances the alert state machine into its previously-unreachable `delivered` / `bounced` states, keyed by `providerMessageId`.

## Emergency service (SOS)

A traveller stuck at a broken barrier raises an SOS. It is rate-limited, idempotent per session-window, published to the bus, and escalated by a durable workflow if no one acknowledges in time.

```mermaid
stateDiagram-v2
    [*] --> raised: emergency.raise (rate-limited, idempotent)
    raised --> acknowledged: reviewer/ops acknowledges
    raised --> escalated: escalation workflow, window elapsed, still unacknowledged
    escalated --> acknowledged: ops acknowledges
    acknowledged --> resolved: resolve
    raised --> cancelled: traveller cancels
    resolved --> [*]
    cancelled --> [*]
```

```mermaid
flowchart LR
    SOS["emergency.raise"] --> EV["events: emergency.raised"]
    SOS --> WF["workflow.start(emergencyEscalationWorkflow)"]
    WF --> N1["step.runMutation · markNotified"]
    N1 --> DP["deliveryPool.enqueueAction · notify"]
    WF --> SL["step.sleep(window)"]
    SL --> CK{"still unacknowledged?"}
    CK -- "yes" --> ESC["step.runMutation · markEscalated"]
    ESC --> DP
    CK -- "no" --> END["done"]
```

## Data model additions

| Table | Purpose | Key indexes |
| --- | --- | --- |
| `events` | Event bus log, idempotent on `dedupeKey` | `by_dedupe`, `by_status`, `by_type_and_created` |
| `idempotencyKeys` | First-class idempotency claims across ingress points | `by_scope_and_key` |
| `emergencies` | SOS lifecycle (raised→acknowledged→escalated→resolved) | `by_session`, `by_status`, `by_station`, `by_idempotency` |
| `inboundMessages` | Parsed inbound email replies (AgentMail) | `by_provider_message`, `by_from`, `by_idempotency` |
| `webhookReceipts` | Verified/duplicate/rejected webhook audit | `by_source_and_event`, `by_received_at` |

## Non-negotiables (kept from the safety model)

- Routing stays deterministic; no model in the decision path.
- Inbound feeds (partner lift-status, TfL) remain **advisory** until human-reviewed.
- Mutations never call the network; all provider I/O is in actions, bounded by workpools.
- Every query uses an index; no `.collect()` on unbounded tables.
