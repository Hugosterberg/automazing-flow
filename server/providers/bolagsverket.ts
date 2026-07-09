/**
 * Bolagsverket "värdefulla datamängder" API — free Swedish company registry lookup.
 * Requires BOLAGSVERKET_CLIENT_ID + BOLAGSVERKET_CLIENT_SECRET (OAuth client credentials).
 */

import { formatOrgNumberDisplay, isValidOrgNumber, normalizeOrgNumber } from "../lib/orgNumber.ts";

export type BolagsverketCompany = {
  orgNumber: string;
  company: string;
  description?: string;
  address?: string;
  location?: string;
  companyForm?: string;
  legalForm?: string;
  industry?: string;
  sniCodes: Array<{ code: string; label: string }>;
  status: "active" | "inactive" | "deregistered" | "unknown";
  deregisteredAt?: string;
  source: "bolagsverket";
};

type Loose = Record<string, unknown>;

let cachedToken: { token: string; expiresAt: number } | null = null;

function asRecord(v: unknown): Loose | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Loose) : null;
}

function pickString(obj: Loose | null, keys: string[]): string | undefined {
  if (!obj) return undefined;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function pickKlartext(obj: Loose | null): string | undefined {
  return pickString(obj, ["klartext", "text", "beskrivning"]);
}

function pickKod(obj: Loose | null): string | undefined {
  return pickString(obj, ["kod", "code"]);
}

export function bolagsverketConfigured(): boolean {
  return Boolean(
    String(process.env.BOLAGSVERKET_CLIENT_ID || "").trim() &&
      String(process.env.BOLAGSVERKET_CLIENT_SECRET || "").trim()
  );
}

async function fetchAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const clientId = String(process.env.BOLAGSVERKET_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.BOLAGSVERKET_CLIENT_SECRET || "").trim();
  const tokenUrl =
    String(process.env.BOLAGSVERKET_TOKEN_URL || "").trim() ||
    "https://gw.api.bolagsverket.se/oauth2/token";
  const scope =
    String(process.env.BOLAGSVERKET_SCOPE || "").trim() ||
    "vardefulla-datamangder:read vardefulla-datamangder:ping";

  if (!clientId || !clientSecret) throw new Error("bolagsverket_not_configured");

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope,
  });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`bolagsverket_auth_${res.status}`);
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  const token = String(data.access_token || "").trim();
  if (!token) throw new Error("bolagsverket_auth_invalid");
  const expiresIn = Number(data.expires_in || 3600);
  cachedToken = { token, expiresAt: Date.now() + expiresIn * 1000 };
  return token;
}

function parseOrganisation(org: Loose, orgNumber: string): BolagsverketCompany {
  const namesBlock = asRecord(org.organisationsnamn);
  const nameList = Array.isArray(namesBlock?.organisationsnamn_lista)
    ? (namesBlock!.organisationsnamn_lista as unknown[])
    : [];
  let company = "";
  for (const item of nameList) {
    const row = asRecord(item);
    const namn = pickString(row, ["namn", "name"]);
    if (namn) {
      company = namn;
      break;
    }
  }

  const verksamhet = asRecord(org.verksamhetsbeskrivning);
  const description = pickString(verksamhet, ["beskrivning", "description"]);

  const postBlock = asRecord(org.postadress_organisation);
  const post = asRecord(postBlock?.postadress);
  const street = pickString(post, ["utdelningsadress", "adress"]);
  const postal = pickString(post, ["postnummer"]);
  const city = pickString(post, ["postort"]);
  const addressParts = [street, [postal, city].filter(Boolean).join(" ")].filter(Boolean);
  const address = addressParts.join(", ") || undefined;
  const location = city || undefined;

  const sniBlock = asRecord(org.naringsgren_organisation);
  const sniList = Array.isArray(sniBlock?.sni) ? (sniBlock!.sni as unknown[]) : [];
  const sniCodes = sniList
    .map((row) => {
      const o = asRecord(row);
      const code = pickKod(o) || pickString(o, ["kod"]);
      const label = pickKlartext(o) || pickString(o, ["klartext"]);
      if (!code && !label) return null;
      return { code: code || "", label: label || "" };
    })
    .filter(Boolean) as Array<{ code: string; label: string }>;

  const industry =
    sniCodes.map((s) => (s.code ? `${s.code} ${s.label}`.trim() : s.label)).filter(Boolean)[0] ||
    description;

  const companyForm = pickKlartext(asRecord(org.organisationsform));
  const legalForm = pickKlartext(asRecord(org.juridisk_form));

  const verksam = asRecord(org.verksam_organisation);
  const verksamKod = pickKod(verksam)?.toLowerCase();
  const avreg = asRecord(org.avregistrerad_organisation);
  const deregisteredAt = pickString(avreg, ["avregistreringsdatum", "datum"]);

  let status: BolagsverketCompany["status"] = "unknown";
  if (deregisteredAt) status = "deregistered";
  else if (verksamKod === "ja") status = "active";
  else if (verksamKod === "nej") status = "inactive";

  return {
    orgNumber: formatOrgNumberDisplay(orgNumber),
    company: company || `Org ${formatOrgNumberDisplay(orgNumber)}`,
    description,
    address,
    location,
    companyForm,
    legalForm,
    industry,
    sniCodes,
    status,
    deregisteredAt,
    source: "bolagsverket",
  };
}

export async function lookupBolagsverketCompany(rawOrgNumber: string): Promise<BolagsverketCompany> {
  const orgNumber = normalizeOrgNumber(rawOrgNumber);
  if (!isValidOrgNumber(orgNumber)) throw new Error("invalid_org_number");

  const baseUrl =
    String(process.env.BOLAGSVERKET_BASE_URL || "").trim() ||
    "https://gw.api.bolagsverket.se/vardefulla-datamangder/v1";

  const token = await fetchAccessToken();
  const res = await fetch(`${baseUrl}/organisationer`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ identitetsbeteckning: orgNumber }),
    signal: AbortSignal.timeout(20_000),
  });

  if (res.status === 404) throw new Error("org_not_found");
  if (!res.ok) throw new Error(`bolagsverket_${res.status}`);

  const data = (await res.json()) as Loose;
  const list = Array.isArray(data.organisationer) ? data.organisationer : [];
  const first = asRecord(list[0]);
  if (!first) throw new Error("org_not_found");
  return parseOrganisation(first, orgNumber);
}
