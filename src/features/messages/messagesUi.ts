import type { ComponentType, SVGProps } from "react";
import {
  FacebookIcon,
  GmailIcon,
  InstagramIcon,
  OutlookIcon,
  WhatsAppIcon,
} from "@/components/platform-icons";
import type { InboxFilter, MessageChannelTab, UnifiedMessage } from "./types";
import { formatFullDateTime, formatSmartDate } from "@/lib/format";

export const MESSAGE_TABS: Array<{ value: MessageChannelTab; label: string; shortLabel: string }> = [
  { value: "mail", label: "Mail", shortLabel: "Mail" },
  { value: "instagram", label: "Instagram", shortLabel: "IG" },
  { value: "messenger", label: "Messenger", shortLabel: "FB" },
  { value: "whatsapp", label: "WhatsApp", shortLabel: "WA" },
];

const DM_CHANNEL_LABELS: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  facebook_messenger: "Messenger",
  messenger: "Messenger",
  twitter: "X",
  x: "X",
  bluesky: "Bluesky",
  reddit: "Reddit",
  telegram: "Telegram",
  whatsapp: "WhatsApp",
};

const AVATAR_GRADIENTS = [
  "from-blue-500/90 to-indigo-600/90",
  "from-violet-500/90 to-purple-600/90",
  "from-emerald-500/90 to-teal-600/90",
  "from-orange-500/90 to-amber-600/90",
  "from-pink-500/90 to-rose-600/90",
  "from-cyan-500/90 to-sky-600/90",
];

export function avatarGradient(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_GRADIENTS[Math.abs(h) % AVATAR_GRADIENTS.length]!;
}

export function senderInitial(name: string): string {
  return (name || "?").charAt(0).toUpperCase();
}

export const formatMessageDate = formatSmartDate;
export const formatFullMessageDate = formatFullDateTime;

/** Compact wait label for unanswered messages. */
export function formatWaitTime(raw: string): string | null {
  if (!raw) return null;
  const ms = Date.now() - Date.parse(raw);
  if (!Number.isFinite(ms) || ms < 0) return null;
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} tim`;
  const days = Math.floor(hours / 24);
  return `${days} d`;
}

export function isUrgentWait(raw: string): boolean {
  if (!raw) return false;
  const ms = Date.now() - Date.parse(raw);
  return Number.isFinite(ms) && ms >= 86400000;
}

export function channelBadge(msg: UnifiedMessage): string {
  if (msg.kind === "email") {
    return msg.channel === "gmail" ? "Gmail" : msg.channel === "outlook" ? "Outlook" : msg.channel;
  }
  const key = msg.channel.toLowerCase();
  return DM_CHANNEL_LABELS[key] || msg.channel || "DM";
}

type ChannelIcon = ComponentType<SVGProps<SVGSVGElement>>;

export function channelIconFor(msg: UnifiedMessage): ChannelIcon | null {
  const ch = msg.channel.toLowerCase();
  if (ch === "gmail") return GmailIcon;
  if (ch === "outlook") return OutlookIcon;
  if (ch === "instagram" || ch === "ig") return InstagramIcon;
  if (ch === "facebook" || ch === "messenger" || ch === "facebook_messenger") return FacebookIcon;
  if (ch === "whatsapp" || ch === "wa") return WhatsAppIcon;
  return null;
}

export function messageMatchesTab(msg: UnifiedMessage, tab: MessageChannelTab): boolean {
  const channel = msg.channel.toLowerCase();
  if (tab === "mail") return msg.kind === "email";
  if (tab === "instagram") return channel === "instagram" || channel === "ig";
  if (tab === "messenger") {
    return channel === "facebook" || channel === "messenger" || channel === "facebook_messenger";
  }
  return channel === "whatsapp" || channel === "wa";
}

export function emptyCopyForTab(tab: MessageChannelTab): { title: string; description: string; showConnect?: boolean } {
  if (tab === "mail") {
    return {
      title: "Ingen mail ännu",
      description: "Koppla Gmail eller Outlook under Kopplingar för att se e-post här.",
      showConnect: true,
    };
  }
  if (tab === "instagram") {
    return {
      title: "Inga Instagram-meddelanden",
      description: "DM:er visas här när Zernio Inbox är kopplad under Kopplingar.",
      showConnect: true,
    };
  }
  if (tab === "messenger") {
    return {
      title: "Inga Messenger-meddelanden",
      description: "Facebook Messenger visas här via Zernio Inbox — koppla under Kopplingar.",
      showConnect: true,
    };
  }
  return {
    title: "Inga WhatsApp-meddelanden",
    description: "WhatsApp visas här via Zernio Inbox — koppla under Kopplingar.",
    showConnect: true,
  };
}

/** Context-aware empty copy for filtered / searched inbox states. */
export function inboxEmptyCopy(opts: {
  tab: MessageChannelTab;
  filter: InboxFilter;
  search: string;
  hasMessagesInTab: boolean;
}): { title: string; description: string; showClearSearch?: boolean; showConnect?: boolean } {
  const query = opts.search.trim();
  if (query) {
    return {
      title: "Inga träffar",
      description: `Inget matchade «${query}». Prova färre ord eller rensa sökningen.`,
      showClearSearch: true,
    };
  }
  if (opts.filter === "open" && opts.hasMessagesInTab) {
    return {
      title: "Inget kvar att svara på",
      description: "Alla meddelanden i denna kanal är hanterade. Bra jobbat!",
    };
  }
  if (opts.filter === "handled") {
    return {
      title: "Ingen historik än",
      description: "Meddelanden du markerar som hanterade hamnar här.",
    };
  }
  if (opts.filter === "queue" && opts.hasMessagesInTab) {
    return {
      title: "Kön är tom",
      description: "Inget behöver svar just nu. Byt till Alla för att se hela inkorgen.",
    };
  }
  return emptyCopyForTab(opts.tab);
}

export function providerMessageIdFor(msg: UnifiedMessage): string {
  // Never fall back to the composite unified id (email:gmail:…) — providers reject it.
  return msg.providerMessageId || "";
}
