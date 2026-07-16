import { m } from "framer-motion";
import {
  FileText,
  Database,
  ExternalLink,
  ChevronDown,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NotionIcon } from "@/components/platform-icons";
import { pageFadeUp as fadeUp } from "@/lib/motion";
import { apiJson } from "@/lib/apiJson";
import {
  formatDate,
  type NotionData,
  type NotionParentOption,
} from "@/features/ecommerce/ecommerceOrg";

type Props = {
  notionData: NotionData;
  activeNotionId: string | null;
  businessProfileId: string | null;
  onRefresh: () => void;
};

/** Collapsible Notion workspace panel for the ecommerce Verktyg tab. */
export function NotionWorkspacePanel({
  notionData,
  activeNotionId,
  businessProfileId,
  onRefresh,
}: Props) {
  const [notionParentId, setNotionParentId] = useState("");
  const [notionParentType, setNotionParentType] = useState<"page_id" | "database_id">("page_id");
  const [notionTitle, setNotionTitle] = useState("");
  const [notionContent, setNotionContent] = useState("");
  const [notionSaving, setNotionSaving] = useState(false);
  const [notionWriteMessage, setNotionWriteMessage] = useState<string | null>(null);
  const [notionOpen, setNotionOpen] = useState(false);

  useEffect(() => {
    setNotionOpen(true);
  }, [notionData]);

  const notionPageOptions = useMemo<NotionParentOption[]>(
    () =>
      notionData.pages.map((page) => ({
        id: page.id,
        title: page.title || "Namnlös sida",
        type: "page_id" as const,
        lastEditedLabel: page.lastEditedTime ? formatDate(page.lastEditedTime) : "Okänt datum",
      })),
    [notionData]
  );

  const notionDatabaseOptions = useMemo<NotionParentOption[]>(
    () =>
      notionData.databases.map((db) => ({
        id: db.id,
        title: db.title || "Namnlös databas",
        type: "database_id" as const,
        lastEditedLabel: db.lastEditedTime ? formatDate(db.lastEditedTime) : "Okänt datum",
      })),
    [notionData]
  );

  async function handleCreateNotionPage() {
    if (!activeNotionId || !notionParentId.trim() || !notionTitle.trim()) return;
    setNotionSaving(true);
    setNotionWriteMessage(null);
    try {
      await apiJson(`/api/notion/${activeNotionId}/pages`, "Kunde inte skapa Notion-sida.", {
        body: {
          parentId: notionParentId.trim(),
          parentType: notionParentType,
          title: notionTitle.trim(),
          content: notionContent.trim(),
          business_profile_id: businessProfileId,
        },
      });
      setNotionWriteMessage("Sidan skapades i Notion.");
      setNotionTitle("");
      setNotionContent("");
      onRefresh();
    } catch (err) {
      setNotionWriteMessage(err instanceof Error ? err.message : "Kunde inte skapa Notion-sida.");
    } finally {
      setNotionSaving(false);
    }
  }

  return (
    <Collapsible open={notionOpen} onOpenChange={setNotionOpen}>
      <m.div {...fadeUp} transition={{ duration: 0.35 }}>
        <Card className="bg-card border-border">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-muted/20 transition-colors"
            >
              <div>
                <p className="font-medium flex items-center gap-2">
                  <NotionIcon className="h-4 w-4" />
                  Notion workspace (valfritt)
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {notionData.workspace.name || "Kopplat workspace"} · {notionData.stats.pagesCount} sidor
                </p>
              </div>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${notionOpen ? "rotate-180" : ""}`} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 px-6 pb-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div className="rounded-lg border border-border p-4">
                <p className="text-muted-foreground">Sidor hittade</p>
                <p className="text-2xl font-bold">{notionData.stats.pagesCount}</p>
              </div>
              <div className="rounded-lg border border-border p-4">
                <p className="text-muted-foreground">Databaser hittade</p>
                <p className="text-2xl font-bold">{notionData.stats.databasesCount}</p>
              </div>
            </div>

            {notionData.pages.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm font-medium flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Senaste Notion-sidorna
                </p>
                {notionData.pages.map((page) => (
                  <a
                    key={page.id}
                    href={page.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between rounded-lg border border-border p-3 hover:bg-muted/30 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="font-medium truncate">{page.title || "Namnlös"}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {page.lastEditedTime ? formatDate(page.lastEditedTime) : "Okänt datum"}
                      </p>
                    </div>
                    <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
                  </a>
                ))}
              </div>
            ) : null}

            <div className="rounded-lg border border-border p-4 space-y-3">
              <div>
                <p className="text-sm font-medium flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  Skapa Notion-sida
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Dela först föräldersidan/databasen med din integration i Notion.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notion-parent-select">Välj förälder (valfritt)</Label>
                <select
                  id="notion-parent-select"
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={notionParentId ? `${notionParentType}:${notionParentId}` : ""}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (!value) return;
                    const [type, id] = value.split(":", 2);
                    if (!id) return;
                    setNotionParentType(type === "database_id" ? "database_id" : "page_id");
                    setNotionParentId(id);
                  }}
                >
                  <option value="">Välj en sida eller databas...</option>
                  {notionPageOptions.length > 0 && (
                    <optgroup label={`Sidor (${notionPageOptions.length})`}>
                      {notionPageOptions.map((option) => (
                        <option key={`${option.type}:${option.id}`} value={`${option.type}:${option.id}`}>
                          {option.title} - {option.lastEditedLabel}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {notionDatabaseOptions.length > 0 && (
                    <optgroup label={`Databaser (${notionDatabaseOptions.length})`}>
                      {notionDatabaseOptions.map((option) => (
                        <option key={`${option.type}:${option.id}`} value={`${option.type}:${option.id}`}>
                          {option.title} - {option.lastEditedLabel}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notion-parent-id">Förälder-ID</Label>
                <Input
                  id="notion-parent-id"
                  placeholder="sid- eller databas-id"
                  value={notionParentId}
                  onChange={(e) => setNotionParentId(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notion-parent-type">Föräldertyp</Label>
                <select
                  id="notion-parent-type"
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={notionParentType}
                  onChange={(e) => setNotionParentType(e.target.value === "database_id" ? "database_id" : "page_id")}
                >
                  <option value="page_id">Sida</option>
                  <option value="database_id">Databas</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notion-page-title">Titel</Label>
                <Input
                  id="notion-page-title"
                  placeholder="Veckoplanering"
                  value={notionTitle}
                  onChange={(e) => setNotionTitle(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notion-page-content">Innehåll (valfritt)</Label>
                <Input
                  id="notion-page-content"
                  placeholder="Första stycket på sidan"
                  value={notionContent}
                  onChange={(e) => setNotionContent(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleCreateNotionPage}
                  disabled={notionSaving || !notionParentId.trim() || !notionTitle.trim() || !activeNotionId}
                >
                  {notionSaving ? "Skapar…" : "Skapa i Notion"}
                </Button>
                {notionWriteMessage ? (
                  <p className="text-xs text-muted-foreground">{notionWriteMessage}</p>
                ) : null}
              </div>
            </div>
          </CollapsibleContent>
        </Card>
      </m.div>
    </Collapsible>
  );
}
