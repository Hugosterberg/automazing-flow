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

export function FacebookIcon(props: SVGProps<SVGSVGElement>) {
  const { width = defaultSize, height = defaultSize, ...rest } = props;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width={width} height={height} {...rest}>
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

export function GoogleBusinessIcon(props: SVGProps<SVGSVGElement>) {
  const { width = defaultSize, height = defaultSize, ...rest } = props;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width={width} height={height} {...rest}>
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
    </svg>
  );
}

export function WhatsAppIcon(props: SVGProps<SVGSVGElement>) {
  const { width = defaultSize, height = defaultSize, ...rest } = props;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width={width} height={height} {...rest}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
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

export function NotionIcon(props: SVGProps<SVGSVGElement>) {
  const { width = defaultSize, height = defaultSize, ...rest } = props;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width={width} height={height} {...rest}>
      <path d="M4.5 3.5h11.2l3.8 3.6v13.4H4.5V3.5zm9.8 1.8v3h3.1l-3.1-3zM6.3 5.3v13.4h11.4V9.9h-5.2V5.3H6.3zm2.2 10.6V8.1h1.6l3.3 5.1V8.1H15v7.8h-1.5l-3.4-5.2v5.2H8.5z" />
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

export function GoogleCalendarIcon(props: SVGProps<SVGSVGElement>) {
  const { width = defaultSize, height = defaultSize, ...rest } = props;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width={width} height={height} {...rest}>
      <path d="M19 3h-1V1h-2v2H8V1H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Zm0 16H5V9h14v10Zm0-12H5V5h14v2Zm-7 10a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm1-4h2v-2h-2V9h-2v2H9v2h2v2h2v-2Z" />
    </svg>
  );
}

export function GoogleDriveIcon(props: SVGProps<SVGSVGElement>) {
  const { width = defaultSize, height = defaultSize, ...rest } = props;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width={width} height={height} {...rest}>
      <path d="M8.63 3 3 12.75l2.2 3.81h5.63L16.46 7H10.8L8.63 3Zm7.2 0L10.2 12.75l2.17 3.81H18L23.63 7h-5.66L15.83 3ZM5.2 17.94 8 22.75h11.26l2.17-3.81H5.2Z" />
    </svg>
  );
}

export function CanvaIcon(props: SVGProps<SVGSVGElement>) {
  const { width = defaultSize, height = defaultSize, ...rest } = props;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width={width} height={height} {...rest}>
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4.8 12.8c-.5 1.4-1.8 2.3-3.6 2.3-3 0-5-2-5-5s2-5 5-5c1.8 0 3.1.8 3.7 2.2l-2.1 1c-.3-.7-.9-1.1-1.7-1.1-1.4 0-2.3 1.1-2.3 2.9s.9 2.9 2.4 2.9c.9 0 1.5-.4 1.8-1.2l1.8 1Z" />
    </svg>
  );
}

export function GoogleReviewsIcon(props: SVGProps<SVGSVGElement>) {
  const { width = defaultSize, height = defaultSize, ...rest } = props;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width={width} height={height} {...rest}>
      <path d="M12 2a10 10 0 1 0 7.07 17.07l-1.41-1.41A8 8 0 1 1 20 12h-8v2h5.93A6 6 0 0 1 6 12H4a8 8 0 0 0 15.87 1H22V2h-2v2.59A9.98 9.98 0 0 0 12 2Zm-.35 6.2.9 1.82 2.01.29-1.45 1.42.34 2-1.8-.95-1.8.95.34-2-1.45-1.42 2.01-.29.9-1.82Z" />
    </svg>
  );
}

export function TripadvisorIcon(props: SVGProps<SVGSVGElement>) {
  const { width = defaultSize, height = defaultSize, ...rest } = props;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width={width} height={height} {...rest}>
      <path d="M12 4c3.4 0 6.4 1.4 8.5 3.7H24v2.2h-1.7a4.6 4.6 0 0 1 .2 1.3 4.5 4.5 0 0 1-8.5 2.1h-4a4.5 4.5 0 1 1-.1-4.7h4.2A4.5 4.5 0 0 1 22.1 8H20c-1.8-1.8-4.3-2.8-7-2.8S7.8 6.2 6 8H3.9A10.3 10.3 0 0 1 12 4Zm-4 5.8a2.3 2.3 0 1 0 0 4.6 2.3 2.3 0 0 0 0-4.6Zm8 0a2.3 2.3 0 1 0 0 4.6 2.3 2.3 0 0 0 0-4.6Zm-8 1.1a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4Zm8 0a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4Z" />
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
