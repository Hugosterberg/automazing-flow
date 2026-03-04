import { motion } from "framer-motion";
import {
  Users,
  FileText,
  Sparkles,
  Clock,
  Heart,
  Eye,
  ImagePlus,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useRef, useState, useEffect, useCallback } from "react";
import { useAccounts } from "@/context/AccountsContext";
import { useOAuthCallback } from "@/hooks/useOAuthCallback";
import { InstagramIcon, TikTokIcon, YoutubeIcon } from "@/components/platform-icons";
import type { SocialPlatform } from "@/types/accounts";

const platformIcons: Record<SocialPlatform, typeof InstagramIcon> = {
  instagram: InstagramIcon,
  tiktok: TikTokIcon,
  youtube: YoutubeIcon,
};


const defaultStats = [
  { label: "Följare", value: "–", change: "", icon: Users, key: "followers" },
  { label: "Följer", value: "–", change: "", icon: Users, key: "following" },
  { label: "Antal inlägg", value: "–", change: "", icon: FileText, key: "media" },
  { label: "Engagement", value: "8.4%", change: "+1.1%", icon: Heart, key: "engagement" },
];

const scheduledPosts = [
  { title: "Produktlansering – Instagram", time: "Idag 14:00", platform: "Instagram" },
  { title: "Tips & tricks video", time: "Imorgon 09:00", platform: "TikTok" },
  { title: "Veckosammanfattning", time: "Fre 18:00", platform: "LinkedIn" },
];

const contentIdeas = [
  "Bakom kulisserna – visa er arbetsprocess",
  "Kundrecension i karusellformat",
  "5 tips inom er bransch (Reels)",
  "Före/efter transformation",
  "Frågestund med era följare",
];

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

// AI-analys via server (OpenAI eller smart fallback)
async function runAIAnalysis(
  accountId: string,
  posts: { caption: string }[],
  profile: { displayName?: string; username?: string; followersCount?: number }
): Promise<{ about: string; writes: string; perception: string }> {
  const captions = posts.map((p) => p.caption).filter(Boolean);
  const res = await fetch(`/api/accounts/${accountId}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      captions,
      displayName: profile.displayName ?? "",
      username: profile.username ?? "",
      followersCount: profile.followersCount,
    }),
  });
  if (!res.ok) throw new Error("Analysfel");
  return res.json();
}

// Simulerad bildvariant-generering
async function generateImageVariants(): Promise<string[]> {
  await new Promise((r) => setTimeout(r, 2500));
  return [
    "https://picsum.photos/seed/v1/400/400",
    "https://picsum.photos/seed/v2/400/400",
    "https://picsum.photos/seed/v3/400/400",
    "https://picsum.photos/seed/v4/400/400",
  ];
}

export default function SocialMedia() {
  const [postContent, setPostContent] = useState("");
  const { accounts, addAccountFromOAuth, selectedAccountId, setSelectedAccountId, updateAccountAnalysis, updateAccountStats } =
    useAccounts();
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<{ about: string; writes: string; perception: string } | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsRefreshKey, setStatsRefreshKey] = useState(0);
  const [recentPosts, setRecentPosts] = useState<{
    id: string; caption: string; picture: string; permalink: string;
    mediaType: string; likeCount: number; commentCount: number; createdTime: string;
  }[]>([]);

  // Ref för att accessa accounts utan att ha det som useEffect-dependency
  // (undviker oändlig loop: updateAccountStats → accounts ändras → effect körs → updateAccountStats → ...)
  const accountsRef = useRef(accounts);
  accountsRef.current = accounts;

  const fetchStats = useCallback((accountId: string) => {
    const account = accountsRef.current.find((a) => a.id === accountId);
    if (!account?.isOAuth) return;
    setStatsLoading(true);
    fetch(`/api/accounts/${accountId}/data`)
      .then((res) => {
        if (!res.ok) {
          console.warn(`[stats] /api/accounts/${accountId}/data svarade ${res.status}`);
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (!data) return;
        const stats = data.stats ?? data.profile?.stats;
        const profile = data.profile || {};
        const mediaCount =
          stats?.mediaCount ??
          (profile.media_count != null ? Number(profile.media_count) : undefined);
        const followersCount = stats?.followersCount ?? (profile.followers_count != null ? Number(profile.followers_count) : undefined);
        const followingCount = stats?.followingCount ?? (profile.follows_count != null ? Number(profile.follows_count) : undefined);
        const accountType = stats?.accountType ?? (profile.account_type as string | undefined);
        const hasAny = followersCount != null || followingCount != null || mediaCount != null;
        if (hasAny) {
          updateAccountStats(accountId, {
            followersCount,
            followingCount,
            mediaCount,
            accountType,
            totalLikes: stats?.totalLikes,
            totalComments: stats?.totalComments,
            avgLikes: stats?.avgLikes,
            avgComments: stats?.avgComments,
            engagementRate: stats?.engagementRate,
            updatedAt: stats?.updatedAt ?? new Date().toISOString(),
          });
        }
        // Spara senaste inlägg och starta AI-analys automatiskt
        if (Array.isArray(data.media) && data.media.length > 0) {
          setRecentPosts(data.media);
          // Auto-trigga AI-analys med de faktiska inläggstexterna
          const account = accountsRef.current.find((a) => a.id === accountId);
          const alreadyAnalyzed = account?.analysis?.about;
          if (!alreadyAnalyzed) {
            setAnalyzing(true);
            runAIAnalysis(
              accountId,
              data.media.map((p: { caption: string }) => ({ caption: p.caption })),
              {
                displayName: data.profile?.displayName as string | undefined,
                username: data.profile?.username as string | undefined,
                followersCount: data.stats?.followersCount,
              }
            )
              .then((result) => {
                setAnalysisResult(result);
                updateAccountAnalysis(accountId, { ...result, analyzedAt: new Date().toISOString() });
              })
              .catch(() => {})
              .finally(() => setAnalyzing(false));
          } else {
            setAnalysisResult({
              about: account.analysis.about ?? "",
              writes: account.analysis.writes ?? "",
              perception: account.analysis.perception ?? "",
            });
          }
        }
      })
      .catch(() => {})
      .finally(() => setStatsLoading(false));
  }, [updateAccountAnalysis, updateAccountStats]);

  // Kör bara när valt konto eller manuell refresh ändras – INTE när accounts ändras
  useEffect(() => {
    if (!selectedAccountId) return;
    fetchStats(selectedAccountId);
  }, [selectedAccountId, statsRefreshKey, fetchStats]);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [variants, setVariants] = useState<string[]>([]);
  const [generatingVariants, setGeneratingVariants] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);

  const { oauthError, clearOauthError } = useOAuthCallback();

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setUploadedImage(url);
      setVariants([]);
    }
    e.target.value = "";
  }

  async function handleGenerateVariants() {
    if (!uploadedImage) return;
    setGeneratingVariants(true);
    setVariants([]);
    try {
      const urls = await generateImageVariants();
      setVariants(urls);
    } finally {
      setGeneratingVariants(false);
    }
  }

  return (
    <div className="space-y-8 max-w-6xl">
      <motion.div {...fadeUp} transition={{ duration: 0.4 }}>
        <h1 className="text-3xl font-bold tracking-tight">Social Media</h1>
        <p className="text-muted-foreground mt-1">Automatisera och hantera dina sociala medier</p>
      </motion.div>

      {/* OAuth-fel */}
      {oauthError && (
        <motion.div {...fadeUp} transition={{ duration: 0.3 }}>
          <Card className="bg-destructive/10 border-destructive/30">
            <CardContent className="py-4 flex items-center justify-between">
              <p className="text-sm text-destructive">
                {oauthError === "instagram_not_configured"
                  ? "Instagram är inte konfigurerad. Lägg till LATE_API_KEY i .env (API-nyckel från getlate.dev) för inloggning via Late API."
                  : oauthError === "late_profile_failed"
                    ? "Late kunde inte skapa eller hämta en profil. Kontrollera din API-nyckel på getlate.dev. Om du redan har en profil kan du sätta LATE_PROFILE_ID i .env."
                    : `Inloggningen misslyckades: ${oauthError.replace(/_/g, " ")}`}
              </p>
              <Button variant="ghost" size="sm" onClick={clearOauthError}>
                Stäng
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Välj konto */}
      {!selectedAccount && (
        <motion.div {...fadeUp} transition={{ duration: 0.4, delay: 0.1 }}>
          <Card className="bg-card border-border glow-border border-dashed">
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground mb-2">
                Välj ett konto i sidofältet (Anslutna konton) för att börja.
              </p>
              <p className="text-sm text-muted-foreground/80">
                Anslut Instagram, TikTok eller YouTube via +-knappen i sidofältet.
              </p>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* AI Analys */}
      {selectedAccount && (
        <motion.div {...fadeUp} transition={{ duration: 0.4, delay: 0.1 }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {(() => { const Icon = platformIcons[selectedAccount.platform]; return <Icon className="h-4 w-4 text-muted-foreground" />; })()}
              <span className="text-sm font-medium text-muted-foreground">@{selectedAccount.username}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60">
              <Sparkles className="h-3.5 w-3.5" />
              AI Analys
            </div>
          </div>
          <Card className="bg-card border-border">
            <CardContent className="py-5 px-6">
              {analyzing ? (
                <div className="flex items-center gap-3 text-muted-foreground text-sm py-2">
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  <span>Analyserar kontots innehåll…</span>
                </div>
              ) : analysisResult ? (
                <div className="space-y-5">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Handlar om</p>
                    <p className="text-sm leading-relaxed">{analysisResult.about}</p>
                  </div>
                  <div className="w-full h-px bg-border" />
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Skriver om</p>
                    <p className="text-sm leading-relaxed">{analysisResult.writes}</p>
                  </div>
                  <div className="w-full h-px bg-border" />
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Uppfattning utifrån</p>
                    <p className="text-sm leading-relaxed">{analysisResult.perception}</p>
                  </div>
                </div>
              ) : statsLoading ? (
                <div className="flex items-center gap-3 text-muted-foreground text-sm py-2">
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  <span>Hämtar inlägg…</span>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-2">Ingen data tillgänglig ännu.</p>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Bild till varianter */}
      <motion.div {...fadeUp} transition={{ duration: 0.4, delay: 0.15 }}>
        <Card className="bg-card border-border glow-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ImagePlus className="h-5 w-5" />
              AI-bildvarianter
            </CardTitle>
            <CardDescription>
              Ladda upp en bild så genererar AI olika varianter och förslag
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />
            <div className="flex flex-wrap gap-4 items-start">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="w-32 h-32 rounded-lg border-2 border-dashed border-border hover:border-muted-foreground/50 hover:bg-secondary/50 cursor-pointer flex items-center justify-center transition-colors"
              >
                {uploadedImage ? (
                  <img
                    src={uploadedImage}
                    alt="Uploaded"
                    className="w-full h-full object-cover rounded-lg"
                  />
                ) : (
                  <ImagePlus className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 space-y-2">
                <Button
                  onClick={handleGenerateVariants}
                  disabled={!uploadedImage || generatingVariants}
                  variant="outline"
                >
                  {generatingVariants ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-2" />
                  )}
                  {generatingVariants ? "Genererar varianter..." : "Generera AI-varianter"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Klicka på rutan för att ladda upp, sedan generera.
                </p>
              </div>
            </div>
            {variants.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Förslag på varianter</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {variants.map((url, i) => (
                    <div
                      key={i}
                      className="aspect-square rounded-lg overflow-hidden border border-border hover:glow-sm transition-shadow"
                    >
                      <img src={url} alt={`Variant ${i + 1}`} className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Stats – använder hämtad statistik för valt konto om tillgänglig */}
      {selectedAccount?.isOAuth && (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={statsLoading}
            onClick={() => setStatsRefreshKey((k) => k + 1)}
            className="text-muted-foreground"
          >
            {statsLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                Hämtar...
              </>
            ) : (
              "Uppdatera statistik"
            )}
          </Button>
          <span className="text-xs text-muted-foreground">
            Visar data för {selectedAccount.username}
          </span>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {(selectedAccount?.stats
          ? (() => {
              const s = selectedAccount.stats;
              // Kort 2: Snitt-likes (prioriterat), annars followingCount, annars "–"
              const avgLikesStat =
                s.avgLikes != null
                  ? { key: "avg-likes", label: "Snitt-likes", value: String(s.avgLikes), change: "", icon: Heart }
                  : s.followingCount != null
                    ? { ...defaultStats[1], value: s.followingCount.toLocaleString("sv-SE") }
                    : { ...defaultStats[1], value: "–" };

              // Kort 4: Verklig engagement rate om tillgänglig, annars hårdkodad
              const engagementStat =
                s.engagementRate != null
                  ? { ...defaultStats[3], value: s.engagementRate.toFixed(1) + "%", change: "" }
                  : defaultStats[3];

              return [
                {
                  ...defaultStats[0],
                  value: s.followersCount != null ? s.followersCount.toLocaleString("sv-SE") : "–",
                },
                avgLikesStat,
                {
                  ...defaultStats[2],
                  value: s.mediaCount != null ? s.mediaCount.toLocaleString("sv-SE") : "–",
                },
                engagementStat,
              ];
            })()
          : defaultStats
        ).map((stat, i) => (
          <motion.div key={stat.key} {...fadeUp} transition={{ duration: 0.4, delay: i * 0.08 }}>
            <Card className="bg-card border-border glow-border hover:glow-sm transition-shadow duration-300">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <stat.icon className="h-5 w-5 text-muted-foreground" />
                  {statsLoading && selectedAccountId && i < 3 ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  ) : (
                    stat.change && <span className="text-xs text-green-400 font-medium">{stat.change}</span>
                  )}
                </div>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Senaste inlägg med likes och kommentarer */}
      {recentPosts.length > 0 && (
        <motion.div {...fadeUp} transition={{ duration: 0.4, delay: 0.25 }}>
          <Card className="bg-card border-border glow-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Eye className="h-5 w-5" />
                Senaste inlägg
              </CardTitle>
              <CardDescription>Likes och kommentarer per inlägg</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {recentPosts.map((post) => (
                  <a
                    key={post.id}
                    href={post.permalink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative aspect-square rounded-lg overflow-hidden border border-border hover:glow-sm transition-shadow"
                  >
                    <img
                      src={post.picture}
                      alt={post.caption.slice(0, 40)}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
                      <div className="flex items-center gap-1 text-white text-xs font-semibold">
                        <Heart className="h-3.5 w-3.5 fill-white" />
                        {post.likeCount}
                      </div>
                      <div className="flex items-center gap-1 text-white text-xs">
                        <FileText className="h-3.5 w-3.5" />
                        {post.commentCount}
                      </div>
                    </div>
                    {/* Alltid synliga badges */}
                    <div className="absolute bottom-1 left-1 flex gap-1">
                      <span className="bg-black/70 text-white text-[10px] px-1 py-0.5 rounded flex items-center gap-0.5">
                        <Heart className="h-2.5 w-2.5 fill-white" />{post.likeCount}
                      </span>
                    </div>
                  </a>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Scheduler */}
        <motion.div className="lg:col-span-2" {...fadeUp} transition={{ duration: 0.4, delay: 0.3 }}>
          <Card className="bg-card border-border glow-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Clock className="h-5 w-5" />
                Schemalägg inlägg
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="Skriv ditt inlägg här..."
                value={postContent}
                onChange={(e) => setPostContent(e.target.value)}
                className="bg-secondary border-border min-h-[100px] resize-none"
              />
              <div className="flex gap-3">
                <Input type="date" className="bg-secondary border-border w-auto" />
                <Input type="time" className="bg-secondary border-border w-auto" />
                <Button className="glow-sm hover:glow-md transition-shadow duration-300">
                  Schemalägg
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Content Ideas */}
        <motion.div {...fadeUp} transition={{ duration: 0.4, delay: 0.4 }}>
          <Card className="bg-card border-border glow-border h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Sparkles className="h-5 w-5" />
                Content-idéer
              </CardTitle>
              <CardDescription>AI-genererade förslag</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {contentIdeas.map((idea, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  >
                    <span className="text-muted-foreground/50 mt-0.5">→</span>
                    {idea}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Scheduled Posts */}
      <motion.div {...fadeUp} transition={{ duration: 0.4, delay: 0.5 }}>
        <Card className="bg-card border-border glow-border">
          <CardHeader>
            <CardTitle className="text-lg">Schemalagda inlägg</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {scheduledPosts.map((post, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium">{post.title}</p>
                    <p className="text-xs text-muted-foreground">{post.time}</p>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full bg-accent text-muted-foreground">
                    {post.platform}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
