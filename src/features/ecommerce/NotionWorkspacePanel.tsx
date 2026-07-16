import { m } from "framer-motion";
import {
  FileText,
  Database,
  ExternalLink,
  ChevronDown,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation("ecommerce");
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
        title: page.title || t("notion.untitledPage"),
        type: "page_id" as const,
        lastEditedLabel: page.lastEditedTime ? formatDate(page.lastEditedTime) : t("notion.unknownDate"),
      })),
    [notionData, t]
  );

  const notionDatabaseOptions = useMemo<NotionParentOption[]>(
    () =>
      notionData.databases.map((db) => ({
        id: db.id,
        title: db.title || t("notion.untitledDatabase"),
        type: "database_id" as const,
        lastEditedLabel: db.lastEditedTime ? formatDate(db.lastEditedTime) : t("notion.unknownDate"),
      })),
    [notionData, t]
  );

  async function handleCreateNotionPage() {
    if (!activeNotionId || !notionParentId.trim() || !notionTitle.trim()) return;
    setNotionSaving(true);
    setNotionWriteMessage(null);
    try {
      await apiJson(`/api/notion/${activeNotionId}/pages`, t("notion.createPage.failed"), {
        body: {
          parentId: notionParentId.trim(),
          parentType: notionParentType,
          title: notionTitle.trim(),
          content: notionContent.trim(),
          business_profile_id: businessProfileId,
        },
      });
      setNotionWriteMessage(t("notion.createPage.success"));
      setNotionTitle("");
      setNotionContent("");
      onRefresh();
    } catch (err) {
      setNotionWriteMessage(err instanceof Error ? err.message : t("notion.createPage.failed"));
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
                  {t("notion.panelTitle")}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {notionData.workspace.name || t("notion.connectedWorkspace")} ·{" "}
                  {t("notion.pagesCount", { count: notionData.stats.pagesCount })}
                </p>
              </div>
              <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${notionOpen ? "rotate-180" : ""}`} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 px-6 pb-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div className="rounded-lg border border-border p-4">
                <p className="text-muted-foreground">{t("notion.pagesFound")}</p>
                <p className="text-2xl font-bold">{notionData.stats.pagesCount}</p>
              </div>
              <div className="rounded-lg border border-border p-4">
                <p className="text-muted-foreground">{t("notion.databasesFound")}</p>
                <p className="text-2xl font-bold">{notionData.stats.databasesCount}</p>
              </div>
            </div>

            {notionData.pages.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm font-medium flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  {t("notion.recentPages")}
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
                      <p className="font-medium truncate">{page.title || t("notion.untitled")}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {page.lastEditedTime ? formatDate(page.lastEditedTime) : t("notion.unknownDate")}
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
                  {t("notion.createPage.title")}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{t("notion.createPage.hint")}</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notion-parent-select">{t("notion.createPage.parentSelectLabel")}</Label>
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
                  <option value="">{t("notion.createPage.parentSelectPlaceholder")}</option>
                  {notionPageOptions.length > 0 && (
                    <optgroup label={t("notion.createPage.pagesGroup", { count: notionPageOptions.length })}>
                      {notionPageOptions.map((option) => (
                        <option key={`${option.type}:${option.id}`} value={`${option.type}:${option.id}`}>
                          {option.title} - {option.lastEditedLabel}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {notionDatabaseOptions.length > 0 && (
                    <optgroup label={t("notion.createPage.databasesGroup", { count: notionDatabaseOptions.length })}>
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
                <Label htmlFor="notion-parent-id">{t("notion.createPage.parentIdLabel")}</Label>
                <Input
                  id="notion-parent-id"
                  placeholder={t("notion.createPage.parentIdPlaceholder")}
                  value={notionParentId}
                  onChange={(e) => setNotionParentId(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notion-parent-type">{t("notion.createPage.parentTypeLabel")}</Label>
                <select
                  id="notion-parent-type"
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={notionParentType}
                  onChange={(e) => setNotionParentType(e.target.value === "database_id" ? "database_id" : "page_id")}
                >
                  <option value="page_id">{t("notion.createPage.typePage")}</option>
                  <option value="database_id">{t("notion.createPage.typeDatabase")}</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notion-page-title">{t("notion.createPage.titleLabel")}</Label>
                <Input
                  id="notion-page-title"
                  placeholder={t("notion.createPage.titlePlaceholder")}
                  value={notionTitle}
                  onChange={(e) => setNotionTitle(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notion-page-content">{t("notion.createPage.contentLabel")}</Label>
                <Input
                  id="notion-page-content"
                  placeholder={t("notion.createPage.contentPlaceholder")}
                  value={notionContent}
                  onChange={(e) => setNotionContent(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleCreateNotionPage}
                  disabled={notionSaving || !notionParentId.trim() || !notionTitle.trim() || !activeNotionId}
                >
                  {notionSaving ? t("notion.createPage.creating") : t("notion.createPage.submit")}
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
