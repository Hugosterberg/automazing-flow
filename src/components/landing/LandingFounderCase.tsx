import { useTranslation } from "react-i18next";

/** Solo-founder reference strip — trust without inventing fake metrics. */
export function LandingFounderCase() {
  const { t } = useTranslation("landing");
  const beats = [
    { label: t("founder.b0Label"), detail: t("founder.b0Detail") },
    { label: t("founder.b1Label"), detail: t("founder.b1Detail") },
    { label: t("founder.b2Label"), detail: t("founder.b2Detail") },
  ];

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6 landing-premium-card">
      <p className="text-[11px] font-medium uppercase tracking-wide text-white/45">
        {t("founder.eyebrow")}
      </p>
      <h3 className="mt-1 font-display text-lg font-semibold tracking-tight">{t("founder.title")}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t("founder.body")}</p>
      <ul className="mt-4 grid gap-2 sm:grid-cols-3">
        {beats.map((beat) => (
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
