import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { buildEmailIframeDocument, prepareEmailHtmlForIframe } from "./messageBodyHtml";

type Props = {
  html: string;
};

/** Soft ceiling for iframe intrinsic height — shell clamp handles the rest. */
const IFRAME_HEIGHT_CAP = 1600;

/**
 * Renders HTML email in a sandboxed iframe so marketing templates display
 * correctly without injecting raw markup into the app DOM.
 *
 * Media is capped in the iframe stylesheet; height is measured for the parent
 * CollapsibleMailBody clamp.
 */
export function MessageHtmlBody({ html }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(200);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    setLoaded(false);
    const prepared = prepareEmailHtmlForIframe(html);
    iframe.srcdoc = buildEmailIframeDocument(prepared);

    const resize = () => {
      try {
        const doc = iframe.contentDocument;
        const nextHeight = doc?.documentElement?.scrollHeight ?? doc?.body?.scrollHeight;
        if (nextHeight) {
          setHeight(Math.min(Math.max(nextHeight + 8, 120), IFRAME_HEIGHT_CAP));
        }
      } catch {
        /* cross-origin should not happen with srcdoc */
      }
    };

    const onLoad = () => {
      resize();
      setLoaded(true);
      // Remeasure after images/layout settle inside the iframe.
      try {
        const doc = iframe.contentDocument;
        doc?.querySelectorAll("img").forEach((img) => {
          if (!img.complete) img.addEventListener("load", resize, { once: true });
        });
      } catch {
        /* ignore */
      }
    };

    iframe.addEventListener("load", onLoad);
    const timer = window.setTimeout(resize, 120);
    const timer2 = window.setTimeout(resize, 600);

    return () => {
      iframe.removeEventListener("load", onLoad);
      window.clearTimeout(timer);
      window.clearTimeout(timer2);
    };
  }, [html]);

  return (
    <div className="message-iframe-shell relative w-full max-w-full overflow-x-hidden rounded-lg border border-border/60 bg-white shadow-sm ring-1 ring-black/5">
      {!loaded ? (
        <div className="message-iframe-loading absolute inset-x-0 top-0 h-[min(28vh,200px)] rounded-lg" aria-hidden />
      ) : null}
      <iframe
        ref={iframeRef}
        title="E-postinnehåll"
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        className={cn(
          "relative w-full min-w-0 max-w-full border-0 bg-white transition-opacity duration-200",
          loaded ? "opacity-100" : "opacity-0"
        )}
        style={{ height, width: "100%" }}
      />
    </div>
  );
}
