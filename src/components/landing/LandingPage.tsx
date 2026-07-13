import { useEffect, useState } from "react";
import { m } from "framer-motion";
import { ArrowRight, CheckCircle2, Menu, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
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

const HERO_STATS = [
  { value: "1", label: "inbox för allt" },
  { value: "AI", label: "som prioriterar" },
  { value: "60s", label: "till första koll" },
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
  const [navOpen, setNavOpen] = useState(false);
  const [authInView, setAuthInView] = useState(false);

  useEffect(() => {
    function onScroll() {
      setShowMobileCta(window.scrollY > 360);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const target = document.getElementById("kom-igang");
    if (!target) return;
    const observer = new IntersectionObserver(
      ([entry]) => setAuthInView(entry?.isIntersecting ?? false),
      { threshold: 0.35 }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  function handleNavClick(target: string) {
    setNavOpen(false);
    scrollToId(target);
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 landing-grid-bg opacity-[0.35]" />
      <div aria-hidden className="pointer-events-none absolute inset-0 landing-noise opacity-60" />
      <div aria-hidden className="pointer-events-none absolute inset-0 landing-spotlight" />
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="landing-orb absolute -left-32 top-20 h-72 w-72 rounded-full bg-primary/8 blur-3xl" />
        <div
          className="landing-orb absolute right-0 top-1/4 h-96 w-96 rounded-full bg-info/12 blur-3xl"
          style={{ animationDelay: "-3s" }}
        />
        <div
          className="landing-orb absolute bottom-1/4 left-1/3 h-64 w-64 rounded-full bg-primary/6 blur-3xl"
          style={{ animationDelay: "-5s" }}
        />
      </div>

      <header className="sticky top-0 z-40 border-b border-border/50 glass safe-top safe-x">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <Sheet open={navOpen} onOpenChange={setNavOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden" aria-label="Öppna meny">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[min(100vw-2rem,320px)] border-border/60 bg-background/95 backdrop-blur-xl">
                <SheetHeader>
                  <SheetTitle className="font-display text-left">automazing</SheetTitle>
                </SheetHeader>
                <nav className="mt-6 flex flex-col gap-1" aria-label="Mobilnavigering">
                  {NAV_LINKS.map((link) => (
                    <button
                      key={link.target}
                      type="button"
                      onClick={() => handleNavClick(link.target)}
                      className="rounded-lg px-3 py-2.5 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                    >
                      {link.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setNavOpen(false);
                      scrollToAuth();
                    }}
                    className="mt-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-primary"
                  >
                    Logga in / Skapa konto
                  </button>
                </nav>
              </SheetContent>
            </Sheet>

            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary glow-sm">
                <Zap className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="font-display text-lg font-bold">automazing</span>
            </div>
          </div>

          <nav className="hidden items-center gap-1 md:flex" aria-label="Sidnavigering">
            {NAV_LINKS.map((link) => (
              <button
                key={link.target}
                type="button"
                onClick={() => scrollToId(link.target)}
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground underline-grow"
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
        <div className="px-4 pb-24 pt-8 sm:px-6 lg:pb-12 lg:pr-8 lg:pt-10">
          <m.div {...pageFadeUp} transition={pageFadeUpTransition} className="space-y-14 sm:space-y-16">
            <section className="space-y-6">
              <p className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/50 px-3 py-1 text-xs text-muted-foreground backdrop-blur-sm">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-40" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                </span>
                Byggt för företag som växer online
              </p>

              <div className="max-w-2xl space-y-4">
                <h1 className="font-display text-[2.35rem] font-bold leading-[1.04] tracking-tight sm:text-5xl lg:text-[3.35rem]">
                  Sluta jaga flikar.
                  <span className="mt-1 block landing-gradient-text">Kör allt här.</span>
                </h1>
                <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
                  Sociala medier, mail, recensioner och sälj — samlat med AI som vet vad som behöver
                  göras idag.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button size="lg" className="gap-2 glow-md landing-shine" onClick={scrollToAuth}>
                  Skapa konto gratis
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button size="lg" variant="outline" className="border-border/80 bg-card/30" onClick={() => scrollToId("produktdemo")}>
                  Se demo
                </Button>
              </div>

              <div className="grid grid-cols-3 gap-2 sm:max-w-md sm:gap-3">
                {HERO_STATS.map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-xl border border-border/60 bg-card/40 px-2 py-2.5 text-center backdrop-blur-sm sm:px-3"
                  >
                    <p className="font-display text-lg font-bold tabular-nums sm:text-xl">{stat.value}</p>
                    <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground sm:text-[11px]">{stat.label}</p>
                  </div>
                ))}
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

            <LandingSection
              id="varfor"
              title="Varför byta?"
              description="Mindre admin. Mer koll. En app i stället för ett lapptäcke av verktyg."
            >
              <LandingComparison />
            </LandingSection>

            <LandingSection
              id="produktdemo"
              title="Se appen i action"
              description="Klicka på flikarna eller låt demon rulla — så här ser en vanlig dag ut."
            >
              <LandingProductDemo />
            </LandingSection>

            <div className="space-y-3">
              <p className="text-sm font-medium text-muted-foreground">
                Kopplar till det du redan använder
              </p>
              <LandingIntegrationsMarquee />
            </div>

            <LandingSection
              title="Tre saker. En plattform."
              description="Allt hänger ihop — från första meddelande till stängd affär."
            >
              <LandingPillars />
            </LandingSection>

            <LandingSection title="Kom igång på tre steg">
              <ol className="relative grid gap-3 sm:grid-cols-3">
                <div
                  aria-hidden
                  className="absolute left-[16.666%] right-[16.666%] top-7 hidden h-px bg-border sm:block"
                />
                {LANDING_STEPS.map((step) => (
                  <li
                    key={step.step}
                    className="relative rounded-2xl border border-border/70 bg-card/40 p-4 text-center sm:text-left hover-lift interactive"
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

            <div
              id="kom-igang"
              className="scroll-mt-20 rounded-2xl border border-primary/20 bg-gradient-to-b from-primary/8 to-card/30 p-5 landing-premium-card sm:p-6 lg:hidden"
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
          showMobileCta && !authInView ? "translate-y-0" : "translate-y-full"
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
