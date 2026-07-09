import type { BusinessProfile } from "@/types/businessProfile";

export type ProfileFieldId =
  | "notes"
  | "org_number"
  | "company"
  | "location"
  | "website"
  | "email"
  | "phone"
  | "name";

export type ProfileFieldGuide = {
  id: ProfileFieldId;
  label: string;
  placeholder: string;
  /** One sentence: why this field matters. */
  why: string;
  /** Where in the app this field is used. */
  powers: string[];
  weight: number;
  multiline?: boolean;
  /** Hidden from manual form — filled via auto-fill card. */
  autoFillOnly?: boolean;
};

export type ProfileFieldSection = {
  id: string;
  title: string;
  description: string;
  fields: ProfileFieldId[];
};

/** How the Företag page is organized for users. */
export const PROFILE_FIELD_SECTIONS: ProfileFieldSection[] = [
  {
    id: "core",
    title: "Vad ni gör",
    description: "Det här läser AI först — avgör kvaliteten på lead-förslag och utkast.",
    fields: ["notes"],
  },
  {
    id: "identity",
    title: "Bolaget",
    description: "Namn, plats och webb. Org.nr fyller du enklast i via uppslaget ovan.",
    fields: ["company", "location", "website"],
  },
  {
    id: "contact",
    title: "Kontakt",
    description: "Syns i genererade mail och signaturer.",
    fields: ["email", "phone"],
  },
  {
    id: "app",
    title: "I appen",
    description: "Bara för dig — påverkar inte AI:s förslag.",
    fields: ["name"],
  },
];

/** Ordered field metadata. */
export const PROFILE_FIELD_GUIDE: ProfileFieldGuide[] = [
  {
    id: "notes",
    label: "Beskrivning",
    placeholder:
      "T.ex. Vi säljer webb och SEO till lokala gym i Skåne. Våra kunder är oftast ägare med 1–3 platser som vill växa online.",
    why: "Förklara vad ni säljer, till vem och varför kunder väljer er.",
    powers: ["Lead-förslag", "Outreach", "Innehåll", "Playbook"],
    weight: 35,
    multiline: true,
  },
  {
    id: "org_number",
    label: "Organisationsnummer",
    placeholder: "556016-0680",
    why: "Hämtar namn, adress och bransch från Bolagsverket.",
    powers: ["Officiell bolagsdata"],
    weight: 5,
    autoFillOnly: true,
  },
  {
    id: "company",
    label: "Företagsnamn",
    placeholder: "T.ex. Acme Studio AB",
    why: "Hur ni presenteras i utkast och lead-förslag.",
    powers: ["Outreach", "Lead-förslag"],
    weight: 15,
  },
  {
    id: "location",
    label: "Marknad / plats",
    placeholder: "T.ex. Stockholm, Skåne eller Sverige",
    why: "AI begränsar förslag till rätt geografi.",
    powers: ["Lead-förslag", "Kampanjer"],
    weight: 15,
  },
  {
    id: "website",
    label: "Webbplats",
    placeholder: "https://example.com",
    why: "AI läser er positioning och hittar liknande prospects.",
    powers: ["Lead-förslag", "Webb-uppslag"],
    weight: 15,
  },
  {
    id: "email",
    label: "Kontakt-e-post",
    placeholder: "hej@foretag.se",
    why: "Avsändare i genererade mail.",
    powers: ["Outreach", "Automation"],
    weight: 10,
  },
  {
    id: "phone",
    label: "Telefon",
    placeholder: "+46 70 123 45 67",
    why: "Kompletterar kontaktuppgifter i utkast.",
    powers: ["Outreach"],
    weight: 5,
  },
  {
    id: "name",
    label: "Profilnamn",
    placeholder: "T.ex. Mitt företag",
    why: "Visas i menyn om du har flera profiler.",
    powers: ["Navigation"],
    weight: 5,
  },
];

const FIELD_BY_ID = Object.fromEntries(PROFILE_FIELD_GUIDE.map((f) => [f.id, f])) as Record<
  ProfileFieldId,
  ProfileFieldGuide
>;

export function getProfileField(id: ProfileFieldId): ProfileFieldGuide {
  return FIELD_BY_ID[id];
}

const TOTAL_WEIGHT = PROFILE_FIELD_GUIDE.reduce((sum, f) => sum + f.weight, 0);

function fieldValue(profile: BusinessProfile | null | undefined, id: ProfileFieldId): string {
  if (!profile) return "";
  if (id === "org_number") return String(profile.orgNumber ?? "").trim();
  return String(profile[id] ?? "").trim();
}

export function isProfileFieldFilled(profile: BusinessProfile | null | undefined, id: ProfileFieldId): boolean {
  return fieldValue(profile, id).length > 0;
}

export type BusinessProfileCompleteness = {
  percent: number;
  filledCount: number;
  totalCount: number;
  missing: ProfileFieldGuide[];
  filled: ProfileFieldGuide[];
  isStrong: boolean;
  /** Top gaps to fix first (notes always first if missing). */
  priorities: ProfileFieldGuide[];
};

function buildCompleteness(filled: ProfileFieldGuide[], missing: ProfileFieldGuide[], notesFilled: boolean) {
  const earned = filled.reduce((sum, f) => sum + f.weight, 0);
  const percent = Math.round((earned / TOTAL_WEIGHT) * 100);
  const sortedMissing = [...missing].sort((a, b) => {
    if (a.id === "notes") return -1;
    if (b.id === "notes") return 1;
    return b.weight - a.weight;
  });
  return {
    percent,
    filledCount: filled.length,
    totalCount: PROFILE_FIELD_GUIDE.length,
    missing,
    filled,
    isStrong: percent >= 75 && notesFilled,
    priorities: sortedMissing.slice(0, 3),
  };
}

export function getBusinessProfileCompleteness(
  profile: BusinessProfile | null | undefined
): BusinessProfileCompleteness {
  const filled: ProfileFieldGuide[] = [];
  const missing: ProfileFieldGuide[] = [];
  for (const field of PROFILE_FIELD_GUIDE) {
    (isProfileFieldFilled(profile, field.id) ? filled : missing).push(field);
  }
  return buildCompleteness(filled, missing, isProfileFieldFilled(profile, "notes"));
}

export function leadSuggestionProfileReadiness(profile?: BusinessProfile | null): {
  score: number;
  missing: string[];
} {
  const c = getBusinessProfileCompleteness(profile);
  return {
    score: Math.min(4, Math.floor(c.percent / 25)),
    missing: c.priorities.map((f) => f.label.toLowerCase()),
  };
}

export type BusinessProfileFormState = {
  name: string;
  orgNumber: string;
  company: string;
  website: string;
  email: string;
  phone: string;
  location: string;
  notes: string;
};

export function profileToFormState(profile: BusinessProfile | null | undefined): BusinessProfileFormState {
  return {
    name: profile?.name?.trim() || "",
    orgNumber: profile?.orgNumber?.trim() || "",
    company: profile?.company?.trim() || "",
    website: profile?.website?.trim() || "",
    email: profile?.email?.trim() || "",
    phone: profile?.phone?.trim() || "",
    location: profile?.location?.trim() || "",
    notes: profile?.notes?.trim() || "",
  };
}

export function formStateToProfileInput(form: BusinessProfileFormState) {
  return {
    name: form.name.trim() || "Min profil",
    orgNumber: form.orgNumber.trim() || undefined,
    company: form.company.trim() || undefined,
    website: form.website.trim() || undefined,
    email: form.email.trim() || undefined,
    phone: form.phone.trim() || undefined,
    location: form.location.trim() || undefined,
    notes: form.notes.trim() || undefined,
  };
}

export function formFieldKey(id: ProfileFieldId): keyof BusinessProfileFormState {
  return id === "org_number" ? "orgNumber" : id;
}

export function isFormFieldFilled(form: BusinessProfileFormState, id: ProfileFieldId): boolean {
  return String(form[formFieldKey(id)] ?? "").trim().length > 0;
}

export function getFormCompleteness(form: BusinessProfileFormState): BusinessProfileCompleteness {
  const filled: ProfileFieldGuide[] = [];
  const missing: ProfileFieldGuide[] = [];
  for (const field of PROFILE_FIELD_GUIDE) {
    (isFormFieldFilled(form, field.id) ? filled : missing).push(field);
  }
  return buildCompleteness(filled, missing, isFormFieldFilled(form, "notes"));
}

/** Fields shown in the manual edit form (excludes auto-fill-only). */
export function manualProfileFields(): ProfileFieldGuide[] {
  return PROFILE_FIELD_GUIDE.filter((f) => !f.autoFillOnly);
}
