# StepFree developer guide

StepFree is a Next.js 16 application backed entirely by Convex. This document is for running, testing, and deploying the repository.

For the product story, production evidence, architecture diagrams, sponsor integrations, safety model, and linked build log, read [`hackathon.md`](hackathon.md).

## Live links

- [Application](https://whimsical-ferret-778.convex.site)
- [Judge proof console](https://whimsical-ferret-778.convex.site/proof)
- [Street navigator](https://whimsical-ferret-778.convex.site/navigate)
- [Operations console](https://whimsical-ferret-778.convex.site/ops)
- [Demo video (3-min walkthrough)](https://youtu.be/Iisonc0n-go)
- [Launch post — X](https://x.com/naheem__x/status/2102461424484176217)
- [Launch post — LinkedIn](https://lnkd.in/p/eN_-gPKY)

## Current system snapshot

| Capability | Count |
| --- | ---: |
| Convex handlers | 117 |
| Tables | 23 |
| Indexes | 61 |
| Explicit HTTP routes | 3 |
| Mounted component instances | 8 |
| Durable workflows | 2 |
| Bounded workpools | 2 |
| Cron jobs | 4 |
| Automated tests | 107 across 22 files |

## Requirements

- Node.js 20 or newer
- pnpm 11.8.0
- A Convex account and deployment
- API credentials for Firecrawl, OpenAI, and AgentMail

The repository declares its pnpm version through the `packageManager` field.

## Install

```bash
git clone https://github.com/treasure567/stepfree.git
cd stepfree
corepack enable
pnpm install
```

## Connect Convex

Start the Convex setup flow and select or create a development deployment:

```bash
pnpm exec convex dev --once
```

This writes the local Convex deployment values used by the browser and CLI. Do not commit local environment files.

## Environment variables

### Browser environment

The Convex CLI normally writes `NEXT_PUBLIC_CONVEX_URL` into `.env.local`.

Optional browser override:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_MAP_TILE_URL` | Custom MapLibre tile endpoint |

### Convex deployment environment

Required for the full product:

| Variable | Purpose |
| --- | --- |
| `FIRECRAWL_API_KEY` | Scrapes the fixed TfL accessibility page |
| `OPENAI_API_KEY` | Extracts structured incident candidates |
| `AGENTMAIL_API_KEY` | AgentMail SMTP password and API diagnostics |
| `AGENTMAIL_INBOX_ID` | AgentMail inbox email used as the SMTP username |
| `AGENTMAIL_WEBHOOK_SECRET` | Svix signing secret for AgentMail webhook events |
| `OTP_PEPPER` | Server-only secret mixed into verification-code hashes |
| `DEMO_ALERT_RECIPIENT` | Safe recipient for the public proof drill |

Convex Auth also requires `AUTH_PRIVATE_KEY` and `AUTH_JWKS`. Keep the generated values in the Convex environment, never in the repository.

Optional server settings:

| Variable | Default | Purpose |
| --- | --- | --- |
| `OPENAI_MODEL` | `gpt-5.4-mini` | Evidence extraction model |
| `AGENTMAIL_SMTP_HOST` | `smtp.agentmail.to` | SMTP host |
| `AGENTMAIL_SMTP_PORT` | `465` | SMTP port |
| `AGENTMAIL_SMTP_USER` | `AGENTMAIL_INBOX_ID` | SMTP username override |
| `AGENTMAIL_SMTP_PASS` | `AGENTMAIL_API_KEY` | SMTP password override |
| `VALHALLA_URL` | Public Valhalla endpoint | Wheelchair street-routing endpoint |
| `ALLOW_DEMO_CONTROLS` | `false` | Enables server-side controlled incident actions |

Set secrets through the Convex CLI:

```bash
pnpm exec convex env set FIRECRAWL_API_KEY "replace-me"
pnpm exec convex env set OPENAI_API_KEY "replace-me"
pnpm exec convex env set AGENTMAIL_API_KEY "replace-me"
pnpm exec convex env set AGENTMAIL_INBOX_ID "inbox@agentmail.to"
pnpm exec convex env set AGENTMAIL_WEBHOOK_SECRET "whsec_replace-me"
pnpm exec convex env set OTP_PEPPER "replace-with-a-long-random-secret"
pnpm exec convex env set DEMO_ALERT_RECIPIENT "safe-demo-recipient@example.com"
```

## Seed the local network

The seed creates the curated 9-station London graph used by the product demonstration.

```bash
pnpm setup:local
```

The seed is idempotent. Running it again updates the known records instead of multiplying the graph.

## Run locally

Start Convex and Next.js together:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

Separate processes are also available:

```bash
pnpm dev:backend
pnpm dev:web
```

## Routes

| Route | Purpose | Authentication |
| --- | --- | --- |
| `/` | Product landing and live network entry | No |
| `/proof` | Session-isolated judge drill and safety attacks | No |
| `/navigate` | Wheelchair street navigation and SOS | No |
| `/account` | Profile, mobility needs, journeys, and verification | Yes for personal data |
| `/ops` | Evidence review, delivery, activity, and emergency operations | Yes |

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Run Convex and Next.js together |
| `pnpm dev:web` | Run only the Next.js development server |
| `pnpm dev:backend` | Run only Convex development |
| `pnpm setup:local` | Deploy once and seed the local station graph |
| `pnpm seed` | Run the seed function against the selected deployment |
| `pnpm test` | Run the Vitest and `convex-test` suite |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm lint` | Run ESLint |
| `pnpm build` | Copy MapLibre workers and create the static Next.js export |
| `pnpm deploy` | Build and deploy through the Convex static-hosting component |
| `pnpm deploy:web` | Upload a new static export to the linked production deployment |

## Verification

Run the same checks expected before a production change:

```bash
pnpm test
pnpm lint
pnpm exec tsc --noEmit
pnpm exec tsc -p convex/tsconfig.json --noEmit
pnpm build
bash scripts/audit-convex.sh
```

The current suite contains 107 passing tests across 22 files.

The CI workflow runs a frozen install, lint, tests, and the production build on pushes and pull requests.

## Deploy

For a backend, schema, component, or frontend change:

```bash
pnpm deploy
```

For a frontend-only static upload after the backend is already current:

```bash
pnpm deploy:web
```

Production secrets must be configured on the production Convex deployment before the first deploy.

After deployment, verify these direct routes in a private browser window:

```text
/
/proof
/navigate
/account
/ops
```

## AgentMail webhook

Create one AgentMail webhook endpoint for:

```text
https://your-convex-site.convex.site/webhooks/agentmail
```

Subscribe it to the inbound, delivered, bounced, and relevant message lifecycle events. Store the endpoint's `whsec_` secret as `AGENTMAIL_WEBHOOK_SECRET` in the same Convex deployment.

The handler verifies the raw body with `svix-id`, `svix-timestamp`, and `svix-signature`, rejects stale timestamps, and deduplicates provider event IDs before applying effects.

The production integration is verified in both directions:

- Outbound verification codes and route alerts leave through AgentMail SMTP. Convex stores the real provider message ID.
- Inbound replies, delivery confirmations, and bounce events return through the single Svix-verified endpoint.
- The signature is base64 HMAC-SHA256 over `id.timestamp.body`, calculated from the unmodified request body inside a five-minute replay window.
- Five verifier tests cover valid signatures, rotated signature sets, tampering, stale timestamps, and missing verification material.

## Repository layout

```text
app/                         Next.js routes and metadata
convex/                      Convex schema, functions, crons, workflows, HTTP
  schema.ts                  Database tables and indexes
  routes.ts                  Reactive accessible journey planning
  monitoring.ts              Firecrawl and OpenAI evidence pipeline
  review.ts                  Authenticated incident decisions
  alerts.ts                  Route-watch alert state machine
  emailSend.ts               AgentMail SMTP transport
  emergency.ts               SOS lifecycle and escalation
  events.ts                  Deduplicated event record and dispatch
  activity.ts                Provider-attributed operations log
  http.ts                    Health, webhooks, auth, and static routes
  lib/transit.ts             Deterministic Dijkstra router
  lib/excerpt.ts             Verbatim evidence check
  lib/svix.ts                AgentMail webhook signature verification
features/                    Product screens grouped by feature
shared/                      Shared providers, components, and browser helpers
public/                      PWA assets and generated concept visuals
docs/                        Architecture, social copy, and video plan
scripts/                     Build and audit utilities
test/                        Shared Convex test registration and seeds
hackathon.md                 Judge-facing product and engineering submission
```

## Architectural rules

- Mutations do not perform provider network calls.
- Provider calls run in actions and write state through mutations.
- Only human-reviewed, route-blocking incidents can alter the transit route.
- The model produces evidence candidates, not route decisions.
- Drill incidents are isolated by session.
- Public and expensive writes have rate limits and idempotency keys.
- Operational queries require an authenticated user.
- Provider secrets stay in the Convex environment.

## Documentation

- [Hackathon submission and build log](hackathon.md)
- [System architecture notes](docs/architecture.md)
- [Demo video script](docs/video-script.md)
- [Social launch kit](docs/social-post.md)
- [System architecture diagram](docs/diagrams/stepfree-architecture.svg)
- [Evidence and delivery data flow](docs/diagrams/stepfree-dataflow.svg)

## License and data attribution

- Code: [MIT](LICENSE)
- Map data: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors
- Street routing: [Valhalla](https://github.com/valhalla/valhalla)
- Transit context: [Transport for London Open Data](https://tfl.gov.uk/info-for/open-data-users/)
