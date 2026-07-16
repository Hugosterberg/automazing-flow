import { LANDING_FOUNDER_CASE } from "@/lib/landingContent";

/** Solo-founder reference strip — trust without inventing fake metrics. */
export function LandingFounderCase() {
  const c = LANDING_FOUNDER_CASE;
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6 landing-premium-card">
      <p className="text-[11px] font-medium uppercase tracking-wide text-white/45">{c.eyebrow}</p>
      <h3 className="mt-1 font-display text-lg font-semibold tracking-tight">{c.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{c.body}</p>
      <ul className="mt-4 grid gap-2 sm:grid-cols-3">
        {c.beats.map((beat) => (
          <li
            key={beat.label}
            className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5"
          >
            <p className="text-xs font-medium text-foreground">{beat.label}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground leading-snug">{beat.detail}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
