import { useEffect, useState } from "react";
import { m } from "framer-motion";
import { ArrowRight, CheckCircle2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LandingAuthPanel } from "@/components/landing/LandingAuthPanel";
import { LandingComparison, LandingPillars } from "@/components/landing/LandingComparison";
import {
  LandingIntegrationsMarquee,
  LandingProductDemo,
} from "@/components/landing/LandingProductDemo";
import { LandingSection } from "@/components/landing/LandingSection";
import { LANDING_STEPS, LANDING_TRUST_POINTS } from "@/lib/landingContent";
import { pageFadeUp, pageFadeUpTransition } from "@/lib/motion";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { label: "Demo", target: "produktdemo" },
  { label: "Varför", target: "varfor" },
  { label: "Kom igång", target: "kom-igang" },
] as const;

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function scrollToAuth() {
  const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
  scrollToId(isDesktop ? "kom-igang-desktop" : "kom-igang");
}

export function LandingPage() {
  const [showMobileCta, setShowMobileCta] = useState(false);

  useEffect(() => {
    function onScroll() {
      setShowMobileCta(window.scrollY > 360);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 landing-grid-bg opacity-[0.35]" />
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="landing-orb absolute -left-32 top-20 h-72 w-72 rounded-full bg-primary/5 blur-3xl" />
        <div
          className="landing-orb absolute right-0 top-1/4 h-96 w-96 rounded-full bg-info/10 blur-3xl"
          style={{ animationDelay: "-3s" }}
        />
      </div>

      <header className="sticky top-0 z-40 border-b border-border/50 glass safe-top safe-x">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary">
              <Zap className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-display text-lg font-bold">automazing</span>
          </div>

          <nav className="hidden items-center gap-1 md:flex" aria-label="Sidnavigering">
            {NAV_LINKS.map((link) => (
              <button
                key={link.target}
                type="button"
                onClick={() => scrollToId(link.target)}
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="hidden sm:inline-flex" onClick={scrollToAuth}>
              Logga in
            </Button>
            <Button size="sm" className="gap-1.5 glow-sm" onClick={scrollToAuth}>
              Kom igång
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </header>

      <div className="relative mx-auto grid max-w-7xl lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="px-4 pb-20 pt-8 sm:px-6 lg:pb-12 lg:pr-8 lg:pt-10">
          <m.div {...pageFadeUp} transition={pageFadeUpTransition} className="space-y-14 sm:space-y-16">
            {/* Hero — kort och tydlig */}
            <section className="space-y-6">
              <p className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/50 px-3 py-1 text-xs text-muted-foreground">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-40" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                </span>
                Byggt för företag som växer online
              </p>

              <div className="max-w-2xl space-y-4">
                <h1 className="font-display text-4xl font-bold leading-[1.06] tracking-tight sm:text-5xl lg:text-[3.15rem]">
                  Sluta jaga flikar.
                  <span className="mt-1 block landing-gradient-text">Kör allt här.</span>
                </h1>
                <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
                  Sociala medier, mail, recensioner och sälj — samlat med AI som vet vad som behöver
                  göras idag.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button size="lg" className="gap-2 glow-md" onClick={scrollToAuth}>
                  Skapa konto gratis
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button size="lg" variant="outline" onClick={() => scrollToId("produktdemo")}>
                  Se demo
                </Button>
              </div>

              <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground sm:text-sm">
                {LANDING_TRUST_POINTS.map((point) => (
                  <li key={point} className="inline-flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary" aria-hidden />
                    {point}
                  </li>
                ))}
              </ul>
            </section>

            {/* Jämförelse — tydlighet */}
            <LandingSection
              id="varfor"
              title="Varför byta?"
              description="Mindre admin. Mer koll. En app i stället för ett lapptäcke av verktyg."
            >
              <LandingComparison />
            </LandingSection>

            {/* Demo */}
            <LandingSection
              id="produktdemo"
              title="Se appen i action"
              description="Klicka på flikarna eller låt demon rulla — så här ser en vanlig dag ut."
            >
              <LandingProductDemo />
            </LandingSection>

            {/* Integrationer */}
            <div className="space-y-3">
              <p className="text-sm font-medium text-muted-foreground">
                Kopplar till det du redan använder
              </p>
              <LandingIntegrationsMarquee />
            </div>

            {/* Tre pelare — enkelhet */}
            <LandingSection
              title="Tre saker. En plattform."
              description="Allt hänger ihop — från första meddelande till stängd affär."
            >
              <LandingPillars />
            </LandingSection>

            {/* Steg */}
            <LandingSection title="Kom igång på tre steg">
              <ol className="relative grid gap-3 sm:grid-cols-3">
                <div
                  aria-hidden
                  className="absolute left-[16.666%] right-[16.666%] top-7 hidden h-px bg-border sm:block"
                />
                {LANDING_STEPS.map((step) => (
                  <li
                    key={step.step}
                    className="relative rounded-2xl border border-border/70 bg-card/40 p-4 text-center sm:text-left"
                  >
                    <span className="mx-auto flex h-8 w-8 items-center justify-center rounded-full border border-primary/30 bg-primary/10 font-display text-sm font-bold text-primary sm:mx-0">
                      {step.step}
                    </span>
                    <h3 className="mt-3 text-sm font-semibold">{step.title}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {step.description}
                    </p>
                  </li>
                ))}
              </ol>
            </LandingSection>

            {/* Mobil auth */}
            <div
              id="kom-igang"
              className="scroll-mt-20 rounded-2xl border border-primary/20 bg-gradient-to-b from-primary/8 to-card/30 p-5 sm:p-6 lg:hidden"
            >
              <div className="mb-4 space-y-1">
                <h2 className="font-display text-xl font-semibold">Redo?</h2>
                <p className="text-sm text-muted-foreground">
                  Skapa konto — du ser värdet redan första dagen.
                </p>
              </div>
              <LandingAuthPanel compact />
            </div>

            <footer className="border-t border-border/50 pt-6 text-xs text-muted-foreground/70">
              © {new Date().getFullYear()} automazing
            </footer>
          </m.div>
        </div>

        {/* Desktop auth */}
        <aside id="kom-igang-desktop" className="relative hidden scroll-mt-20 lg:block">
          <div className="sticky top-20 px-4 py-10 xl:px-5">
            <LandingAuthPanel />
            <ul className="mt-4 space-y-2">
              {LANDING_TRUST_POINTS.map((point) => (
                <li key={point} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                  {point}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 border-t border-border/60 bg-background/90 p-3 backdrop-blur-md transition-transform duration-300 safe-bottom safe-x lg:hidden",
          showMobileCta ? "translate-y-0" : "translate-y-full"
        )}
      >
        <Button className="w-full gap-2 glow-sm" size="lg" onClick={scrollToAuth}>
          Skapa konto gratis
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
