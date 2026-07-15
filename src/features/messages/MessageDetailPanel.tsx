import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Archive,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Folder,
  FolderInput,
  Loader2,
  Mail,
  MoreHorizontal,
  Send,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react";
import { m } from "framer-motion";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { ReplyTemplatePicker } from "@/features/reply-templates";
import { useIsDesktopWorkspace, useIsMobile, useKeyboardInset } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { MessageBody } from "./MessageBody";
import { isHtmlEmailContent } from "./messageBodyHtml";
import { MessageThread } from "./MessageThread";
import { avatarGradient, formatFullMessageDate, formatMessageDate, senderInitial } from "./messagesUi";
import type { MailFolder, ThreadMessage, UnifiedMessage } from "./types";
import type { MailMessageAction } from "./mailActionsClient";

export type MessageDetailPanelProps = {
  message: UnifiedMessage;
  channelLabel: string;
  aiSummary?: string;
  threadMessages?: ThreadMessage[];
  threadLoading?: boolean;
  replyDraft: string;
  onReplyDraftChange: (value: string) => void;
  draftBusy: boolean;
  sendBusy: boolean;
  replySent: boolean;
  canReply: boolean;
  isHandled: boolean;
  onDraftReply: () => void;
  onSendReply: () => void;
  onMarkHandled: () => void;
  onUnmarkHandled?: () => void;
  onNextAfterSend?: () => void;
  onBack?: () => void;
  showBack?: boolean;
  needsAttention?: boolean;
  focusReplyRef?: React.MutableRefObject<(() => void) | null>;
  navigation?: {
    index: number;
    total: number;
    hasPrev: boolean;
    hasNext: boolean;
    onPrev: () => void;
    onNext: () => void;
  };
  mailFolders?: MailFolder[];
  onMoveToFolder?: (folderId: string) => void;
  moveBusy?: boolean;
  onMailAction?: (action: MailMessageAction) => void;
  mailActionBusy?: boolean;
};

export function MessageDetailPanel({
  message,
  channelLabel,
  aiSummary,
  threadMessages = [],
  threadLoading = false,
  replyDraft,
  onReplyDraftChange,
  draftBusy,
  sendBusy,
  replySent,
  canReply,
  isHandled,
  onDraftReply,
  onSendReply,
  onMarkHandled,
  onUnmarkHandled,
  onNextAfterSend,
  onBack,
  showBack,
  needsAttention = false,
  focusReplyRef,
  navigation,
  mailFolders = [],
  onMoveToFolder,
  moveBusy = false,
  onMailAction,
  mailActionBusy = false,
}: MessageDetailPanelProps) {
  const isDesktopWorkspace = useIsDesktopWorkspace();
  const isStackedWorkspace = !isDesktopWorkspace;
  const keyboardInset = useKeyboardInset();
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const rawBody = (message.body || message.snippet || "").trim();
  const htmlEmail = message.kind === "email" && isHtmlEmailContent(rawBody);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const userOpenedComposeRef = useRef(false);

  useEffect(() => {
    if (!focusReplyRef) return;
    focusReplyRef.current = () => {
      userOpenedComposeRef.current = true;
      setComposeOpen(true);
      window.setTimeout(() => replyRef.current?.focus(), 40);
    };
    return () => {
      focusReplyRef.current = null;
    };
  }, [focusReplyRef, message.id]);

  useEffect(() => {
    setSummaryOpen(false);
  }, [message.id, aiSummary, needsAttention, htmlEmail, isStackedWorkspace]);

  useEffect(() => {
    userOpenedComposeRef.current = false;
    setComposeOpen(false);
  }, [message.id]);

  useEffect(() => {
    if (!isStackedWorkspace || !composeOpen || replySent) return;
    if (!userOpenedComposeRef.current) return;
    const timer = window.setTimeout(() => replyRef.current?.focus(), 180);
    return () => window.clearTimeout(timer);
  }, [composeOpen, isStackedWorkspace, message.id, replySent]);

  useEffect(() => {
    if (!composeOpen || !isStackedWorkspace) return;
    const el = scrollRef.current;
    if (!el) return;
    const timer = window.setTimeout(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [composeOpen, isStackedWorkspace, message.id]);

  const fromName = message.from.name || message.from.email || "Unknown";
  const fromEmail = message.from.email?.trim();
  const headerInitial = senderInitial(fromName);
  const headerAvatarGradient = avatarGradient(fromName || fromEmail || message.id);
  const relativeDate = message.date ? formatMessageDate(message.date) : "";
  const hasDraft = Boolean(replyDraft.trim());
  const accountFolders = mailFolders.filter((folder) => folder.accountId === message.accountId);
  const isStarred = Boolean(message.isStarred);
  const showMailActions = message.kind === "email" && Boolean(onMailAction);

  function renderMoveSubmenu() {
    if (message.kind !== "email" || !onMoveToFolder || accountFolders.length === 0) return null;
    return (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger disabled={moveBusy}>Flytta till mapp</DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="max-h-64 overflow-y-auto">
          {accountFolders.map((folder) => (
            <DropdownMenuItem key={folder.id} onSelect={() => onMoveToFolder(folder.id)}>
              {folder.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    );
  }

  function renderMailActionMenuItems() {
    if (!showMailActions) return null;
    return (
      <>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={mailActionBusy}
          onSelect={() => onMailAction?.(isStarred ? "unflag" : "flag")}
        >
          <Star className={cn("mr-2 h-4 w-4", isStarred && "fill-amber-400 text-amber-500")} />
          {isStarred ? "Ta bort flagga" : "Flagga"}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={mailActionBusy} onSelect={() => onMailAction?.("archive")}>
          <Archive className="mr-2 h-4 w-4" />
          Arkivera
        </DropdownMenuItem>
        {renderMoveSubmenu()}
        <DropdownMenuItem
          disabled={mailActionBusy}
          className="text-destructive focus:text-destructive"
          onSelect={() => setDeleteOpen(true)}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Radera
        </DropdownMenuItem>
      </>
    );
  }

  function renderMailActionBar(compact?: boolean) {
    if (!showMailActions) return null;
    return (
      <div
        className={cn(
          "flex flex-wrap items-center gap-1 rounded-lg border border-border/50 bg-muted/15 p-0.5",
          compact ? "mt-2" : "mt-2 lg:mt-1.5"
        )}
      >
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn("h-7 gap-1 px-2 text-[11px]", isStarred && "text-amber-600 hover:text-amber-700")}
          disabled={mailActionBusy}
          onClick={() => onMailAction?.(isStarred ? "unflag" : "flag")}
        >
          <Star className={cn("h-3.5 w-3.5", isStarred && "fill-current")} />
          {isStarred ? "Flaggad" : "Flagga"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-[11px]"
          disabled={mailActionBusy}
          onClick={() => onMailAction?.("archive")}
        >
          <Archive className="h-3.5 w-3.5" />
          Arkivera
        </Button>
        {onMoveToFolder && accountFolders.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-[11px]"
                disabled={mailActionBusy || moveBusy}
              >
                <FolderInput className="h-3.5 w-3.5" />
                Flytta
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
              {accountFolders.map((folder) => (
                <DropdownMenuItem key={folder.id} onSelect={() => onMoveToFolder(folder.id)}>
                  <Folder className="mr-2 h-4 w-4" />
                  {folder.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-[11px] text-destructive hover:bg-destructive/10 hover:text-destructive"
          disabled={mailActionBusy}
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Radera
        </Button>
        {mailActionBusy ? <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
      </div>
    );
  }

  const deleteDialog = (
    <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Radera mailet?</AlertDialogTitle>
          <AlertDialogDescription>
            Mailet flyttas till papperskorgen i {message.channel === "gmail" ? "Gmail" : "Outlook"}. Detta kan inte
            ångras härifrån.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Avbryt</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => onMailAction?.("delete")}
          >
            Radera
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  function copyBody() {
    const text = (message.body || message.snippet || "").trim();
    void navigator.clipboard
      .writeText(text)
      .then(() => toast.success("Meddelande kopierat."))
      .catch(() => toast.error("Kunde inte kopiera."));
  }

  function copyEmail() {
    if (!fromEmail) return;
    void navigator.clipboard
      .writeText(fromEmail)
      .then(() => toast.success("E-postadress kopierad."))
      .catch(() => toast.error("Kunde inte kopiera."));
  }

  function openCompose() {
    userOpenedComposeRef.current = true;
    setComposeOpen(true);
  }

  const bodyContent = (
    <div className="w-full space-y-2 lg:space-y-1.5">
      {aiSummary ? (
        <div className="overflow-hidden rounded-xl border border-violet-500/20 bg-violet-500/[0.04] lg:rounded-lg">
          <button
            type="button"
            className="flex min-h-9 w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-violet-500/[0.06] lg:min-h-0 lg:px-2 lg:py-1"
            onClick={() => setSummaryOpen((v) => !v)}
            aria-expanded={summaryOpen}
          >
            <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              <Sparkles className="h-3 w-3 text-violet-500" />
              AI-sammanfattning
            </span>
            <ChevronDown
              className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", summaryOpen && "rotate-180")}
            />
          </button>
          {summaryOpen ? (
            <p className="border-t border-border/60 px-2.5 pb-2 pt-1.5 text-[13px] leading-snug text-muted-foreground lg:px-2 lg:pb-1.5 lg:pt-1 lg:text-[12px]">
              {aiSummary}
            </p>
          ) : null}
        </div>
      ) : null}

      {threadMessages.length > 1 ? (
        <MessageThread
          messages={threadMessages}
          loading={threadLoading}
          highlightId={message.providerMessageId || message.id}
          kind={message.kind}
        />
      ) : (
        <div className="relative">
          {threadLoading ? (
            <p className="mb-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Hämtar tråd…
            </p>
          ) : null}
          <MessageBody message={message} />
        </div>
      )}
    </div>
  );

  if (isStackedWorkspace) {
    return (
      <div
        className="flex h-full min-h-0 flex-1 flex-col bg-background"
        style={keyboardInset > 0 ? { paddingBottom: keyboardInset } : undefined}
      >
        <header
          className={cn(
            "shrink-0 border-b border-border/70 bg-background/95 backdrop-blur-md",
            composeOpen ? "px-2 py-1.5" : "px-2 pb-3 pt-2"
          )}
        >
          <div className="flex items-center gap-1">
            {showBack && onBack ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  "shrink-0 gap-1 font-medium",
                  composeOpen ? "h-9 px-2 text-sm" : "h-11 gap-1.5 px-2.5 text-[15px]"
                )}
                onClick={onBack}
              >
                <ArrowLeft className={cn(composeOpen ? "h-4 w-4" : "h-5 w-5")} />
                {composeOpen ? <span className="sr-only">Inkorg</span> : <span>Inkorg</span>}
              </Button>
            ) : (
              <div className={cn(composeOpen ? "h-9 w-2" : "h-11 w-2")} />
            )}

            {composeOpen ? (
              <div className="min-w-0 flex-1 px-1">
                <p className="truncate text-xs font-medium text-muted-foreground">{fromName}</p>
                <p className="truncate text-sm font-semibold leading-tight">
                  {message.subject || "(Utan ämne)"}
                </p>
              </div>
            ) : null}

            <div className="ml-auto flex items-center gap-1">
              {!composeOpen && navigation ? (
                <div className="flex items-center rounded-xl border border-border/60 bg-muted/25 p-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-10 w-10 p-0"
                    disabled={!navigation.hasPrev}
                    onClick={navigation.onPrev}
                    aria-label="Föregående meddelande"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </Button>
                  <span className="min-w-[2.75rem] px-0.5 text-center text-xs tabular-nums text-muted-foreground">
                    {navigation.index + 1}/{navigation.total}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-10 w-10 p-0"
                    disabled={!navigation.hasNext}
                    onClick={navigation.onNext}
                    aria-label="Nästa meddelande"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                </div>
              ) : null}
              {!isHandled ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className={cn(
                    "gap-1.5 font-medium",
                    composeOpen ? "h-9 px-2.5 text-xs" : "h-11 px-3.5 text-[15px]"
                  )}
                  onClick={onMarkHandled}
                >
                  <CheckCheck className="h-4 w-4" />
                  {composeOpen ? <span className="sr-only">Klar</span> : <span>Klar</span>}
                </Button>
              ) : (
                <Badge
                  variant="outline"
                  className={cn(
                    "gap-1 border-emerald-500/40 uppercase text-emerald-600",
                    composeOpen ? "h-8 px-2 text-[10px]" : "h-9 px-2.5 text-[11px]"
                  )}
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Klar
                </Badge>
              )}
              {!composeOpen ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="ghost" size="sm" className="h-11 w-11 p-0" aria-label="Fler åtgärder">
                      <MoreHorizontal className="h-5 w-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem onSelect={copyBody}>
                      <Copy className="mr-2 h-4 w-4" />
                      Kopiera meddelande
                    </DropdownMenuItem>
                    {fromEmail ? (
                      <DropdownMenuItem onSelect={copyEmail}>
                        <Mail className="mr-2 h-4 w-4" />
                        Kopiera e-post
                      </DropdownMenuItem>
                    ) : null}
                    {renderMailActionMenuItems()}
                    {message.externalUrl ? (
                      <DropdownMenuItem asChild>
                        <a href={message.externalUrl} target="_blank" rel="noreferrer">
                          <ExternalLink className="mr-2 h-4 w-4" />
                          Öppna externt
                        </a>
                      </DropdownMenuItem>
                    ) : null}
                    {isHandled && onUnmarkHandled ? (
                      <DropdownMenuItem onSelect={onUnmarkHandled}>Återöppna</DropdownMenuItem>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
          </div>

          {!composeOpen ? (
            <>
              <div className="mt-3 flex items-start gap-3 px-2">
                <div
                  className={cn(
                    "flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-base font-semibold text-white shadow-sm ring-2 ring-background",
                    headerAvatarGradient
                  )}
                  aria-hidden
                >
                  {headerInitial}
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-[17px] font-semibold leading-tight tracking-tight">{fromName}</p>
                    {relativeDate ? (
                      <time
                        className="shrink-0 text-xs tabular-nums text-muted-foreground"
                        dateTime={message.date}
                        title={formatFullMessageDate(message.date)}
                      >
                        {relativeDate}
                      </time>
                    ) : null}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                    <Badge variant="secondary" className="h-5 gap-1 px-1.5 text-[10px] uppercase tracking-wide">
                      {message.kind === "email" ? <Mail className="h-3 w-3" /> : null}
                      {channelLabel}
                    </Badge>
                    {fromEmail ? <span className="truncate">{fromEmail}</span> : null}
                  </div>
                </div>
              </div>

              <h2 className="mt-3 px-2 text-[20px] font-semibold leading-snug tracking-tight">
                {message.subject || "(Utan ämne)"}
              </h2>
              {showMailActions ? <div className="px-2">{renderMailActionBar(true)}</div> : null}
            </>
          ) : null}
        </header>

        <div
          ref={scrollRef}
          className={cn(
            "message-scroll min-h-0 flex-1 overflow-y-auto px-3",
            composeOpen
              ? "py-2 [&_.message-prose_p]:text-[13px] [&_.message-prose_p]:leading-snug"
              : "py-4"
          )}
        >
          {bodyContent}
        </div>

        {canReply ? (
          <footer
            className={cn(
              "shrink-0 border-t border-border/80 bg-background/95 backdrop-blur-md",
              composeOpen || replySent ? "message-compose-footer px-3 py-2" : "message-compose-footer-dock px-3 py-2"
            )}
          >
            {replySent ? (
              <div className="flex flex-col gap-2">
                <p className="inline-flex items-center gap-1.5 text-sm text-emerald-600">
                  <Send className="h-4 w-4" />
                  Svar skickat
                </p>
                {onNextAfterSend ? (
                  <Button type="button" variant="secondary" className="h-11 w-full text-sm" onClick={onNextAfterSend}>
                    Nästa meddelande
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            ) : composeOpen ? (
              <div className="space-y-1.5">
                <Textarea
                  ref={replyRef}
                  value={replyDraft}
                  onChange={(e) => onReplyDraftChange(e.target.value)}
                  placeholder="Skriv ditt svar…"
                  className="min-h-[64px] max-h-[22vh] resize-y rounded-xl border-border/70 bg-muted/20 px-3 py-2 text-[13px] leading-snug shadow-none focus-visible:ring-primary/30"
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && replyDraft.trim() && !sendBusy) {
                      e.preventDefault();
                      onSendReply();
                    }
                  }}
                />
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 shrink-0 px-2.5 text-xs"
                    onClick={onDraftReply}
                    disabled={draftBusy}
                  >
                    {draftBusy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    <span className="ml-1.5">AI</span>
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-9 shrink-0 gap-1 px-2 text-xs text-muted-foreground"
                        aria-label="Fler"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Fler</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-52">
                      <div
                        className="px-1 py-1"
                        onPointerDown={(e) => e.preventDefault()}
                      >
                        <ReplyTemplatePicker
                          className="h-9 w-full justify-start px-2.5 text-xs [&_svg]:mr-1"
                          onInsert={(text) => {
                            onReplyDraftChange(text);
                            openCompose();
                          }}
                          recipientName={message.from.name}
                          disabled={sendBusy}
                        />
                      </div>
                      <DropdownMenuItem onSelect={() => setComposeOpen(false)}>
                        Dölj
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button
                    type="button"
                    className="ml-auto h-9 gap-1.5 px-3 text-xs font-semibold glow-sm"
                    onClick={onSendReply}
                    disabled={sendBusy || !replyDraft.trim()}
                  >
                    {sendBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Skicka
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={openCompose}
                  className={cn(
                    "flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-2xl border px-3.5 text-left text-sm transition-colors",
                    hasDraft || draftBusy
                      ? "border-primary/30 bg-primary/5 text-foreground hover:bg-primary/10"
                      : "border-border/70 bg-muted/30 text-muted-foreground hover:bg-muted/45"
                  )}
                >
                  {draftBusy ? (
                    <>
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                      <span className="truncate">AI skriver utkast…</span>
                    </>
                  ) : hasDraft ? (
                    <>
                      <Sparkles className="h-4 w-4 shrink-0 text-primary" />
                      <span className="min-w-0 truncate">Utkast klart — granska</span>
                    </>
                  ) : (
                    <span>Svara…</span>
                  )}
                </button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-11 w-11 shrink-0 rounded-2xl"
                  onClick={() => {
                    openCompose();
                    if (!hasDraft) onDraftReply();
                  }}
                  disabled={draftBusy}
                  aria-label={hasDraft ? "Öppna utkast" : "Skapa AI-utkast"}
                >
                  {draftBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
                </Button>
                {!isHandled ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    className="h-11 w-11 shrink-0 rounded-2xl"
                    onClick={onMarkHandled}
                    aria-label="Markera klar"
                  >
                    <CheckCheck className="h-5 w-5" />
                  </Button>
                ) : null}
              </div>
            )}
          </footer>
        ) : null}
        {deleteDialog}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-background">
      <header className="shrink-0 border-b border-border/80 bg-card/20 px-3 py-2 backdrop-blur-sm lg:px-3 lg:py-1.5">
        <div className="flex w-full items-start gap-2">
          {showBack && onBack ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-0.5 h-8 w-8 shrink-0 p-0 lg:hidden"
              onClick={onBack}
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Tillbaka till inkorgen</span>
            </Button>
          ) : null}

          <div
            className={cn(
              "hidden h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xs font-semibold text-white shadow-sm ring-2 ring-background lg:flex",
              headerAvatarGradient
            )}
            aria-hidden
          >
            {headerInitial}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h2 className="min-w-0 text-base font-semibold leading-snug tracking-tight lg:text-[15px]">
                {message.subject || "(Utan ämne)"}
              </h2>
              <div className="flex shrink-0 items-center gap-0.5">
                {navigation ? (
                  <div className="mr-0.5 flex items-center rounded-md border border-border/60 bg-muted/20 p-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      disabled={!navigation.hasPrev}
                      onClick={navigation.onPrev}
                      aria-label="Föregående meddelande"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="min-w-[2.75rem] px-1 text-center text-[10px] tabular-nums text-muted-foreground">
                      {navigation.index + 1}/{navigation.total}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      disabled={!navigation.hasNext}
                      onClick={navigation.onNext}
                      aria-label="Nästa meddelande"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                ) : null}
                {message.externalUrl ? (
                  <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" asChild>
                    <a href={message.externalUrl} target="_blank" rel="noreferrer" aria-label="Öppna i plattformen">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                ) : null}
                <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={copyBody} title="Kopiera meddelande">
                  <Copy className="h-4 w-4" />
                  <span className="sr-only">Kopiera meddelande</span>
                </Button>
                {!isHandled ? (
                  <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onMarkHandled} title="Markera hanterad (H)">
                    <CheckCheck className="h-4 w-4" />
                    <span className="sr-only">Markera hanterad</span>
                  </Button>
                ) : (
                  <div className="flex items-center gap-1">
                    <Badge
                      variant="outline"
                      className="h-7 gap-1 border-emerald-500/40 px-2 text-[10px] uppercase text-emerald-600"
                    >
                      <CheckCheck className="h-3 w-3" />
                      Klar
                    </Badge>
                    {onUnmarkHandled ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs text-muted-foreground"
                        onClick={onUnmarkHandled}
                        title="Flytta tillbaka till öppna"
                      >
                        Återöppna
                      </Button>
                    ) : null}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground lg:mt-0.5">
              <Badge variant="secondary" className="h-5 gap-1 px-1.5 text-[9px] uppercase tracking-wide">
                {message.kind === "email" ? <Mail className="h-3 w-3" /> : null}
                {channelLabel}
              </Badge>
              <span className="font-medium text-foreground/90">{fromName}</span>
              {fromEmail ? <span className="truncate text-muted-foreground">&lt;{fromEmail}&gt;</span> : null}
              {message.accountLabel ? <span className="hidden xl:inline">{message.accountLabel}</span> : null}
              {message.date ? (
                <>
                  <span aria-hidden>·</span>
                  <time className="tabular-nums">{formatFullMessageDate(message.date)}</time>
                </>
              ) : null}
              {fromEmail ? (
                <Button type="button" variant="link" className="h-auto p-0 text-[11px]" onClick={copyEmail}>
                  Kopiera
                </Button>
              ) : null}
            </div>
            {showMailActions ? renderMailActionBar() : null}
          </div>
        </div>
      </header>

      {needsAttention && canReply && !replySent ? (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-primary/15 bg-primary/5 px-3 py-1.5 lg:px-3 lg:py-1">
          <span className="text-[10px] font-medium text-primary">Snabbåtgärder</span>
          <Button type="button" size="sm" variant="secondary" className="h-6 px-2 text-[11px]" onClick={onMarkHandled}>
            <CheckCheck className="mr-1 h-3 w-3" />
            Klar
            <kbd className="ml-1 hidden rounded border border-border/60 px-1 font-mono text-[9px] opacity-70 lg:inline">H</kbd>
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={onDraftReply} disabled={draftBusy}>
            {draftBusy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Sparkles className="mr-1 h-3 w-3" />}
            AI
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => replyRef.current?.focus()}>
            Svara
            <kbd className="ml-1 hidden rounded border border-border/60 px-1 font-mono text-[9px] opacity-70 lg:inline">R</kbd>
          </Button>
        </div>
      ) : null}

      <div className="message-scroll min-h-0 flex-1 overflow-y-auto px-3 py-2 lg:px-3 lg:py-2">{bodyContent}</div>

      {canReply ? (
        <footer className="message-compose-footer shrink-0 border-t border-border/80 bg-gradient-to-t from-card to-card/80 px-3 py-2 backdrop-blur-md lg:px-3">
          <div className="w-full">
            {replySent ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
                <p className="inline-flex items-center gap-1.5 text-sm text-emerald-600">
                  <Send className="h-4 w-4" />
                  Svar skickat
                </p>
                {onNextAfterSend ? (
                  <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={onNextAfterSend}>
                    Nästa meddelande
                    <ChevronRight className="ml-1 h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </div>
            ) : (
              <div className="space-y-2">
                <Textarea
                  ref={replyRef}
                  value={replyDraft}
                  onChange={(e) => onReplyDraftChange(e.target.value)}
                  placeholder={
                    message.kind === "email"
                      ? "Skriv ditt svar… (AI-utkast laddas automatiskt)"
                      : "Skriv ett svar…"
                  }
                  className="min-h-[72px] resize-none rounded-lg border-border/70 bg-background/80 text-[13px] leading-snug shadow-inner focus-visible:ring-primary/30 lg:min-h-[64px]"
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && replyDraft.trim() && !sendBusy) {
                      e.preventDefault();
                      onSendReply();
                    }
                  }}
                />
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-[11px]" onClick={onDraftReply} disabled={draftBusy}>
                    {draftBusy ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    AI-utkast
                  </Button>
                  <ReplyTemplatePicker
                    onInsert={onReplyDraftChange}
                    recipientName={message.from.name}
                    disabled={sendBusy}
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="ml-auto h-7 gap-1 text-[11px] glow-sm"
                    onClick={onSendReply}
                    disabled={sendBusy || !replyDraft.trim()}
                  >
                    {sendBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Skicka
                  </Button>
                  <span className="hidden text-[10px] text-muted-foreground lg:inline">
                    Ctrl+Enter
                    {replyDraft.trim() ? ` · ${replyDraft.trim().length} tecken` : null}
                  </span>
                </div>
              </div>
            )}
          </div>
        </footer>
      ) : null}
      {deleteDialog}
    </div>
  );
}

export function MessageDetailPlaceholder() {
  const isMobile = useIsMobile();

  return (
    <div className="message-reading-pane flex h-full min-h-[280px] flex-col items-center justify-center gap-5 px-5 py-8 text-center sm:min-h-[320px] sm:gap-6 sm:px-6">
      <m.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="flex items-center gap-3 rounded-2xl border border-dashed border-border/60 bg-card/30 p-5 shadow-sm sm:p-6"
      >
        <div className="hidden h-24 w-16 rounded-lg border border-border/50 bg-muted/30 sm:block" aria-hidden />
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/15">
          <Mail className="h-7 w-7 text-primary/70" />
        </div>
        <div className="hidden h-24 w-28 rounded-lg border border-border/50 bg-muted/20 sm:block" aria-hidden />
      </m.div>
      <div className="max-w-sm space-y-1.5">
        <p className="font-display text-base font-semibold">
          {isMobile ? "Tryck ett meddelande" : "Välj ett meddelande"}
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {isMobile
            ? "Välj ett meddelande i listan. Läs i full skärm, svara när du är redo."
            : "Inkorgen stannar kvar till vänster — läs, svara och markera hanterade utan att tappa kontexten."}
        </p>
      </div>
      <div className="hidden rounded-xl border border-border/60 bg-muted/20 px-5 py-3 text-left lg:block">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Genvägar</p>
        <ul className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted-foreground">
          <li>
            <kbd className="rounded border border-border px-1 font-mono text-[10px]">J</kbd> /{" "}
            <kbd className="rounded border border-border px-1 font-mono text-[10px]">K</kbd> nästa / föregående
          </li>
          <li>
            <kbd className="rounded border border-border px-1 font-mono text-[10px]">H</kbd> Klar
          </li>
          <li>
            <kbd className="rounded border border-border px-1 font-mono text-[10px]">E</kbd> Arkivera
          </li>
          <li>
            <kbd className="rounded border border-border px-1 font-mono text-[10px]">R</kbd> Svara
          </li>
          <li>
            <kbd className="rounded border border-border px-1 font-mono text-[10px]">Esc</kbd> stäng
          </li>
        </ul>
      </div>
    </div>
  );
}
