import type { SVGProps } from "react";

const defaultSize = 20;

export function InstagramIcon(props: SVGProps<SVGSVGElement>) {
  const { width = defaultSize, height = defaultSize, ...rest } = props;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      width={width}
      height={height}
      {...rest}
    >
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
  );
}

export function TikTokIcon(props: SVGProps<SVGSVGElement>) {
  const { width = defaultSize, height = defaultSize, ...rest } = props;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      width={width}
      height={height}
      {...rest}
    >
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
    </svg>
  );
}

export function YoutubeIcon(props: SVGProps<SVGSVGElement>) {
  const { width = defaultSize, height = defaultSize, ...rest } = props;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      width={width}
      height={height}
      {...rest}
    >
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

export function XIcon(props: SVGProps<SVGSVGElement>) {
  const { width = defaultSize, height = defaultSize, ...rest } = props;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width={width} height={height} {...rest}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export function ShopifyIcon(props: SVGProps<SVGSVGElement>) {
  const { width = defaultSize, height = defaultSize, ...rest } = props;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width={width} height={height} {...rest}>
      <path d="M15.337 3.546l2.546 15.287L23.036 18l2.55-15.454L15.337 3.546zM13.238 0L0 3.069l2.5 15.232 13.238-3.069L13.238 0zm-2.2 14.66l-1.7-.39-.95-5.78 1.7.39.95 5.78zm5.06 1.17l-1.69-.39-.34-2.08 1.69.39.34 2.08zm.34-2.08l-1.69-.39-.95-5.78 1.69.39.95 5.78zM9.85 7.25l1.7.39.34 2.08-1.7-.39-.34-2.08z" />
    </svg>
  );
}

export function GmailIcon(props: SVGProps<SVGSVGElement>) {
  const { width = defaultSize, height = defaultSize, ...rest } = props;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width={width} height={height} {...rest}>
      <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z" />
    </svg>
  );
}

export function OutlookIcon(props: SVGProps<SVGSVGElement>) {
  const { width = defaultSize, height = defaultSize, ...rest } = props;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width={width} height={height} {...rest}>
      <path d="M7.88 12.04q0 .46-.16.87t-.51.69-.8.44-1.01.14H4.21V8.96h1.18q.56 0 1.01.14t.8.45.51.69.16.88zm-.63-2.35q-.29-.17-.68-.25t-.86-.08h-.29v2.57h.29q.45 0 .83-.08t.71-.25q.28-.18.42-.5t.14-.79q0-.37-.13-.65t-.41-.47zM24 12.78v6.44h-6.44v-2.14l4.31-1.59.03-.08-.04-.02q-.07-.05-.12-.07l-.09-.03-.12-.04-.16-.04h-.07l-.1-.02-.12-.02-.15-.01h-.03l-.12.01-.2.02-.21.03-.15.02-.17.04-.16.05-.13.05-.15.07-.13.07-.11.09-.13.11-.1.12-.09.13-.08.14-.06.15-.05.16-.04.17-.02.17-.02.19v.01l-.01.09v.05l.01.09v3.61H0V0h24v12.78zm-9.19-1.87l.01 1.21 2.63 1.52.05.03.05.01.05.02h.05l.05-.01.05-.02.05-.01 2.88-1.67v-5.4h-6.52v3.18zm-2.89 2.16l-.58-.34-.01-2.33v-2.35l.59-.34 2.95 1.7-.01.01-2.94 1.65zm9.28-.9l-2.88 1.67-.05.02-.05.01-.05.02-.05.01h-.05l-.05-.01-.05-.02-.05-.01-.05-.03-2.63-1.52v5.39h6.52v-3.17zm0-4.36v.95l-3.26 1.88-.01-1.88 3.27-1.95zm-6.53 2.6l.01 1.89-3.26-1.88v-.95l3.25 1.94z" />
    </svg>
  );
}

/** Tecknad lysande glödlampa – stroke-baserad, mjuk glow */
export function LightbulbGlowIcon(props: SVGProps<SVGSVGElement>) {
  const { width = defaultSize, height = defaultSize, className, ...rest } = props;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={width}
      height={height}
      className={className}
      {...rest}
    >
      <defs>
        <filter id="lightbulb-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {/* Glödande innandöme */}
      <ellipse
        cx="12"
        cy="10"
        rx="4"
        ry="5"
        fill="currentColor"
        opacity="0.4"
        filter="url(#lightbulb-glow)"
      />
      <ellipse cx="12" cy="10" rx="3" ry="4" fill="currentColor" opacity="0.6" />
      {/* Glödlampa kontur – tecknad/stroke-stil */}
      <path
        d="M12 3c-3.5 0-6 2.5-6 5.5 0 2 1 3.5 2.5 4.5L8 18h2l.5-3h3l.5 3h2l-.5-5c1.5-1 2.5-2.5 2.5-4.5C18 5.5 15.5 3 12 3z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Sockel */}
      <path
        d="M9 18h6l.5 2h-7z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
