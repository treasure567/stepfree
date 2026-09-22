# StepFree launch kit

## Recommended lead image

Use `public/social/stepfree-station-reroute.png` for the first post. It tells the problem in one frame: a wheelchair user, a failed lift, and a visible alternate route.

Attach one real screenshot from `/proof` as the second image. The generated visual earns attention. The product screenshot proves the build exists.

## Generated assets

| File | Format | Best use |
| --- | --- | --- |
| `public/social/stepfree-station-reroute.png` | 1672 by 941 | X or LinkedIn lead image |
| `public/social/stepfree-system-route.png` | 1672 by 941 | Technical follow-up post or README visual |
| `public/social/stepfree-commuter-reroute.png` | 1122 by 1402 | LinkedIn portrait or X image 2 |

These are AI-generated concept visuals, not documentary photographs. Label them that way if the platform or post context could make a viewer think they depict a real user.

## X thread

### Post 1

A wheelchair user plans a 31-minute Tube journey.

Then one lift fails.

StepFree catches the evidence, reroutes her in real time, and sends the new step-free route before she reaches the barrier.

We built it for #AllGasHackathon.

### Post 2

The live demo starts at Waterloo and reaches Barbican through Bond Street in 31 minutes.

Break the Bond Street lift and the route changes, without a refresh, to London Bridge in 36 minutes.

Five extra minutes. Zero stairs. No dead end.

### Post 3

The safety rule is simple:

AI reads the notice. It does not declare a route safe.

Firecrawl fetches the official source. OpenAI returns structured evidence and an exact quote. StepFree verifies the quote. A human accepts it. Deterministic code chooses the route.

### Post 4

We attacked the reroute six ways through the production code:

Fabricated evidence. Unreviewed data. Cross-session interference. Stale writes. Replayed actions. Duplicate effects.

The product shows what it rejected and why.

### Post 5

Try the real product:

Judge demo: https://whimsical-ferret-778.convex.site/proof

Live app: https://whimsical-ferret-778.convex.site

Built on Convex with OpenAI, Firecrawl, and AgentMail.

#Accessibility #BuildInPublic

## LinkedIn post

A broken lift does not add five minutes to a wheelchair user's journey. It can end the journey.

We built StepFree for that moment.

Maya plans Waterloo to Barbican. The route is 31 minutes through Bond Street. Then the Bond Street lift fails.

StepFree catches the official notice, verifies the source, waits for human approval, and redraws the journey through London Bridge. The new route is 36 minutes and still step-free. Convex pushes the change to the map without a refresh. AgentMail is the delivery channel for the warning before Maya reaches the barrier.

The rule behind the product is deliberate: AI reads the notice. It does not declare a route safe.

Firecrawl fetches the official source. OpenAI extracts structured incident data and must return the exact sentence it used. StepFree checks that quote against the source. A human accepts the incident. Deterministic graph search chooses the route.

The current build has 23 Convex tables, 61 indexes, 2 durable workflows, 2 bounded workpools, 4 crons, an operations console, a session-isolated judge drill, a shareable reroute receipt, and 107 automated tests. Those numbers are engineering evidence. The product is the five-minute detour that prevents a dead end.

Try it without an account:

Judge demo: https://whimsical-ferret-778.convex.site/proof

Live app: https://whimsical-ferret-778.convex.site

Built for the Convex All Gas Hackathon with OpenAI, Firecrawl, and AgentMail.

#AllGasHackathon #Accessibility #BuildInPublic

## Posting checklist

- Use the lead concept image first and a real `/proof` screenshot second.
- Add alt text: "Wheelchair user at a station with a failed lift while StepFree shows a step-free alternate route."
- Publish the X thread and LinkedIn post while the demo link is live.
- Reply to the launch post with the under-three-minute video.
- Replace `LAUNCH_POST_URL` in `hackathon.md` with the strongest post.
- Record the first-hour engagement count for the submission form.
