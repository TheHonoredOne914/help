import type { ReactNode } from "react";
import { Link } from "wouter";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";

const POINTS = [
  {
    name: "Citations that survive cross-examination",
    detail:
      "Source-usage validation and quality repair gate every answer. Runs that cannot back their claims fail instead of bluffing.",
    feature: true,
  },
  {
    name: "Six specialists argue before you speak",
    detail:
      "Legal, economic, strategic, social, historical, and opposition councillors deliberate. A Chief delivers the verdict.",
    feature: false,
  },
  {
    name: "Built for Indian MUN",
    detail:
      "Drafting desk, opening speeches, Hinglish kavita, live rebuttals, and archive memory that carries briefs sitting to sitting.",
    feature: false,
  },
] as const;

const COUNCILLORS = [
  { name: "Legal", remit: "Constitutional validity, court doctrine, statutory limits." },
  { name: "Economic", remit: "Fiscal impact, implementation cost, welfare tradeoffs." },
  { name: "Strategic", remit: "Floor strategy, coalition pressure, debate utility." },
  { name: "Social", remit: "Rights impact, affected communities, civil liberties." },
  { name: "Historical", remit: "Precedent, committee history, institutional memory." },
  { name: "Opposition", remit: "Counter-case, vulnerabilities, POI pressure." },
] as const;

const RHETORICS = [
  {
    name: "Kavita",
    body: "Verse in Hinglish for committee topics, closed with a two-line muktak.",
    tone: "kavita",
  },
  {
    name: "Opening Speech",
    body: "A ninety-second arc: hook, country context, argument, demand, closer.",
    tone: "speech",
  },
  {
    name: "Open Debate",
    body: "A sparring partner that takes the other side, plus three counters you can steal.",
    tone: "debate",
  },
] as const;

const STEPS = [
  {
    verb: "Retrieve",
    body: "Pull Indian government, court, and policy sources against the debate agenda.",
  },
  {
    verb: "Ground",
    body: "Enrich pages, score citation eligibility, and keep claims tied to evidence.",
  },
  {
    verb: "Brief",
    body: "Ship an Order Paper answer with citations ready for Treasury and Opposition.",
  },
] as const;

function Reveal({
  children,
  delay = 0,
  className,
  as = "div",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "li";
}) {
  const reduce = useReducedMotion();
  if (reduce) {
    return as === "li" ? (
      <li className={className}>{children}</li>
    ) : (
      <div className={className}>{children}</div>
    );
  }
  const Comp = as === "li" ? motion.li : motion.div;
  return (
    <Comp
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </Comp>
  );
}

function HeroCopy() {
  const reduce = useReducedMotion();
  const copy = (
    <>
      <p className="landing-kicker">Indian Mock Parliament research</p>
      <h1 className="landing-hero-title">
        Research that can <em>stand</em> on the floor.
      </h1>
      <p className="landing-hero-lede">
        Retrieve sources, ground every claim, and brief with citations before you speak.
      </p>
      <div className="landing-hero-cta">
        <Button asChild size="lg" className="desk-topbar-primary px-8">
          <Link href="/chat">Open the desk</Link>
        </Button>
        <a href="#how-it-works" className="landing-hero-secondary">
          How it works <span aria-hidden>→</span>
        </a>
      </div>
    </>
  );
  if (reduce) return <div className="landing-hero-copy">{copy}</div>;
  return (
    <motion.div
      className="landing-hero-copy"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      {copy}
    </motion.div>
  );
}

function PreviewFigure() {
  const reduce = useReducedMotion();
  const figure = (
    <figure className="landing-preview-frame" aria-label="Product preview">
      <div className="landing-preview-chrome">
        <span className="landing-preview-label">Order Paper · Fast research</span>
      </div>
      <article className="research-answer landing-preview-body">
        <h2>Opening argument</h2>
        <p>
          Online political advertising and deepfakes need enforceable rules before the next
          electoral cycle{" "}
          <span className="citation-chip">[1]</span>
        </p>
        <h2>Key findings</h2>
        <ol>
          <li>
            ECI guidance already pushes platforms toward provenance labeling{" "}
            <span className="citation-chip">[2]</span>
          </li>
          <li>
            Court and policy briefs disagree on enforcement speed, not on the risk itself.
          </li>
          <li>
            A usable brief names the agency, the holding, and the limit of the claim.
          </li>
        </ol>
        <blockquote>
          Every contested number on the floor should carry a verifiable cite.
        </blockquote>
        <div className="landing-preview-sources">
          <span className="landing-preview-source">[1] PIB · Ministry brief</span>
          <span className="landing-preview-source">[2] The Hindu · ECI coverage</span>
        </div>
      </article>
    </figure>
  );
  if (reduce) return <div className="landing-hero-visual">{figure}</div>;
  return (
    <motion.div
      className="landing-hero-visual"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
    >
      {figure}
    </motion.div>
  );
}

export default function LandingPage() {
  return (
    <div className="landing">
      <a href="#main" className="skip-link">Skip to content</a>
      <div className="landing-ruled" aria-hidden />

      <header className="landing-nav">
        <Link href="/" className="landing-nav-brand">
          BestDel
          <span className="landing-nav-rule" aria-hidden />
        </Link>
        <div className="landing-nav-actions">
          <Button asChild variant="ghost" size="sm" className="landing-nav-ghost">
            <Link href="/auth">Sign in</Link>
          </Button>
          <Button asChild size="sm" className="desk-topbar-primary">
            <Link href="/chat">Open the desk</Link>
          </Button>
        </div>
      </header>

      <main id="main" className="landing-main">
        <section className="landing-hero">
          <div className="landing-hero-grid">
            <HeroCopy />
            <PreviewFigure />
          </div>
        </section>

        <section className="landing-modes" aria-label="Why BestDel">
          <div className="landing-modes-inner">
            <Reveal className="landing-modes-head">
              <h2 className="landing-section-title">Argue from evidence.</h2>
            </Reveal>
            <div className="landing-bento">
              {POINTS.map((point, i) => (
                <Reveal
                  key={point.name}
                  delay={i * 0.08}
                  className={point.feature ? "landing-bento-feature" : "landing-bento-cell"}
                >
                  {point.feature ? (
                    <>
                      <div>
                        <h3 className="landing-bento-name">{point.name}</h3>
                        <p className="landing-bento-detail">{point.detail}</p>
                      </div>
                      <div className="landing-bento-cites" aria-hidden>
                        <span className="landing-bento-chip">[1]</span>
                        <span className="landing-bento-chip">[2]</span>
                        <span className="landing-bento-cite">Every claim carries its source</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <h3 className="landing-mode-name">{point.name}</h3>
                      <p className="landing-mode-detail">{point.detail}</p>
                    </>
                  )}
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="landing-desk" aria-label="App preview">
          <div className="landing-desk-inner">
            <Reveal>
              <h2 className="landing-section-title">Take a seat at the desk.</h2>
              <p className="landing-section-lede">
                Cited answers, archived briefs, and a composer that speaks committee.
              </p>
            </Reveal>
            <Reveal delay={0.1}>
              <figure
                className="landing-desk-frame"
                role="img"
                aria-label="Preview of the BestDel research desk: archives sidebar, cited answer thread, and mode composer."
              >
                <div className="landing-desk-top">
                  <span className="landing-desk-brand">BestDel</span>
                  <span className="landing-desk-archive">UNSC Reform · Active Archive</span>
                  <span className="landing-desk-model">Drafting · your selected model</span>
                </div>
                <div className="landing-desk-body">
                  <div className="landing-desk-side">
                    <p className="landing-desk-sidehead">Archives</p>
                    <span className="landing-desk-arch is-active">UNSC Reform</span>
                    <span className="landing-desk-arch">Deepfake Rules</span>
                    <span className="landing-desk-arch">Climate Finance</span>
                  </div>
                  <div className="landing-desk-thread">
                    <p className="landing-desk-user">
                      What should India demand on deepfake rules at the next sitting?
                    </p>
                    <div className="assistant-bubble landing-desk-answer">
                      <p>
                        Enforceable provenance labeling before the next electoral cycle{" "}
                        <span className="citation-chip">[1]</span>
                      </p>
                      <p>
                        ECI guidance already pushes platforms toward labeling{" "}
                        <span className="citation-chip">[2]</span>
                      </p>
                    </div>
                    <div className="landing-desk-composer">
                      <div className="landing-desk-chips">
                        <span className="is-active">Drafting</span>
                        <span>Rhetorics</span>
                        <span>Fast Research</span>
                        <span>Deep Research</span>
                        <span>Council</span>
                      </div>
                      <div className="landing-desk-input">
                        <span>Type your message...</span>
                        <span className="landing-desk-send" aria-hidden>
                          ↑
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </figure>
            </Reveal>
          </div>
        </section>

        <section className="landing-chamber" aria-label="Council chamber">
          <div className="landing-chamber-inner">
            <Reveal>
              <h2 className="landing-section-title">Six minds. One verdict.</h2>
              <p className="landing-section-lede">
                Six councillors stress-test the agenda from six sides. The Chief compresses
                the clash into a floor strategy.
              </p>
            </Reveal>
            <div className="landing-roster">
              {COUNCILLORS.map((c, i) => (
                <Reveal key={c.name} delay={i * 0.05} className="landing-roster-cell">
                  <h3 className="landing-roster-name">{c.name}</h3>
                  <p className="landing-roster-remit">{c.remit}</p>
                </Reveal>
              ))}
            </div>
            <Reveal delay={0.1}>
              <p className="landing-chief-line">
                The Chief reads all six briefs and seals one verdict.
              </p>
            </Reveal>
          </div>
        </section>

        <section className="landing-rhetorics" aria-label="Rhetorics">
          <div className="landing-rhetorics-inner">
            <Reveal>
              <h2 className="landing-section-title">Say it out loud.</h2>
              <p className="landing-section-lede">
                The same brief, rewritten for the microphone. Pick a form, tune the
                creativity dial, take the floor.
              </p>
            </Reveal>
            <div className="landing-strip">
              {RHETORICS.map((r, i) => (
                <Reveal
                  key={r.name}
                  delay={i * 0.08}
                  className={`landing-strip-card tone-${r.tone}`}
                >
                  <h3 className="landing-strip-name">{r.name}</h3>
                  <p className="landing-strip-body">{r.body}</p>
                </Reveal>
              ))}
            </div>
            <Reveal delay={0.1}>
              <p className="landing-strip-note">A creativity dial runs from Rational to Maximal.</p>
            </Reveal>
          </div>
        </section>

        <section id="how-it-works" className="landing-steps">
          <Reveal>
            <h2 className="landing-section-title">How it works</h2>
            <p className="landing-section-lede">
              Three stages. Same desk. No uncited flourish.
            </p>
          </Reveal>
          <ol className="landing-ledger">
            {STEPS.map((step, i) => (
              <Reveal key={step.verb} delay={i * 0.06} as="li" className="landing-ledger-row">
                <span className="landing-ledger-verb">{step.verb}</span>
                <p className="landing-ledger-body">{step.body}</p>
              </Reveal>
            ))}
          </ol>
        </section>

        <section className="landing-close">
          <Reveal className="landing-close-panel">
            <p className="landing-close-line">Ready when the House is.</p>
            <p className="landing-close-lede">
              Open the desk, set the agenda, and leave with citations you can defend.
            </p>
            <div className="landing-close-cta">
              <Button asChild size="lg" className="desk-topbar-primary px-8">
                <Link href="/chat">Open the desk</Link>
              </Button>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="landing-footer">
        <span>BestDel</span>
        <span className="landing-footer-sep" aria-hidden />
        <span>Indian Mock Parliament research</span>
      </footer>
    </div>
  );
}
