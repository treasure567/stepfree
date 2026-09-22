# StepFree — 2:50 demo video script

**Rule:** talk less, click the real product. Everything below happens live on
`https://whimsical-ferret-778.convex.site`. No slides. Screen-record at 1080p, cursor visible.

**Before you record:** on the AgentMail dashboard, make sure the API key has
`message_send` permission (see README → Honest limits). If the email still can't
send at record time, use the *alternate* line at 1:35 and let the status panel
show the real pipeline instead of a delivered receipt — do not fake it.

**One-line thesis to keep in your head:** *AI reads the notice; it never decides a route is safe. A human-reviewed incident and deterministic code do that — and the traveller is warned before the barrier.*

---

### 0:00–0:12 — The problem (landing hero)
**Screen:** open `/` — the hero.
**VO:** "A broken lift can end a wheelchair user's journey. Not slow it down — end it. StepFree makes sure it doesn't."

### 0:12–0:30 — Open the live proof (no login)
**Screen:** click through to `/proof`. The route draws on the **live map** with numbered station markers: *Waterloo → … → Bond Street → … → Barbican, 31 minutes.* (You can change the From/To stations on camera if you want.)
**VO:** "This is production, no login. Maya's step-free route on a live map: Waterloo to Barbican, thirty-one minutes, through Bond Street."

### 0:30–0:58 — The evidence, and the boundary
**Screen:** scroll to the **Evidence** panel. Point the cursor at: Source (Transport for London), Model (gpt-5.4-mini), Content hash, the verbatim excerpt, the **"Excerpt verified"** badge, and **"Pending — cannot reroute yet."**
**VO:** "Firecrawl scraped the official TfL page. OpenAI turned it into a structured incident — and had to quote the exact sentence it relied on. StepFree checks that quote exists, word for word, in the source. But it's still pending. AI can read the notice. It cannot declare a route safe."

### 0:58–1:28 — The live reroute (the money shot)
**Screen:** click **"Break a lift on this route."** Do NOT refresh. Keep the map in frame: Bond Street turns **red ("lift down")**, the original line fades, and a **new line redraws through London Bridge** while the headline flips *31 → 36*, *+5 min*. Linger on "Convex live query · no refresh."
**VO:** "A human accepts the evidence. Now watch the map — no refresh. Convex reroutes her live around the broken lift, through London Bridge. Thirty-six minutes, five longer, still fully step-free."

### 1:28–1:52 — The alert, before the barrier
**Screen:** click **"Send the reroute alert."** Show the receipt: status → **sent**, the masked recipient, the provider **message ID**.
**VO (if delivering):** "AgentMail warns her — the new route, the added time — before she reaches the barrier. One incident, one email, with the provider's message ID."
**VO (alternate, if send is still key-gated):** "AgentMail sends the warning through the same pipeline — queued, de-duplicated, one incident, one email. Here's the live delivery status; the send key is being provisioned."

### 1:52–2:14 — Try to break the safety
**Screen:** click **"Run the safety checks."** Let the list resolve to **held**: invented evidence refused; one judge can't reroute another; unreviewed feeds can't reroute.
**VO:** "A wrong reroute strands a real person, so we attack our own guards. A fabricated quote is refused. One visitor's drill can't touch another's route. Even the official live feed is advisory until a human accepts it. All held."

### 2:14–2:34 — The live map
**Screen:** click **"Open live map"** → `/navigate`. Show the same session's reroute on the map; toggle a mobility preference if time.
**VO:** "Same journey on the live map — the reroute follows you here too, shaped by your mobility needs, not the average traveller's."

### 2:34–2:50 — Close
**Screen:** back to `/proof`, rest on the 31 → 36 headline. Optionally flash the architecture diagram for 2 seconds.
**VO:** "Firecrawl, OpenAI, AgentMail — real work, on Convex, on convex.site. Other apps help a team catch more talks. StepFree keeps a wheelchair user from being stranded at a broken lift — and warns her before she gets there."

---

## Capture checklist
- [ ] AgentMail key can send (or use the alternate 1:35 line).
- [ ] Reset the drill once before recording so the baseline reads 31 min.
- [ ] Record `/proof` top-to-bottom in one take; the reroute must be a single unbroken shot (no cut between click and update).
- [ ] Keep total under 3:00; aim for 2:50.
- [ ] End card: live URL + `/proof` + repo.
