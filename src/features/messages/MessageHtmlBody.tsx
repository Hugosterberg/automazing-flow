import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { buildEmailIframeDocument, prepareEmailHtmlForIframe } from "./messageBodyHtml";

type Props = {
  html: string;
};

/**
 * Renders HTML email in a sandboxed iframe so marketing templates display
 * correctly without injecting raw markup into the app DOM.
 *
 * Media (hero images, videos, embeds) is capped in the iframe stylesheet so
 * opening a template does not dominate the reading pane.
 */
export function MessageHtmlBody({ html }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(280);
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
          // Media is already capped in the stylesheet; keep a soft ceiling so a
          // broken layout cannot stretch the reading pane indefinitely.
          setHeight(Math.min(Math.max(nextHeight + 12, 160), 2400));
        }
      } catch {
        /* cross-origin should not happen with srcdoc */
      }
    };

    const onLoad = () => {
      resize();
      setLoaded(true);
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
    <div className="message-iframe-shell relative w-full max-w-full overflow-x-hidden overflow-y-auto rounded-lg border border-border/60 bg-white shadow-sm ring-1 ring-black/5">
      {!loaded ? (
        <div className="message-iframe-loading absolute inset-x-0 top-0 h-[min(40vh,280px)] rounded-lg sm:h-[280px]" aria-hidden />
      ) : null}
      <iframe
        ref={iframeRef}
        title="E-postinnehåll"
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        className={cn(
          "relative w-full min-w-0 max-w-full border-0 bg-white transition-opacity duration-200",
          loaded ? "opacity-100" : "opacity-0"
        )}
        style={{ height, width: "100%", maxHeight: 2400 }}
      />
    </div>
  );
}
