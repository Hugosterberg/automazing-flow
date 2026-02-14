import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAccounts } from "@/context/AccountsContext";
import type { SocialPlatform } from "@/types/accounts";
import { InstagramIcon, TikTokIcon, YoutubeIcon } from "@/components/platform-icons";

const platformConfig: Record<
  SocialPlatform,
  { label: string; placeholder: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  instagram: { label: "Instagram", placeholder: "@användarnamn", Icon: InstagramIcon },
  tiktok: { label: "TikTok", placeholder: "@användarnamn", Icon: TikTokIcon },
  youtube: { label: "YouTube", placeholder: "Kanalens användarnamn eller ID", Icon: YoutubeIcon },
};

interface ConnectAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  platform: SocialPlatform;
}

export function ConnectAccountDialog({ open, onOpenChange, platform }: ConnectAccountDialogProps) {
  const { addAccount } = useAccounts();
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const config = platformConfig[platform];
  const Icon = config.Icon;

  async function handleConnect() {
    if (!username.trim()) return;
    setLoading(true);
    // Simulerar OAuth/API-anslutning
    await new Promise((r) => setTimeout(r, 1200));
    addAccount(platform, username.trim(), {
      displayName: username.trim(),
      profileUrl: `https://${platform}.com/${username.trim().replace("@", "")}`,
    });
    setUsername("");
    setLoading(false);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center">
              <Icon className="h-4 w-4" />
            </div>
            Anslut {config.label}
          </DialogTitle>
          <DialogDescription>
            Anslut ditt {config.label}-konto för att hämta data och analysera din profil. Du kommer
            att omdirigeras för inloggning.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="username">Användarnamn</Label>
            <Input
              id="username"
              placeholder={config.placeholder}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleConnect()}
              className="bg-secondary border-border"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Avbryt
          </Button>
          <Button onClick={handleConnect} disabled={!username.trim() || loading}>
            {loading ? "Ansluter..." : "Anslut"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
