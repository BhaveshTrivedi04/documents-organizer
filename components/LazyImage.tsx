"use client";

import { useState } from "react";

type Props = {
  src: string;
  alt?: string;
  /** Shown if the image can't be loaded. */
  fallback?: React.ReactNode;
  /** Show "Loading…" text over the placeholder (for the big preview). */
  showLabel?: boolean;
};

/**
 * An image that only loads when scrolled into view, shows a shimmering
 * placeholder until it arrives, then fades in.
 */
export default function LazyImage({ src, alt = "", fallback = null, showLabel }: Props) {
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");

  if (state === "error") return <span className="img-fallback">{fallback}</span>;

  return (
    <span className={`lazy-img ${state}`}>
      {state === "loading" && <span className="shimmer">{showLabel && <span>Loading…</span>}</span>}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setState("loaded")}
        onError={() => setState("error")}
      />
    </span>
  );
}
