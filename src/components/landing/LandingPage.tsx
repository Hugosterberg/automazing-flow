import { useEffect, useState } from "react";
import { m } from "framer-motion";
import { ArrowRight, CheckCircle2, Menu, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { LandingAtmosphere } from "@/components/landing/LandingAtmosphere";
import { LandingAuthPanel } from "@/components/landing/LandingAuthPanel";
import { LandingComparison, LandingPillars } from "@/components/landing/LandingComparison";
import {
  LandingIntegrationsMarquee,
  LandingProductDemo,
} from "@/components/landing/LandingProductDemo";
import { LandingSection } from "@/components/landing/LandingSection";
import { LANDING_STEPS, LANDING_TRUST_POINTS } from "@/lib/landingContent";
import { LandingFounderCase } from "@/components/landing/LandingFounderCase";
import { pageFadeUp, pageFadeUpTransition, sectionReveal, sectionRevealTransition } from "@/lib/motion";
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
  const [navOpen, setNavOpen] = useState(false);
  const [authInView, setAuthInView] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    function onScroll() {
      const y = window.scrollY;
      setShowMobileCta(y > 280);
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      setScrollProgress(docHeight > 0 ? Math.min(y / docHeight, 1) : 0);
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
    <div className="landing-root relative min-h-screen overflow-x-clip bg-black text-foreground">
      <LandingAtmosphere />

      <header className="sticky top-0 z-40 border-b border-white/10 bg-black/55 backdrop-blur-xl safe-top safe-x">
        <div className="landing-page-shell mx-auto flex h-14 min-w-0 max-w-6xl items-center justify-between gap-2 sm:gap-3">
          <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
            <Sheet open={navOpen} onOpenChange={setNavOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden" aria-label="Öppna meny">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[min(100vw-2rem,320px)] border-white/10 bg-black/95 backdrop-blur-xl">
                <SheetHeader>
                  <SheetTitle className="font-display text-left tracking-tight">automazing</SheetTitle>
                </SheetHeader>
                <nav className="mt-6 flex flex-col gap-1" aria-label="Mobilnavigering">
                  {NAV_LINKS.map((link) => (
                    <button
                      key={link.target}
                      type="button"
                      onClick={() => handleNavClick(link.target)}
                      className="rounded-lg px-3 py-2.5 text-left text-sm font-medium text-white/55 transition-colors hover:bg-white/5 hover:text-white"
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
                    className="mt-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-white"
                  >
                    Logga in / Skapa konto
                  </button>
                </nav>
              </SheetContent>
            </Sheet>

            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/15 bg-white text-black">
                <Zap className="h-3.5 w-3.5" aria-hidden />
              </div>
              <span className="truncate font-display text-base font-bold tracking-tight sm:text-lg">
                automazing
              </span>
            </div>
          </div>

          <nav className="hidden items-center gap-1 md:flex" aria-label="Sidnavigering">
            {NAV_LINKS.map((link) => (
              <button
                key={link.target}
                type="button"
                onClick={() => scrollToId(link.target)}
                className="rounded-md px-3 py-1.5 text-sm text-white/50 transition-colors hover:text-white"
              >
                {link.label}
              </button>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="hidden text-white/70 hover:bg-white/5 hover:text-white sm:inline-flex"
              onClick={scrollToAuth}
            >
              Logga in
            </Button>
            <Button
              size="sm"
              className="gap-1 bg-white px-2.5 text-xs text-black hover:bg-white/90 sm:gap-1.5 sm:px-3 sm:text-sm"
              onClick={scrollToAuth}
            >
              <span className="max-[360px]:sr-only">Kom igång</span>
              <span className="hidden max-[360px]:inline">Start</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <div aria-hidden className="h-px w-full bg-white/10">
          <div
            className="landing-scroll-progress h-full transition-[width] duration-150 ease-out"
            style={{ width: `${scrollProgress * 100}%` }}
          />
        </div>
      </header>

      {/* Full-bleed hero — brand first, one composition */}
      <section className="relative flex min-h-[100svh] flex-col justify-center">
        <div className="landing-page-shell relative z-10 mx-auto w-full max-w-6xl pb-16 pt-10 sm:pb-20 sm:pt-14 lg:pb-24 lg:pt-16">
          <m.div
            {...pageFadeUp}
            transition={pageFadeUpTransition}
            className="mx-auto max-w-4xl text-center lg:mx-0 lg:max-w-3xl lg:text-left"
          >
            <m.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: "easeOut" }}
              className="landing-brand-mark font-display text-[clamp(2.75rem,12vw,7.5rem)] font-bold leading-[0.9] tracking-[-0.04em] text-white"
            >
              automazing
            </m.p>

            <m.h1
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08, duration: 0.45, ease: "easeOut" }}
              className="mt-5 font-display text-[clamp(1.35rem,3.6vw,2.15rem)] font-semibold leading-snug tracking-tight text-white/90 sm:mt-7"
            >
              Automatiskt. Amazing.
            </m.h1>

            <m.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.14, duration: 0.4, ease: "easeOut" }}
              className="mx-auto mt-4 max-w-xl text-[0.95rem] leading-relaxed text-white/55 sm:mt-5 sm:text-base lg:mx-0 lg:text-lg"
            >
              Social, mail, recensioner och sälj i ett flöde — snabbt, smidigt och effektivt.
            </m.p>

            <m.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.4, ease: "easeOut" }}
              className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:mt-10 sm:flex-row sm:items-center lg:justify-start"
            >
              <Button
                size="lg"
                className="landing-shine gap-2 bg-white text-black hover:bg-white/90"
                onClick={scrollToAuth}
              >
                Skapa konto gratis
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-white/20 bg-transparent text-white hover:bg-white/5 hover:text-white"
                onClick={() => scrollToId("produktdemo")}
              >
                Se det i action
              </Button>
            </m.div>
          </m.div>
        </div>

        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black via-black/60 to-transparent"
        />
      </section>

      <div className="relative z-10 mx-auto grid min-w-0 max-w-6xl lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="landing-page-shell min-w-0 pb-32 pt-6 safe-x sm:pb-28 sm:pt-8 lg:pb-12 lg:pr-0 lg:pt-4">
          <div className="min-w-0 space-y-16 sm:space-y-20">
            <m.div {...sectionReveal} transition={sectionRevealTransition}>
              <LandingSection
                id="varfor"
                title="Varför byta?"
                description="Mindre admin. Mer koll. En app i stället för ett lapptäcke av verktyg."
              >
                <LandingComparison />
              </LandingSection>
            </m.div>

            <m.div {...sectionReveal} transition={{ ...sectionRevealTransition, delay: 0.05 }}>
              <LandingSection
                id="produktdemo"
                title="Se appen i action"
                description="Klicka på flikarna eller låt demon rulla — så här ser en vanlig dag ut."
              >
                <LandingProductDemo />
              </LandingSection>
            </m.div>

            <m.div {...sectionReveal} transition={{ ...sectionRevealTransition, delay: 0.05 }}>
              <div className="landing-section-frame space-y-3">
                <div className="space-y-2">
                  <div aria-hidden className="landing-section-accent" />
                  <p className="landing-title-glow text-sm font-medium text-foreground">
                    Kopplar till det du redan använder
                  </p>
                </div>
                <LandingIntegrationsMarquee />
              </div>
            </m.div>

            <m.div {...sectionReveal} transition={{ ...sectionRevealTransition, delay: 0.05 }}>
              <LandingSection
                title="Tre saker. En plattform."
                description="Allt hänger ihop — från första meddelande till stängd affär."
              >
                <LandingPillars />
              </LandingSection>
            </m.div>

            <m.div {...sectionReveal} transition={{ ...sectionRevealTransition, delay: 0.05 }}>
              <LandingSection title="Kom igång på tre steg">
                <ol className="relative grid gap-3 sm:grid-cols-3">
                  <div
                    aria-hidden
                    className="absolute left-[16.666%] right-[16.666%] top-7 hidden h-px bg-white/15 sm:block"
                  />
                  {LANDING_STEPS.map((step) => (
                    <li
                      key={step.step}
                      className="relative rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-center landing-premium-card hover-lift interactive sm:text-left"
                    >
                      <span className="mx-auto flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-white font-display text-sm font-bold text-black sm:mx-0">
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
            </m.div>

            <m.div {...sectionReveal} transition={{ ...sectionRevealTransition, delay: 0.05 }}>
              <LandingSection
                title="Byggt för dig som kör själv"
                description="Inget påhittat kundcase — så produkten används i praktiken."
              >
                <LandingFounderCase />
              </LandingSection>
            </m.div>

            <m.div {...sectionReveal} transition={{ ...sectionRevealTransition, delay: 0.05 }}>
              <div
                id="kom-igang"
                className="scroll-mt-20 rounded-[1.75rem] border border-white/15 bg-gradient-to-b from-white/[0.07] to-transparent p-7 landing-premium-card sm:rounded-3xl sm:p-8 lg:hidden"
              >
                <div className="mb-4 space-y-1">
                  <h2 className="font-display text-xl font-semibold tracking-tight">Redo att köra?</h2>
                  <p className="text-sm text-muted-foreground">
                    Skapa konto — du ser värdet redan första dagen.
                  </p>
                </div>
                <LandingAuthPanel compact />
                <ul className="mt-4 space-y-2">
                  {LANDING_TRUST_POINTS.map((point) => (
                    <li key={point} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-white/70" aria-hidden />
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            </m.div>

            <footer className="border-t border-white/10 px-1 pt-6 text-xs text-white/35 space-y-1">
              <p>© {new Date().getFullYear()} automazing</p>
              <p>
                Data raderas när du tar bort en profil under Inställningar → Data. Formella
                villkor/privacy publiceras separat.
              </p>
            </footer>
          </div>
        </div>

        <aside id="kom-igang-desktop" className="relative hidden scroll-mt-20 lg:block">
          <div className="sticky top-20 px-4 py-10 xl:px-5">
            <LandingAuthPanel />
            <ul className="mt-4 space-y-2">
              {LANDING_TRUST_POINTS.map((point) => (
                <li key={point} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-white/70" />
                  {point}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 landing-page-shell pb-6 safe-bottom safe-x lg:hidden">
        <div
          className={cn(
            "transition-all duration-300",
            showMobileCta && !authInView
              ? "pointer-events-auto translate-y-0 opacity-100"
              : "pointer-events-none translate-y-6 opacity-0"
          )}
        >
          <Button
            className="landing-cta-float landing-shine w-full gap-2 rounded-2xl border border-white/15 bg-white text-black hover:bg-white/90"
            size="lg"
            onClick={scrollToAuth}
          >
            Skapa konto gratis
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
