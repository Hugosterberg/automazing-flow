import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { buildEmailIframeDocument, prepareEmailHtmlForIframe } from "./messageBodyHtml";

type Props = {
  html: string;
};

/**
 * Renders HTML email in a sandboxed iframe so marketing templates display
 * correctly without injecting raw markup into the app DOM.
 */
export function MessageHtmlBody({ html }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(420);
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
          setHeight(Math.min(Math.max(nextHeight + 16, 200), 6000));
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
    <div className="message-iframe-shell relative w-full max-w-full overflow-x-auto rounded-lg border border-border/60 bg-white shadow-sm ring-1 ring-black/5">
      {!loaded ? (
        <div className="message-iframe-loading absolute inset-x-0 top-0 h-[min(50vh,420px)] rounded-lg sm:h-[420px]" aria-hidden />
      ) : null}
      <iframe
        ref={iframeRef}
        title="E-postinnehåll"
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        className={cn(
          "relative w-full min-w-0 border-0 bg-white transition-opacity duration-200",
          loaded ? "opacity-100" : "opacity-0"
        )}
        style={{ height, width: "100%" }}
      />
    </div>
  );
}
