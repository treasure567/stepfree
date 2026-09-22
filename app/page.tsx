import Image from "next/image";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUpRight,
  BellRing,
  Check,
  DatabaseZap,
  MailOpen,
  MapPin,
  Radio,
  Route,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { LiveIncidentCard } from "@/features/landing/live-incident-card";
import { RoutePlanner } from "@/features/landing/route-planner";
import { PwaRegister } from "@/shared/providers/pwa-register";
import { BrandMark } from "@/shared/ui/brand-mark";

const workflow = [
  {
    number: "01",
    eyebrow: "Source watch",
    title: "The city changes.",
    description:
      "Firecrawl watches official transport pages for lift closures, access changes, and planned works.",
    icon: Radio,
    tone: "lime",
  },
  {
    number: "02",
    eyebrow: "Incident intelligence",
    title: "Noise becomes truth.",
    description:
      "OpenAI turns scattered notices and community reports into structured, comparable incidents.",
    icon: Sparkles,
    tone: "cream",
  },
  {
    number: "03",
    eyebrow: "Live network",
    title: "Every route reacts.",
    description:
      "Convex synchronises incidents, confidence, affected stations, and route changes in real time.",
    icon: DatabaseZap,
    tone: "blue",
  },
  {
    number: "04",
    eyebrow: "Human signal",
    title: "People close the gap.",
    description:
      "AgentMail verifies traveller email addresses now, with targeted outage alerts next.",
    icon: MailOpen,
    tone: "coral",
  },
];

const principles = [
  {
    icon: ShieldCheck,
    title: "Evidence before confidence",
    copy: "Every incident shows its source, freshness, and verification state.",
  },
  {
    icon: Route,
    title: "Mobility first",
    copy: "Routes are ranked around step-free reality, not the average traveller.",
  },
  {
    icon: BellRing,
    title: "Warn before the barrier",
    copy: "A useful alert arrives while there is still time to choose another route.",
  },
];

export default function Home() {
  return (
    <main>
      <PwaRegister />
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <section className="hero-shell" aria-labelledby="hero-title">
        <Image
          className="hero-image"
          src="/stepfree-hero.png"
          alt="A wheelchair user follows a highlighted accessible route past a closed lift toward a working lift."
          fill
          priority
          sizes="100vw"
        />
        <div className="hero-wash" />
        <nav className="site-nav" aria-label="Main navigation">
          <Link className="brand" href="#top" aria-label="StepFree home">
            <BrandMark />
            <span>StepFree</span>
          </Link>

          <div className="nav-links">
            <Link href="#story">The journey</Link>
            <Link href="#system">How it works</Link>
            <Link href="#principles">Our standard</Link>
            <Link href="/proof">Live proof</Link>
            <Link href="/ops">Ops console</Link>
            <Link href="/account">Your profile</Link>
          </div>

          <Link className="nav-action" href="/navigate">
            Open live map
            <ArrowUpRight aria-hidden="true" />
          </Link>
        </nav>

        <div className="hero-content" id="top">
          <div className="hero-copy" id="main-content">
            <div className="eyebrow-pill">
              <span />
              London pilot
            </div>
            <h1 id="hero-title">
              A broken lift should never end the journey.
            </h1>
            <p>
              StepFree watches station access, verifies what changed, and finds
              a safer route before a broken lift becomes a dead end.
            </p>
            <div className="hero-actions">
              <Link className="primary-button" href="#planner">
                Plan a step-free route
                <ArrowDown aria-hidden="true" />
              </Link>
              <Link className="text-button" href="/proof">
                Watch a lift break, live
                <Radio aria-hidden="true" />
              </Link>
              <Link className="text-button" href="#story">
                See Maya&apos;s journey
                <ArrowUpRight aria-hidden="true" />
              </Link>
            </div>
          </div>

          <LiveIncidentCard />
        </div>

        <div className="hero-footer">
          <span>Built around mobility disabilities</span>
          <span className="hero-footer-line" />
          <span>Official signals + community evidence</span>
        </div>
      </section>

      <section className="planner-section" id="planner" aria-labelledby="planner-title">
        <div className="section-kicker">Start with certainty</div>
        <div className="planner-heading">
          <h2 id="planner-title">Where are you going?</h2>
          <p>
            Search the journey first. We check the access details underneath it.
          </p>
        </div>
        <RoutePlanner />
      </section>

      <section className="story-section" id="story" aria-labelledby="story-title">
        <div className="story-intro">
          <div className="section-kicker light">The moment that matters</div>
          <h2 id="story-title">Five minutes before Maya reaches the barrier.</h2>
          <p>
            A route planner should not discover an accessibility failure when
            the traveller is already standing in front of it.
          </p>
        </div>

        <div className="story-stage">
          <div className="story-route" aria-label="Example live journey timeline">
            <div className="route-line" />
            <div className="route-stop complete">
              <span><Check aria-hidden="true" /></span>
              <div>
                <strong>08:42</strong>
                <p>Step-free route planned from Waterloo.</p>
              </div>
            </div>
            <div className="route-stop alert">
              <span><BellRing aria-hidden="true" /></span>
              <div>
                <strong>08:49</strong>
                <p>Official lift failure detected at Bond Street.</p>
              </div>
            </div>
            <div className="route-stop active">
              <span><Route aria-hidden="true" /></span>
              <div>
                <strong>08:49</strong>
                <p>Journey rerouted through London Bridge. Five minutes added.</p>
              </div>
            </div>
          </div>

          <div className="journey-phone" aria-hidden="true">
            <div className="phone-bar">
              <span>08:49</span>
              <span>StepFree</span>
              <Radio />
            </div>
            <div className="phone-map">
              <div className="map-grid" />
              <div className="map-route route-a" />
              <div className="map-route route-b" />
              <span className="map-pin pin-a"><MapPin /></span>
              <span className="map-pin pin-b"><MapPin /></span>
              <div className="map-alert"><BellRing /></div>
            </div>
            <div className="phone-sheet">
              <span className="sheet-handle" />
              <div className="sheet-badge">Route updated</div>
              <h3>Still step-free.</h3>
              <p>London Bridge · 36 min · 2 changes</p>
              <div className="sheet-stat-row">
                <span><strong>4</strong> working lifts</span>
                <span><strong>2m</strong> checked ago</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="system-section" id="system" aria-labelledby="system-title">
        <div className="system-heading">
          <div>
            <div className="section-kicker">One incident. Four systems move.</div>
            <h2 id="system-title">The route is only as good as its evidence.</h2>
          </div>
          <p>
            StepFree combines official information, human reports, structured
            reasoning, and live state. Remove one layer and trust falls apart.
          </p>
        </div>

        <div className="workflow-grid">
          {workflow.map((item) => {
            const Icon = item.icon;
            return (
              <article className={`workflow-card ${item.tone}`} key={item.number}>
                <div className="workflow-card-top">
                  <span>{item.number}</span>
                  <Icon aria-hidden="true" />
                </div>
                <div>
                  <span className="workflow-eyebrow">{item.eyebrow}</span>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="principles-section" id="principles" aria-labelledby="principles-title">
        <div className="principles-copy">
          <div className="section-kicker">Our standard</div>
          <h2 id="principles-title">Designed around dignity, not disability.</h2>
          <p>
            StepFree does not ask travellers to trust a black box. It shows what
            changed, who reported it, and how recently the route was checked.
          </p>
          <a
            className="source-link"
            href="https://www.who.int/news-room/fact-sheets/detail/disability-and-health"
            target="_blank"
            rel="noreferrer"
          >
            1 in 6 people experience significant disability
            <ArrowUpRight aria-hidden="true" />
          </a>
        </div>

        <div className="principle-list">
          {principles.map((principle) => {
            const Icon = principle.icon;
            return (
              <article key={principle.title}>
                <div><Icon aria-hidden="true" /></div>
                <div>
                  <h3>{principle.title}</h3>
                  <p>{principle.copy}</p>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="closing-section" aria-labelledby="closing-title">
        <div className="closing-orbit orbit-one" />
        <div className="closing-orbit orbit-two" />
        <BrandMark />
        <span className="closing-kicker">London first. Every city next.</span>
        <h2 id="closing-title">The city should move with everyone.</h2>
        <p>
          StepFree is building the live accessibility layer every journey deserves.
        </p>
        <Link className="closing-button" href="/navigate">
          Open the live navigator
          <ArrowUpRight aria-hidden="true" />
        </Link>
      </section>

      <footer className="site-footer">
        <Link className="brand footer-brand" href="#top">
          <BrandMark />
          <span>StepFree</span>
        </Link>
        <p>Built for the Convex All Gas Hackathon.</p>
        <div>
          <Link href="#principles">Accessibility</Link>
          <Link href="#system">How it works</Link>
          <Link href="/proof">Live proof</Link>
          <Link href="/ops">Ops console</Link>
          <Link href="/account">Profile</Link>
        </div>
      </footer>
    </main>
  );
}
