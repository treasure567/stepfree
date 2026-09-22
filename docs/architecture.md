# StepFree architecture

## System boundary

StepFree has one Next.js web client and one Convex backend. There are no Next.js API routes and no second database.

```text
Browser
  Next.js App Router
  MapLibre map
  Device geolocation
      |
      v
Convex
  Auth and user profiles
  Queries and mutations
  Node actions
  Scheduled jobs
  Database and realtime subscriptions
      |
      +--> TfL lift disruption API
      +--> Valhalla wheelchair routing
      +--> Firecrawl official page extraction
      +--> OpenAI structured evidence extraction
      +--> AgentMail verification delivery
```

## Frontend layout

`app` owns routes and page composition. `features` owns account, landing, and navigation product areas. `shared` contains cross-feature providers, utilities, and UI primitives.

Map state, live GPS, and route progress stay inside the navigation feature. Account forms and mobility settings stay inside the account feature. Convex client setup and PWA registration stay in shared providers.

## Backend layout

Public Convex functions are grouped by business capability. `lib` contains reusable validation, routing, cryptography, and rate-limit configuration. `providers` contains the only code that speaks to external services.

The backend does not use MVC. Convex functions are the transport boundary and transactional service layer. Adding controllers and model classes would create empty indirection around Convex queries and mutations.

## Core data flows

### Transit routing

1. The browser subscribes to a route query.
2. Convex reads the station graph, lift state, and active incidents.
3. The deterministic route engine rejects inaccessible stations and ranks valid alternatives.
4. Incident mutations invalidate the query automatically.
5. Convex pushes the changed route to every subscribed client.

### Street routing

1. The traveller chooses origin and destination coordinates on the map.
2. The browser sends the coordinates and an opaque session identifier to a rate-limited Convex action.
3. Convex validates the coordinates and enforces a 10 metre to 25 kilometre request range.
4. The Valhalla provider requests wheelchair costing and returns geometry plus manoeuvres.
5. The browser compares each GPS update with the route geometry to estimate remaining distance.

Street coordinates and GPS samples are not stored.

### Official evidence monitoring

1. A six-hour cron calls an internal Node action.
2. Firecrawl reads one fixed TfL page. Users cannot supply a URL.
3. Convex hashes the markdown and creates one run per content hash.
4. OpenAI returns strict JSON candidates with the station, date text, impact, alternate access, confidence, and source excerpt.
5. Convex stores candidates as pending review.
6. Candidates do not change route eligibility automatically.

### Email verification

1. An authenticated user requests a code with an idempotency key.
2. Convex applies per-user and global limits.
3. A cryptographically random six-digit code is hashed with the idempotency key.
4. Convex stores the hash and expiry before calling AgentMail.
5. A successful comparison marks the address verified.
6. Five failed attempts lock the request. New requests supersede older active codes.

## Consistency and idempotency

Convex mutations are transactional. Journey saves, community reports, email requests, demo state changes, and evidence runs all use stable deduplication keys or desired-state writes.

External actions are treated as non-transactional boundaries. The email flow records pending state before delivery, then records sent or failed. The monitoring flow creates a processing run before OpenAI work, then records completed or failed. Repeated monitoring content is skipped by hash.

## Caching

There is no Redis instance. Convex caches query results and invalidates subscribed queries when their dependencies change. A second cache would require another invalidation protocol and could serve stale lift state, which is the exact failure StepFree must avoid.

## Failure handling

- TfL failures create a failed source snapshot and do not erase the last known route state.
- Firecrawl and OpenAI failures mark the evidence run failed when a run exists.
- Extracted AI candidates never enter live routing without a review decision.
- AgentMail failures mark the verification request failed and clear the pending address.
- Valhalla timeouts return a route error while map selection remains usable.
- GPS denial falls back to manual map pinning.

## Security controls

- Authentication is required for profile changes, journey history, and email verification.
- Public mutations validate identifiers, ownership, string lengths, coordinates, and related records.
- Rate limits cover email sends, code attempts, route calls, reports, saves, and demo controls.
- Verification codes are hashed and expire after ten minutes.
- Provider keys remain in Convex environment variables.
- The evidence crawler uses a fixed URL to prevent server-side request forgery.
- The browser applies a restrictive content security policy and permits only the configured map tile origin.
- Map popups use DOM text nodes for user-visible data.

## Production gaps

The public Valhalla service and community OpenStreetMap tiles are suitable for a hackathon demonstration, not a high-volume launch. Production needs contracted or self-hosted routing and tiles, service-level monitoring, a full network import, reviewed accessibility data coverage, and an incident operations console.
