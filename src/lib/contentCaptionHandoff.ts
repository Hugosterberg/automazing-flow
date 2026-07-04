export const CONTENT_CAPTION_HANDOFF_KEY = "automazing-content-caption";

export function stashContentCaption(text: string) {
  sessionStorage.setItem(CONTENT_CAPTION_HANDOFF_KEY, text);
}

export function consumeContentCaption(): string | null {
  const value = sessionStorage.getItem(CONTENT_CAPTION_HANDOFF_KEY);
  if (value) sessionStorage.removeItem(CONTENT_CAPTION_HANDOFF_KEY);
  return value;
}
