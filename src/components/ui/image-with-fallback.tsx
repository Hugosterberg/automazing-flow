import { useEffect, useState, type ReactNode } from "react";

type ImageWithFallbackProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string | undefined | null;
  /** Rendered instead of the image when `src` is empty or the image fails to load. */
  fallback: ReactNode;
};

/**
 * `<img>` that swaps to a fallback node when the source is missing or fails to
 * load. Remote thumbnails (Google Drive, Shopify CDN, social platforms) can
 * start returning 403/404 after permissions change or content is deleted; this
 * keeps those spots showing a clean placeholder instead of a broken-image icon.
 */
export function ImageWithFallback({ src, fallback, alt = "", ...props }: ImageWithFallbackProps) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return <>{fallback}</>;
  }
  return <img src={src} alt={alt} loading="lazy" {...props} onError={() => setFailed(true)} />;
}
