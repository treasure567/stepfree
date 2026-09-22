@AGENTS.md

## Working on StepFree (Claude)

The full project guide — deploy commands, env vars, tests/CI gotchas, and subsystems — is in [AGENTS.md](AGENTS.md). Read it before shipping.

- **Verify on the deployed build in the user's real browser, not just the built-in preview.** This repo repeatedly produced "works in my pane, broken for the user" — caused by HTTP cache, service-worker staleness, and `requestAnimationFrame` pausing on hidden/background tabs. Reproduce in the user's Chrome and hard-reload before concluding anything.
- **Don't claim a fix is live from source alone.** Deploy (backend + `static-hosting upload`), then confirm the deployed URL actually serves it.
- When a UI element looks "missing", check auth/route state first — e.g. `/account` hides the sign-in form (and its pre-filled demo login) when already signed in.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
