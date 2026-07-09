import { useEffect, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { Bot, LineChart, MessageSquare, Pause, Play, Sparkles, Star, Zap } from "lucide-react";
import {
  DEMO_SCENES,
  DEMO_SIDEBAR_ACTIVE,
  LANDING_INTEGRATIONS,
  type DemoSceneId,
} from "@/lib/landingContent";
import { cn } from "@/lib/utils";

const SCENE_DURATION_MS = 5200;

const SIDEBAR_NAV = ["Home", "Meddelanden", "Recensioner", "Försäljning", "Uppgifter"];

function BrowserChrome({
  children,
  activeNav,
}: {
  children: React.ReactNode;
  activeNav: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/80 bg-card/90 shadow-2xl glow-md">
      <div className="flex items-center gap-2 border-b border-border/60 bg-muted/30 px-4 py-2.5">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-success/70" />
        </div>
        <div className="mx-auto flex h-6 w-full max-w-xs items-center justify-center rounded-md bg-background/60 px-3 text-[10px] text-muted-foreground">
          app.automazing.io
        </div>
      </div>
      <div className="flex min-h-[320px] bg-gradient-to-br from-background via-card to-muted/20 sm:min-h-[380px]">
        <div className="hidden w-[108px] shrink-0 border-r border-border/50 bg-sidebar/80 p-2 sm:block">
          <div className="mb-3 flex items-center gap-1.5 px-1.5">
            <div className="h-5 w-5 rounded-md bg-primary" />
            <span className="font-display text-[10px] font-bold">automazing</span>
          </div>
          <nav className="space-y-0.5">
            {SIDEBAR_NAV.map((item) => (
              <div
                key={item}
                className={cn(
                  "rounded-md px-2 py-1.5 text-[10px] transition-colors",
                  item === activeNav
                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/60"
                )}
              >
                {item}
              </div>
            ))}
            {activeNav === "MCP Intelligence" ? (
              <div className="rounded-md bg-sidebar-accent px-2 py-1.5 text-[10px] font-medium text-sidebar-accent-foreground">
                MCP Intelligence
              </div>
            ) : null}
          </nav>
        </div>
        <div className="relative flex-1 p-4 sm:p-5">{children}</div>
      </div>
    </div>
  );
}

function HomeScene() {
  const tiles = [
    { label: "Olästa meddelanden", value: 7, color: "text-info" },
    { label: "Recensioner att svara på", value: 3, color: "text-warning" },
    { label: "Uppgifter idag", value: 5, color: "text-foreground" },
    { label: "Affärer i pipeline", value: 12, color: "text-success" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Idag</p>
          <p className="font-display text-lg font-semibold">God morgon, Anna</p>
        </div>
        <m.span
          animate={{ scale: [1, 1.08, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[10px] font-medium text-primary"
        >
          4 prioriterade
        </m.span>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {tiles.map((tile, index) => (
          <m.div
            key={tile.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.08 }}
            className="rounded-xl border border-border/70 bg-background/60 p-3"
          >
            <p className="text-[10px] text-muted-foreground">{tile.label}</p>
            <p className={cn("mt-1 text-2xl font-bold tabular-nums", tile.color)}>
              <AnimatedCounter target={tile.value} delay={index * 120} />
            </p>
          </m.div>
        ))}
      </div>
      <m.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="rounded-xl border border-primary/25 bg-primary/5 p-3"
      >
        <div className="flex items-start gap-2">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="space-y-1">
            <p className="text-xs font-medium">AI-rekommendation</p>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Svara på 3 Google-recensioner — snittbetyget kan höjas till 4,8★ denna vecka.
            </p>
          </div>
        </div>
      </m.div>
    </div>
  );
}

function MessagesScene() {
  const messages = [
    { from: "Lisa K.", channel: "Instagram", wait: "2h", unread: true },
    { from: "support@kund.se", channel: "Gmail", wait: "45m", unread: true },
    { from: "Marcus A.", channel: "WhatsApp", wait: "1d", unread: false },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_1.1fr]">
      <div className="space-y-2">
        {messages.map((msg, index) => (
          <m.div
            key={msg.from}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            className={cn(
              "rounded-lg border px-3 py-2.5 text-xs",
              msg.unread
                ? "border-primary/30 bg-primary/5"
                : "border-border/60 bg-background/40"
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{msg.from}</span>
              <span className="text-[10px] text-muted-foreground">{msg.wait}</span>
            </div>
            <p className="mt-0.5 text-[10px] text-muted-foreground">{msg.channel}</p>
          </m.div>
        ))}
      </div>
      <m.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="rounded-xl border border-border/70 bg-background/50 p-3"
      >
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">AI-sammanfattning</p>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Lisa frågar om öppettider på lördag och vill boka bord för 4 personer kl 18.
        </p>
        <m.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          transition={{ delay: 0.9 }}
          className="mt-3 rounded-lg border border-border/60 bg-muted/20 p-2.5"
        >
          <p className="text-[10px] text-muted-foreground">Föreslaget svar</p>
          <p className="mt-1 text-xs">
            Hej Lisa! Vi har öppet lördag 11–16. Jag bokar gärna bord för 4 kl 18 — bekräfta gärna telefonnummer.
          </p>
        </m.div>
      </m.div>
    </div>
  );
}

function ReviewsScene() {
  return (
    <div className="space-y-3">
      <m.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="rounded-xl border border-border/70 bg-background/50 p-3"
      >
        <div className="flex items-center gap-2">
          <div className="flex">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                className={cn("h-3.5 w-3.5", i < 4 ? "fill-warning text-warning" : "text-muted-foreground/40")}
              />
            ))}
          </div>
          <span className="text-xs font-medium">Google Reviews · ny</span>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          "Fantastisk service och snabb respons på Instagram. Rekommenderas varmt!"
        </p>
        <p className="mt-1 text-[10px] text-muted-foreground">— Emma, för 23 min sedan</p>
      </m.div>
      <m.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45 }}
        className="rounded-xl border border-primary/25 bg-primary/5 p-3"
      >
        <div className="flex items-center gap-2 text-xs font-medium">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          AI-utkast till svar
        </div>
        <TypingText
          className="mt-2 text-xs leading-relaxed"
          text="Tack Emma! Vi uppskattar verkligen att du tog dig tid — kul att höra att Instagram-kanalen fungerar bra. Varmt välkommen tillbaka!"
          delay={0.7}
        />
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.2 }}
          className="mt-3 flex gap-2"
        >
          <span className="rounded-md bg-primary px-2.5 py-1 text-[10px] font-medium text-primary-foreground">
            Publicera
          </span>
          <span className="rounded-md border border-border px-2.5 py-1 text-[10px] text-muted-foreground">
            Redigera
          </span>
        </m.div>
      </m.div>
    </div>
  );
}

function SalesScene() {
  const columns = [
    { title: "Lead", items: ["Café Solsidan"] },
    { title: "Kontakt", items: ["Nordic Retail AB"] },
    { title: "Offert", items: [] },
    { title: "Vunnen", items: ["Studio Form"] },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium">Pipeline</p>
        <span className="text-[10px] text-muted-foreground">3 affärer · 142 000 kr</span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {columns.map((col, colIndex) => (
          <div key={col.title} className="space-y-2">
            <p className="text-[10px] font-medium text-muted-foreground">{col.title}</p>
            {col.items.map((item) => (
              <m.div
                key={item}
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-lg border border-border/60 bg-background/50 px-2 py-2 text-[10px] font-medium"
              >
                {item}
              </m.div>
            ))}
            {colIndex === 0 ? (
              <m.div
                layout
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.8 }}
                className="rounded-lg border border-primary/40 bg-primary/10 px-2 py-2 text-[10px] font-medium"
              >
                TechBolag HB
              </m.div>
            ) : null}
            {colIndex === 1 ? (
              <m.div
                layout
                initial={{ opacity: 0, x: -20, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                transition={{ delay: 1.4, type: "spring", stiffness: 260, damping: 22 }}
                className="rounded-lg border border-success/40 bg-success/10 px-2 py-2 text-[10px] font-medium"
              >
                TechBolag HB →
              </m.div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function IntelligenceScene() {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border/70 bg-background/50 p-3">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">MCP-fråga</p>
        <p className="mt-1.5 text-xs font-medium">
          Vilka leads i Stockholm har vi inte följt upp på 7 dagar?
        </p>
      </div>
      <m.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="flex flex-wrap gap-1.5"
      >
        {["Meta Ads", "Gmail", "Sales"].map((tool, i) => (
          <m.span
            key={tool}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5 + i * 0.12 }}
            className="rounded-full border border-border/70 bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground"
          >
            {tool}
          </m.span>
        ))}
        <m.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.95 }}
          className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] text-primary"
        >
          Smart verktygsval ✓
        </m.span>
      </m.div>
      <m.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.1 }}
        className="rounded-xl border border-primary/20 bg-card/80 p-3"
      >
        <div className="flex items-center gap-2 text-xs font-medium">
          <Bot className="h-3.5 w-3.5" />
          Resultat
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          4 leads matchar: <strong className="text-foreground">Nordic Retail AB</strong>,{" "}
          <strong className="text-foreground">Café Solsidan</strong> m.fl. Föreslagen åtgärd: skicka
          uppföljningsmail idag.
        </p>
      </m.div>
    </div>
  );
}

function SceneContent({ sceneId }: { sceneId: DemoSceneId }) {
  switch (sceneId) {
    case "home":
      return <HomeScene />;
    case "messages":
      return <MessagesScene />;
    case "reviews":
      return <ReviewsScene />;
    case "sales":
      return <SalesScene />;
    case "intelligence":
      return <IntelligenceScene />;
    default:
      return null;
  }
}

const SCENE_ICONS: Record<DemoSceneId, typeof MessageSquare> = {
  home: Zap,
  messages: MessageSquare,
  reviews: Star,
  sales: LineChart,
  intelligence: Bot,
};

function AnimatedCounter({ target, delay = 0 }: { target: number; delay?: number }) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    let frame = 0;
    const start = performance.now() + delay;
    const duration = 700;

    function tick(now: number) {
      if (now < start) {
        frame = requestAnimationFrame(tick);
        return;
      }
      const progress = Math.min((now - start) / duration, 1);
      setValue(Math.round(progress * target));
      if (progress < 1) frame = requestAnimationFrame(tick);
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, delay]);

  return <>{value}</>;
}

function TypingText({
  text,
  delay = 0,
  className,
}: {
  text: string;
  delay?: number;
  className?: string;
}) {
  const [visible, setVisible] = useState("");

  useEffect(() => {
    setVisible("");
    let index = 0;
    let interval: number | undefined;
    const timeout = window.setTimeout(() => {
      interval = window.setInterval(() => {
        index += 1;
        setVisible(text.slice(0, index));
        if (index >= text.length && interval) window.clearInterval(interval);
      }, 22);
    }, delay * 1000);

    return () => {
      window.clearTimeout(timeout);
      if (interval) window.clearInterval(interval);
    };
  }, [text, delay]);

  return (
    <p className={className}>
      {visible}
      <m.span
        animate={{ opacity: [1, 0] }}
        transition={{ duration: 0.5, repeat: Infinity }}
        className="inline-block w-0.5 h-3.5 ml-0.5 align-middle bg-primary"
      />
    </p>
  );
}

export function LandingProductDemo() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const activeScene = DEMO_SCENES[activeIndex]!;
  const activeNav = DEMO_SIDEBAR_ACTIVE[activeScene.id];

  useEffect(() => {
    if (paused) return;
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;

    setProgress(0);
    const started = performance.now();
    let frame = 0;

    function tick(now: number) {
      const elapsed = now - started;
      setProgress(Math.min(elapsed / SCENE_DURATION_MS, 1));
      if (elapsed >= SCENE_DURATION_MS) {
        setActiveIndex((current) => (current + 1) % DEMO_SCENES.length);
        return;
      }
      frame = requestAnimationFrame(tick);
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [activeIndex, paused]);

  function selectScene(index: number) {
    setActiveIndex(index);
    setPaused(true);
    setProgress(0);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {DEMO_SCENES.map((scene, index) => {
          const Icon = SCENE_ICONS[scene.id];
          const isActive = index === activeIndex;
          return (
            <button
              key={scene.id}
              type="button"
              onClick={() => selectScene(index)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
                isActive
                  ? "border-primary/40 bg-primary/10 text-foreground glow-sm"
                  : "border-border/60 bg-card/40 text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{scene.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          className="ml-auto inline-flex items-center gap-1 rounded-full border border-border/60 px-2.5 py-1.5 text-[11px] text-muted-foreground hover:text-foreground"
          aria-label={paused ? "Fortsätt demo" : "Pausa demo"}
        >
          {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
          {paused ? "Spela" : "Paus"}
        </button>
      </div>

      <div className="h-0.5 overflow-hidden rounded-full bg-muted/40">
        <m.div
          className="landing-demo-progress h-full rounded-full bg-primary/80"
          style={{ width: `${progress * 100}%` }}
          transition={{ duration: 0.1 }}
        />
      </div>

      <BrowserChrome activeNav={activeNav}>
        <AnimatePresence mode="wait">
          <m.div
            key={activeScene.id}
            initial={{ opacity: 0, y: 14, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -10, filter: "blur(4px)" }}
            transition={{ duration: 0.35, ease: "easeOut" }}
          >
            <SceneContent sceneId={activeScene.id} />
          </m.div>
        </AnimatePresence>
      </BrowserChrome>

      <p className="text-sm leading-relaxed text-muted-foreground">{activeScene.caption}</p>
    </div>
  );
}

export function LandingIntegrationsMarquee() {
  const items = [...LANDING_INTEGRATIONS, ...LANDING_INTEGRATIONS];

  return (
    <div className="relative overflow-hidden rounded-xl border border-border/50 bg-card/30 py-3.5">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-20 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-20 bg-gradient-to-l from-background to-transparent" />
      <div className="landing-marquee flex w-max items-center gap-6 px-4">
        {items.map((name, index) => (
          <span
            key={`${name}-${index}`}
            className="inline-flex items-center gap-6 whitespace-nowrap text-sm font-medium text-muted-foreground"
          >
            <span>{name}</span>
            <span className="h-1 w-1 rounded-full bg-border" aria-hidden />
          </span>
        ))}
      </div>
    </div>
  );
}
