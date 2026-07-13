import { useMemo } from "react";
import { cn } from "@/lib/utils";

function splitByQuery(text: string, query: string): Array<{ text: string; match: boolean }> {
  const q = query.trim().toLowerCase();
  if (!q || !text) return [{ text, match: false }];

  const parts: Array<{ text: string; match: boolean }> = [];
  const lower = text.toLowerCase();
  let start = 0;

  while (start < text.length) {
    const idx = lower.indexOf(q, start);
    if (idx === -1) {
      parts.push({ text: text.slice(start), match: false });
      break;
    }
    if (idx > start) parts.push({ text: text.slice(start, idx), match: false });
    parts.push({ text: text.slice(idx, idx + q.length), match: true });
    start = idx + q.length;
  }

  return parts.length > 0 ? parts : [{ text, match: false }];
}

type SearchHighlightProps = {
  text: string;
  query: string;
  className?: string;
};

export function SearchHighlight({ text, query, className }: SearchHighlightProps) {
  const parts = useMemo(() => splitByQuery(text, query), [text, query]);

  if (!query.trim()) {
    return <span className={className}>{text}</span>;
  }

  return (
    <span className={className}>
      {parts.map((part, i) =>
        part.match ? (
          <mark key={i} className={cn("rounded-sm bg-primary/20 px-0.5 text-foreground")}>
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </span>
  );
}
