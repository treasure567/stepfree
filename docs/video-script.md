# StepFree 2:50 demo video

Talk less. Click the real product. Record at 1080p with the cursor visible. Use the production URL, not localhost.

Before recording, reset the drill and test the full path once. AgentMail delivery is live over SMTP — show the alert reaching the `sent` state with its real provider message id. If a send ever fails on the day, use the honest alternate line below and show the real failed provider state rather than implying delivery succeeded.

## 0:00 to 0:12, the human problem

**Screen:** Open the production landing page.

**Voice:** "A broken lift can end a wheelchair user's journey. StepFree finds the evidence, reroutes the journey, and warns the traveller before the barrier."

## 0:12 to 0:29, the baseline

**Screen:** Open `/proof`. Keep the route and metrics visible.

**Voice:** "This is the live judge demo. Maya is travelling from Waterloo to Barbican. The step-free route is 31 minutes through Bond Street."

## 0:29 to 0:53, prove the evidence boundary

**Screen:** Show the Evidence panel. Point to the TfL source, model, source hash, exact excerpt, and pending state.

**Voice:** "Firecrawl fetched the official TfL page. OpenAI returned a structured incident and the exact sentence it relied on. StepFree verifies that quote against the source. It is still pending because AI cannot declare a route safe."

## 0:53 to 1:17, the live reroute

**Screen:** Press **Break a lift on this route**. Do not refresh. Keep the map and 31 to 36 change in one uninterrupted shot.

**Voice:** "A human accepts the incident. Convex updates the journey live, with no refresh. Bond Street is excluded and the route moves through London Bridge. Thirty-six minutes, five longer, still step-free."

## 1:17 to 1:38, attack the safety controls

**Screen:** Press **Run the attacks**. Show the six results and final held count.

**Voice:** "A wrong reroute can strand a real person, so the demo attacks the production guards. Fabricated evidence, unreviewed data, cross-session interference, stale writes, replayed actions, and duplicate effects are refused. The screen says what failed and how long each check took."

## 1:38 to 1:57, make the proof permanent

**Screen:** Press **Share this rescue**. Show the verified receipt and copied `/proof?run=` link.

**Voice:** "This receipt preserves the before route, the new route, the affected lift, the source hash, model, and all six safety results. Anyone with the link can inspect the same proof."

## 1:57 to 2:16, show the traveller outcome

**Screen:** Start the on-map journey simulation. Let the wheelchair marker move. Open SOS briefly if the timing works.

**Voice:** "The product follows the traveller, not just the incident. The wheelchair moves along the accessible route, and an SOS creates a timed emergency case for the operations team."

## 2:16 to 2:34, show the alert truthfully

**Screen:** Press **Send the reroute alert** and show the real status.

**Voice if delivery succeeds:** "AgentMail sends the new route before Maya reaches the barrier. The receipt stores the masked recipient, status, and provider message ID. Duplicate sends collapse to one alert."

**Alternate voice if a send fails on the day:** "The application queues and deduplicates the alert, but this delivery failed at the provider. The product shows that failure and lets us requeue, instead of inventing a delivery."

## Optional bonus (~15s), the operations console and the two-way loop

Include this only if you can stay under 3:00. It is the strongest technical proof.

**Screen:** Open `/ops`. Show the Activity log with provider pills (Firecrawl, OpenAI, TfL, AgentMail), click the **AgentMail** filter, then open **Inbox** and show the parsed reply tagged "arrived".

**Voice:** "Every action is logged with the provider that performed it. And the loop closes both ways — a traveller's reply comes back through an AgentMail webhook, is verified and parsed to an intent, with no polling."

## 2:34 to 2:50, close on the result

**Screen:** Return to the 31 to 36 route result. End with the live URL and repository.

**Voice:** "StepFree is live on Convex, with OpenAI, Firecrawl, and AgentMail doing product work. One broken lift. Five extra minutes. No dead end."

## Capture checklist

- [ ] Production `/proof` starts at the 31-minute baseline.
- [ ] The reroute is one uncut shot from button press to map update.
- [ ] All six attacks show held.
- [ ] The shareable receipt opens in a private window.
- [ ] The AgentMail line matches the real provider result.
- [ ] No secret, private email address, or admin credential appears.
- [ ] The video is under 3:00, ideally 2:45 to 2:50.
- [ ] The end card contains the live URL, `/proof`, and repository.
- [ ] `VIDEO_URL` in `hackathon.md` is replaced after upload.
