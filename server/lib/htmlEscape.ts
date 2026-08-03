/**
 * HTML escaping for the transactional emails this server composes.
 *
 * Every email builder used to carry its own copy — four identical, one missing
 * apostrophe escaping, and two places that only escaped `<`. Since all of them
 * interpolate tenant-supplied text (product titles, task names, review bodies)
 * into markup, the escaping rule belongs in one place.
 */
export function escapeHtml(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
