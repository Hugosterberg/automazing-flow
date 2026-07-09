import type { BusinessProfile } from "@/types/businessProfile";

export type ProfileFieldId =
  | "notes"
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
};

/** Ordered for display — most important first. */
export const PROFILE_FIELD_GUIDE: ProfileFieldGuide[] = [
  {
    id: "notes",
    label: "Beskrivning av verksamheten",
    placeholder:
      "T.ex. Vi säljer webb och SEO till lokala gym i Skåne. Våra kunder är oftast ägare med 1–3 platser som vill växa online.",
    why: "Det viktigaste fältet. AI läser detta för att förstå vad ni säljer, till vem och hur ni skiljer er.",
    powers: ["Lead-förslag i Sales", "Outreach- och svarsmallar", "Innehållsideer", "Sälj-playbook"],
    weight: 30,
    multiline: true,
  },
  {
    id: "company",
    label: "Företagsnamn (juridiskt eller varumärke)",
    placeholder: "T.ex. Acme Studio AB",
    why: "Används som avsändare i utkast och när AI beskriver er för prospects.",
    powers: ["Outreach", "Playbook", "Lead-förslag"],
    weight: 15,
  },
  {
    id: "location",
    label: "Marknad / plats",
    placeholder: "T.ex. Stockholm, Skåne eller Sverige",
    why: "AI begränsar förslag till rätt geografi och skriver mer relevant copy.",
    powers: ["Lead-förslag", "Brand discovery", "Kampanjer"],
    weight: 15,
  },
  {
    id: "website",
    label: "Webbplats",
    placeholder: "https://example.com",
    why: "Låter AI läsa er positioning och föreslå liknande prospects att kontakta.",
    powers: ["Lead-förslag", "Webb-enrichment", "Extern intelligens"],
    weight: 15,
  },
  {
    id: "email",
    label: "Kontakt-e-post",
    placeholder: "hej@foretag.se",
    why: "Signatur och avsändare i genererade mail — prospects ska kunna svara.",
    powers: ["Outreach-utkast", "Automatiska uppdateringar"],
    weight: 10,
  },
  {
    id: "phone",
    label: "Telefon",
    placeholder: "+46 70 123 45 67",
    why: "Kompletterar kontaktuppgifter i utkast och profilvisning.",
    powers: ["Outreach", "Företagsprofil"],
    weight: 5,
  },
  {
    id: "name",
    label: "Profilnamn i appen",
    placeholder: "T.ex. Mitt företag",
    why: "Visas i menyn och hjälper dig skilja flera bolag om du har flera profiler.",
    powers: ["Navigation", "Rapporter"],
    weight: 10,
  },
];

const TOTAL_WEIGHT = PROFILE_FIELD_GUIDE.reduce((sum, f) => sum + f.weight, 0);

function fieldValue(profile: BusinessProfile | null | undefined, id: ProfileFieldId): string {
  if (!profile) return "";
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
};

export function getBusinessProfileCompleteness(
  profile: BusinessProfile | null | undefined
): BusinessProfileCompleteness {
  let earned = 0;
  const missing: ProfileFieldGuide[] = [];
  const filled: ProfileFieldGuide[] = [];

  for (const field of PROFILE_FIELD_GUIDE) {
    if (isProfileFieldFilled(profile, field.id)) {
      earned += field.weight;
      filled.push(field);
    } else {
      missing.push(field);
    }
  }

  const percent = Math.round((earned / TOTAL_WEIGHT) * 100);
  return {
    percent,
    filledCount: filled.length,
    totalCount: PROFILE_FIELD_GUIDE.length,
    missing,
    filled,
    isStrong: percent >= 75 && isProfileFieldFilled(profile, "notes"),
  };
}

/** @deprecated Use getBusinessProfileCompleteness — kept for lead suggestions gate. */
export function leadSuggestionProfileReadiness(profile?: BusinessProfile | null): {
  score: number;
  missing: string[];
} {
  const c = getBusinessProfileCompleteness(profile);
  return {
    score: Math.min(4, Math.floor(c.percent / 25)),
    missing: c.missing.slice(0, 4).map((f) => f.label.toLowerCase()),
  };
}

export type BusinessProfileFormState = {
  name: string;
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
    company: form.company.trim() || undefined,
    website: form.website.trim() || undefined,
    email: form.email.trim() || undefined,
    phone: form.phone.trim() || undefined,
    location: form.location.trim() || undefined,
    notes: form.notes.trim() || undefined,
  };
}

export function isFormFieldFilled(form: BusinessProfileFormState, id: ProfileFieldId): boolean {
  return String(form[id] ?? "").trim().length > 0;
}

export function getFormCompleteness(form: BusinessProfileFormState): BusinessProfileCompleteness {
  let earned = 0;
  const missing: ProfileFieldGuide[] = [];
  const filled: ProfileFieldGuide[] = [];

  for (const field of PROFILE_FIELD_GUIDE) {
    if (isFormFieldFilled(form, field.id)) {
      earned += field.weight;
      filled.push(field);
    } else {
      missing.push(field);
    }
  }

  const percent = Math.round((earned / TOTAL_WEIGHT) * 100);
  return {
    percent,
    filledCount: filled.length,
    totalCount: PROFILE_FIELD_GUIDE.length,
    missing,
    filled,
    isStrong: percent >= 75 && isFormFieldFilled(form, "notes"),
  };
}
