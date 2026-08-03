/**
 * Low-stock alert automation — emails a digest when Shopify products go low
 * or out of stock, with a reorder link when the product was originally
 * imported from Alibaba/1688 (matched against the local `products` catalogue
 * by name).
 *
 * Re-alerts are throttled: a product already alerted only triggers a new
 * email if its stock got worse or it's been a week since the last alert —
 * otherwise the daily sweep would nag about the same steady low-stock state
 * every run. Products that get restocked drop out of the dedup map, so a
 * later dip re-alerts fresh.
 */

import { fetchShopifyLowStockItems, type ShopifyLowStockItem } from "../providers/shopify.ts";
import { loadProfileDocument, saveProfileDocument } from "./profileDocumentStore.ts";
import { sendEmail } from "./email.ts";
import { escapeHtml } from "./htmlEscape.ts";
import type { SupabaseAdminLike } from "./supabaseAdminLike.ts";

const LOW_STOCK_ALERTED_DOC_KEY = "low-stock-alerted";
const REALERT_AFTER_DAYS = 7;
const MAX_ITEMS_IN_EMAIL = 20;

export interface AlertedState {
  quantity: number;
  alertedAt: string;
}

export function parseAlertedMap(data: unknown): Record<string, AlertedState> {
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  const raw = data as Record<string, unknown>;
  const out: Record<string, AlertedState> = {};
  for (const [id, value] of Object.entries(raw)) {
    if (!value || typeof value !== "object") continue;
    const v = value as Record<string, unknown>;
    const quantity = Number(v.quantity);
    const alertedAt = String(v.alertedAt || "");
    if (Number.isFinite(quantity) && alertedAt) out[id] = { quantity, alertedAt };
  }
  return out;
}

/** Product name -> Alibaba/1688 source URL, for local catalogue rows carrying one. */
async function loadReorderUrlMap(
  supabaseAdmin: SupabaseAdminLike,
  businessProfileId: string
): Promise<Map<string, string>> {
  const { data } = await supabaseAdmin
    .from("products")
    .select("name,source_url")
    .eq("business_profile_id", businessProfileId)
    .not("source_url", "is", null);
  const map = new Map<string, string>();
  for (const raw of (Array.isArray(data) ? data : []) as Array<Record<string, unknown>>) {
    const url = String(raw.source_url || "").trim();
    if (!url || !/alibaba\.com|1688\.com/i.test(url)) continue;
    const name = String(raw.name || "").trim().toLowerCase();
    if (name) map.set(name, url);
  }
  return map;
}

export function pickItemsToAlert(items: ShopifyLowStockItem[], alerted: Record<string, AlertedState>): ShopifyLowStockItem[] {
  const now = Date.now();
  return items.filter((item) => {
    const prior = alerted[item.productId];
    if (!prior) return true;
    if (item.quantity < prior.quantity) return true;
    const daysSince = (now - Date.parse(prior.alertedAt)) / 86400000;
    // An unparseable stored timestamp must not silence the product forever —
    // fail open and re-alert instead.
    if (!Number.isFinite(daysSince)) return true;
    return daysSince >= REALERT_AFTER_DAYS;
  });
}

export async function runLowStockAlert(deps: {
  supabaseAdmin: SupabaseAdminLike;
  businessProfileId: string;
  businessName: string;
  accessToken: string;
  shop: string;
  notifyEmail?: string;
  appUrl?: string;
}): Promise<{ alerted: number; notified: boolean }> {
  const { supabaseAdmin, businessProfileId, businessName, accessToken, shop, notifyEmail, appUrl } = deps;

  const items = await fetchShopifyLowStockItems(accessToken, shop);
  if (items.length === 0) return { alerted: 0, notified: false };

  const doc = await loadProfileDocument(supabaseAdmin, businessProfileId, LOW_STOCK_ALERTED_DOC_KEY);
  const alerted = parseAlertedMap(doc?.data);
  const toAlert = pickItemsToAlert(items, alerted);

  // Restocked products drop out of the dedup map regardless of what happens
  // below, so a later dip alerts fresh.
  const currentIds = new Set(items.map((i) => i.productId));
  const nextAlerted: Record<string, AlertedState> = {};
  for (const [id, state] of Object.entries(alerted)) {
    if (currentIds.has(id)) nextAlerted[id] = state;
  }

  async function persist() {
    await saveProfileDocument(supabaseAdmin, businessProfileId, LOW_STOCK_ALERTED_DOC_KEY, nextAlerted);
  }

  if (toAlert.length === 0) {
    await persist();
    return { alerted: 0, notified: false };
  }

  let notified = false;
  if (notifyEmail) {
    const reorderMap = await loadReorderUrlMap(supabaseAdmin, businessProfileId);
    const ecommerceUrl = appUrl ? `${appUrl.replace(/\/$/, "")}/ecommerce` : "/ecommerce";
    const shown = toAlert.slice(0, MAX_ITEMS_IN_EMAIL);
    const rows = shown.map((item) => {
      const reorderUrl = reorderMap.get(item.productTitle.trim().toLowerCase());
      const statusLabel = item.status === "out_of_stock" ? "slut" : `${item.quantity} kvar`;
      const text = `${item.productTitle} — ${statusLabel}${reorderUrl ? ` (återbeställ: ${reorderUrl})` : ""}`;
      // The reorder link is clickable in the HTML part; the plaintext part
      // keeps the bare URL so it survives text-only clients.
      const html =
        `${escapeHtml(item.productTitle)} — ${escapeHtml(statusLabel)}` +
        (reorderUrl ? ` — <a href="${escapeHtml(reorderUrl)}">återbeställ</a>` : "");
      return { text, html };
    });
    const count = toAlert.length;
    const more = count > shown.length ? count - shown.length : 0;
    const result = await sendEmail({
      to: notifyEmail,
      subject: `${businessName}: ${count} produkt${count === 1 ? "" : "er"} med lågt lager`,
      html:
        `<p>${count} produkt${count === 1 ? "" : "er"} behöver påfyllning:</p>` +
        `<ul>${rows.map((r) => `<li>${r.html}</li>`).join("")}</ul>` +
        (more > 0 ? `<p>…och ${more} till.</p>` : "") +
        `<p><a href="${escapeHtml(ecommerceUrl)}">Öppna produkter</a></p>`,
      text:
        `${count} produkt(er) med lågt lager:\n${rows.map((r) => `• ${r.text}`).join("\n")}` +
        (more > 0 ? `\n…och ${more} till.` : "") +
        `\n\nÖppna: ${ecommerceUrl}`,
    });
    notified = result.ok;
  }

  // Only suppress future alerts for products the user was actually told about.
  // Recording them before the send meant a failed email silenced the product
  // for a week while its stock stayed low.
  if (notified) {
    const alertedAt = new Date().toISOString();
    for (const item of toAlert) {
      nextAlerted[item.productId] = { quantity: item.quantity, alertedAt };
    }
  }
  await persist();

  return { alerted: notified ? toAlert.length : 0, notified };
}
