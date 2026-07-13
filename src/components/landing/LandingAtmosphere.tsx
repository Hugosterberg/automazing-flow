/**
 * Ambient kinetic background for the pre-login landing page.
 * Black/white mechanical motifs — gears, bolts, speed lines —
 * kept subtle so copy stays readable.
 */
export function LandingAtmosphere() {
  return (
    <div className="landing-atmosphere pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="landing-atmosphere-glow" />
      <div className="landing-speed-field" />
      <div className="landing-scanline" />

      <svg
        className="landing-gear landing-gear-a absolute -left-[8%] top-[12%] h-[42vmin] w-[42vmin] opacity-[0.09] sm:opacity-[0.12]"
        viewBox="0 0 200 200"
        fill="none"
      >
        <circle cx="100" cy="100" r="28" stroke="currentColor" strokeWidth="3" />
        <circle cx="100" cy="100" r="14" stroke="currentColor" strokeWidth="2" />
        <path
          d="M100 18 L112 42 L140 34 L138 64 L166 78 L144 98 L166 122 L138 136 L140 166 L112 158 L100 182 L88 158 L60 166 L62 136 L34 122 L56 98 L34 78 L62 64 L60 34 L88 42 Z"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <circle cx="100" cy="100" r="6" fill="currentColor" opacity="0.7" />
      </svg>

      <svg
        className="landing-gear landing-gear-b absolute -right-[6%] top-[38%] h-[34vmin] w-[34vmin] opacity-[0.07] sm:opacity-[0.1]"
        viewBox="0 0 200 200"
        fill="none"
      >
        <circle cx="100" cy="100" r="22" stroke="currentColor" strokeWidth="2.5" />
        <path
          d="M100 30 L109 48 L130 42 L128 64 L150 74 L134 90 L150 110 L128 120 L130 142 L109 136 L100 154 L91 136 L70 142 L72 120 L50 110 L66 90 L50 74 L72 64 L70 42 L91 48 Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>

      <svg
        className="landing-gear landing-gear-c absolute bottom-[8%] left-[28%] h-[22vmin] w-[22vmin] opacity-[0.06] sm:opacity-[0.09]"
        viewBox="0 0 200 200"
        fill="none"
      >
        <path
          d="M100 24 L108 44 L130 38 L126 60 L148 72 L130 90 L148 114 L126 122 L130 146 L108 140 L100 160 L92 140 L70 146 L74 122 L52 114 L70 90 L52 72 L74 60 L70 38 L92 44 Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <circle cx="100" cy="100" r="16" stroke="currentColor" strokeWidth="2" />
      </svg>

      <svg
        className="landing-bolt landing-bolt-a absolute right-[18%] top-[18%] h-16 w-10 opacity-[0.14] sm:h-20 sm:w-12 sm:opacity-[0.18]"
        viewBox="0 0 40 64"
        fill="currentColor"
      >
        <path d="M24 0 L6 34 H18 L12 64 L36 26 H22 L24 0 Z" />
      </svg>

      <svg
        className="landing-bolt landing-bolt-b absolute left-[12%] top-[58%] h-12 w-8 opacity-[0.1] sm:opacity-[0.14]"
        viewBox="0 0 40 64"
        fill="currentColor"
      >
        <path d="M24 0 L6 34 H18 L12 64 L36 26 H22 L24 0 Z" />
      </svg>

      <svg
        className="landing-bolt landing-bolt-c absolute right-[32%] bottom-[22%] h-10 w-6 opacity-[0.08] sm:opacity-[0.12]"
        viewBox="0 0 40 64"
        fill="currentColor"
      >
        <path d="M24 0 L6 34 H18 L12 64 L36 26 H22 L24 0 Z" />
      </svg>

      {/* Horizontal kinetic streaks */}
      <div className="landing-streak landing-streak-1" />
      <div className="landing-streak landing-streak-2" />
      <div className="landing-streak landing-streak-3" />

      <div className="landing-noise opacity-50" />
      <div className="landing-vignette" />
    </div>
  );
}
