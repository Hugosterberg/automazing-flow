import { useEffect, useMemo, useState } from "react";
import {
  Boxes,
  ExternalLink,
  ImagePlus,
  Layers,
  Loader2,
  Package,
  Pencil,
  Plus,
  Search,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ShopifyIcon } from "@/components/platform-icons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { type SelectedContentAsset } from "@/lib/contentSelection";
import { useProfileDocument } from "@/features/profile-documents";
import {
  createId,
  emptyProductInput,
  imageFromContentAsset,
  productCoverImage,
  productImageDisplayUrl,
} from "@/lib/productStore";
import type { Product, ProductImage, ProductInput, ProductVersion } from "@/types/ecommerce";
import { toast } from "sonner";

type Props = {
  businessProfileId: string | null;
  products: Product[];
  loading: boolean;
  error: string | null;
  shopifyAccountId: string | null;
  importingShopify: boolean;
  onCreate: (input: ProductInput) => Promise<Product>;
  onUpdate: (id: string, patch: Partial<ProductInput>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onImportShopify: () => Promise<void>;
};

function ProductThumb({
  image,
  className = "",
  fallbackLabel,
}: {
  image: ProductImage | null;
  className?: string;
  fallbackLabel?: string;
}) {
  const src = productImageDisplayUrl(image);
  // Track load failures so a dead Drive/Shopify/Alibaba URL degrades to the
  // placeholder instead of a broken-image icon.
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div className={`flex items-center justify-center bg-secondary/40 text-muted-foreground ${className}`}>
        <Package className="h-5 w-5" />
        {fallbackLabel ? <span className="sr-only">{fallbackLabel}</span> : null}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={image?.alt || fallbackLabel || "Produktbild"}
      className={`object-cover ${className}`}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

const SOURCE_LABELS: Record<Product["source"], string> = {
  manual: "Manuell",
  alibaba: "Alibaba",
  shopify: "Shopify",
  content: "Content",
};

function FilterChip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
        active
          ? "bg-foreground text-background border-foreground"
          : "border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
      <span className={active ? "ml-1 opacity-70" : "ml-1 text-muted-foreground/60"}>{count}</span>
    </button>
  );
}

export function ProductsTab({
  businessProfileId,
  products,
  loading,
  error,
  shopifyAccountId,
  importingShopify,
  onCreate,
  onUpdate,
  onDelete,
  onImportShopify,
}: Props) {
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | Product["source"]>("all");
  const [sortBy, setSortBy] = useState<"updated" | "name" | "price">("updated");

  // Assets the user marked in the Content page — read from the shared,
  // DB-backed content selection (synced across devices/pages).
  const contentAssets = useProfileDocument<SelectedContentAsset[]>("content-selection", []).data;

  const editingProduct = useMemo(
    () => products.find((product) => product.id === editingId) ?? null,
    [products, editingId]
  );

  // Count products per source so the filter chips can show how many of each
  // there are at a glance.
  const sourceCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const product of products) {
      counts[product.source] = (counts[product.source] ?? 0) + 1;
    }
    return counts;
  }, [products]);

  const visibleProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = products.filter((product) => {
      if (sourceFilter !== "all" && product.source !== sourceFilter) return false;
      if (!query) return true;
      return (
        product.name.toLowerCase().includes(query) ||
        product.description.toLowerCase().includes(query) ||
        (product.vendor ?? "").toLowerCase().includes(query) ||
        product.tags.some((tag) => tag.toLowerCase().includes(query))
      );
    });
    const sorted = [...filtered];
    if (sortBy === "name") {
      sorted.sort((a, b) => a.name.localeCompare(b.name, "sv", { sensitivity: "base" }));
    } else if (sortBy === "price") {
      const num = (p: Product) => {
        const parsed = parseFloat(String(p.price ?? "").replace(",", "."));
        return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
      };
      sorted.sort((a, b) => num(a) - num(b));
    } else {
      sorted.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
    }
    return sorted;
  }, [products, search, sourceFilter, sortBy]);

  const sourceChips = useMemo(() => {
    const order: Array<Product["source"]> = ["shopify", "alibaba", "manual", "content"];
    return order.filter((source) => (sourceCounts[source] ?? 0) > 0);
  }, [sourceCounts]);

  async function handleCreate() {
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      const product = await onCreate(emptyProductInput(name, newDescription.trim()));
      setNewName("");
      setNewDescription("");
      setNewOpen(false);
      setEditingId(product.id);
      toast.success("Produkt skapad");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Kunde inte skapa produkten.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Boxes className="h-5 w-5" />
            Produkter
          </h2>
          <p className="text-sm text-muted-foreground">
            {products.length === 0
              ? "Registrera produkterna du säljer och deras olika versioner."
              : `${products.length} produkt${products.length === 1 ? "" : "er"} i din katalog.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {shopifyAccountId ? (
            <Button variant="outline" onClick={() => void onImportShopify()} disabled={importingShopify}>
              {importingShopify ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <ShopifyIcon className="h-4 w-4 mr-2" />
              )}
              Hämta från Shopify
            </Button>
          ) : null}
          <Button onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Ny produkt
          </Button>
        </div>
      </div>

      {products.length > 0 ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Sök produkt, märke eller tagg…"
              className="pl-9"
              aria-label="Sök produkter"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {sourceChips.length > 1 ? (
              <div className="flex items-center gap-1.5 flex-wrap">
                <FilterChip
                  active={sourceFilter === "all"}
                  onClick={() => setSourceFilter("all")}
                  label="Alla"
                  count={products.length}
                />
                {sourceChips.map((source) => (
                  <FilterChip
                    key={source}
                    active={sourceFilter === source}
                    onClick={() => setSourceFilter(source)}
                    label={SOURCE_LABELS[source]}
                    count={sourceCounts[source] ?? 0}
                  />
                ))}
              </div>
            ) : null}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              aria-label="Sortera produkter"
              className="h-9 rounded-md border border-input bg-background px-2.5 text-sm text-muted-foreground"
            >
              <option value="updated">Senast ändrad</option>
              <option value="name">Namn (A–Ö)</option>
              <option value="price">Pris (lågt först)</option>
            </select>
          </div>
        </div>
      ) : null}

      {error ? (
        <Card className="bg-destructive/10 border-destructive/30">
          <CardContent className="py-3 px-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}

      {loading && products.length === 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="bg-card border-border overflow-hidden">
              <div className="aspect-[4/3] bg-secondary/40 animate-pulse" />
              <CardContent className="p-4 space-y-2">
                <div className="h-4 w-2/3 rounded bg-secondary animate-pulse" />
                <div className="h-3 w-1/3 rounded bg-secondary/60 animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : products.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Inga produkter ännu"
          description="Skapa en produkt manuellt, importera från Alibaba ovan, hämta din Shopify-katalog, eller tagga en bild som du markerat i Content."
          action={
            <Button onClick={() => setNewOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Skapa produkt
            </Button>
          }
        />
      ) : visibleProducts.length === 0 ? (
        <Card className="bg-card border-border border-dashed">
          <CardContent className="py-10 text-center space-y-3">
            <p className="text-sm text-muted-foreground">Inga produkter matchar din sökning eller filter.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearch("");
                setSourceFilter("all");
              }}
            >
              Rensa filter
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleProducts.map((product) => {
            const cover = productCoverImage(product);
            const meta = [product.versions.length > 0 ? `${product.versions.length} version${product.versions.length === 1 ? "" : "er"}` : null]
              .filter(Boolean)
              .join(" · ");
            return (
              <Card
                key={product.id}
                role="button"
                tabIndex={0}
                aria-label={`Redigera ${product.name}`}
                className="bg-card border-border overflow-hidden group cursor-pointer hover:glow-sm transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                onClick={() => setEditingId(product.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setEditingId(product.id);
                  }
                }}
              >
                <div className="aspect-[4/3] bg-secondary/30 relative">
                  <ProductThumb image={cover} className="h-full w-full" fallbackLabel={product.name} />
                  <Badge variant="secondary" className="absolute top-2 left-2 gap-1">
                    {product.source === "shopify" ? <ShopifyIcon className="h-3 w-3" /> : <Tag className="h-3 w-3" />}
                    {SOURCE_LABELS[product.source]}
                  </Badge>
                  {product.status && product.status !== "active" ? (
                    <Badge variant="outline" className="absolute bottom-2 left-2 bg-background/80 capitalize">
                      {product.status}
                    </Badge>
                  ) : null}
                  {product.versions.length > 0 ? (
                    <Badge variant="secondary" className="absolute top-2 right-2 gap-1">
                      <Layers className="h-3 w-3" />
                      {product.versions.length}
                    </Badge>
                  ) : null}
                </div>
                <CardContent className="p-4 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium truncate">{product.name}</p>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 -mr-1.5 -mt-1 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingId(product.id);
                      }}
                      aria-label={`Redigera ${product.name}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {product.price ? (
                    <p className="text-sm text-muted-foreground">
                      {product.price}
                      {product.currency ? ` ${product.currency}` : ""}
                    </p>
                  ) : null}
                  {product.description ? (
                    <p className="text-xs text-muted-foreground/80 line-clamp-2">{product.description}</p>
                  ) : meta ? (
                    <p className="text-xs text-muted-foreground/70">{meta}</p>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* New product dialog */}
      <Dialog open={newOpen} onOpenChange={(open) => !creating && setNewOpen(open)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ny produkt</DialogTitle>
            <DialogDescription>Ge produkten ett namn. Du kan lägga till bilder och versioner sedan.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="new-product-name">Namn</Label>
              <Input
                id="new-product-name"
                placeholder="t.ex. Bambu tandborste"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-product-description">Beskrivning (valfritt)</Label>
              <Textarea
                id="new-product-description"
                placeholder="Kort beskrivning av produkten"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)} disabled={creating}>
              Avbryt
            </Button>
            <Button onClick={handleCreate} disabled={!newName.trim() || creating}>
              {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Skapa produkt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit product dialog */}
      <ProductEditDialog
        product={editingProduct}
        contentAssets={contentAssets}
        onClose={() => setEditingId(null)}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />
    </div>
  );
}

function ProductEditDialog({
  product,
  contentAssets,
  onClose,
  onUpdate,
  onDelete,
}: {
  product: Product | null;
  contentAssets: SelectedContentAsset[];
  onClose: () => void;
  onUpdate: (id: string, patch: Partial<ProductInput>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  // Local working copy so we don't write to the DB on every keystroke; persist
  // on "Spara".
  const [draft, setDraft] = useState<Product | null>(product);
  const [versionName, setVersionName] = useState("");
  const [versionAssetId, setVersionAssetId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(product);
    setVersionName("");
    setVersionAssetId(null);
  }, [product]);

  if (!product || !draft) return null;

  function patch(next: Partial<Product>) {
    setDraft((prev) => (prev ? { ...prev, ...next } : prev));
  }

  function addVersion() {
    const name = versionName.trim();
    if (!name) return;
    const asset = contentAssets.find((a) => a.id === versionAssetId) ?? null;
    const version: ProductVersion = {
      id: createId("ver"),
      name,
      image: asset ? imageFromContentAsset(asset) : null,
      createdAt: new Date().toISOString(),
    };
    patch({ versions: [...draft.versions, version] });
    setVersionName("");
    setVersionAssetId(null);
  }

  function removeVersion(versionId: string) {
    patch({ versions: draft.versions.filter((v) => v.id !== versionId) });
  }

  function addContentImage(asset: SelectedContentAsset) {
    const url = asset.previewUrl || asset.thumbnailUrl;
    if (draft.images.some((img) => img.url === url)) {
      toast.info("Bilden finns redan på produkten");
      return;
    }
    patch({ images: [...draft.images, imageFromContentAsset(asset)] });
  }

  function removeImage(imageId: string) {
    patch({ images: draft.images.filter((img) => img.id !== imageId) });
  }

  async function save() {
    setSaving(true);
    try {
      await onUpdate(product.id, {
        name: draft.name,
        description: draft.description,
        price: draft.price,
        currency: draft.currency,
        specs: draft.specs,
        images: draft.images,
        versions: draft.versions,
      });
      toast.success("Produkt sparad");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Kunde inte spara produkten.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setSaving(true);
    try {
      await onDelete(product.id);
      toast.success("Produkt borttagen");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Kunde inte ta bort produkten.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Redigera produkt</DialogTitle>
          <DialogDescription>
            Justera namn och beskrivning, lägg till bilder från Content och tagga versioner.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="edit-product-name">Namn</Label>
            <Input
              id="edit-product-name"
              value={draft.name}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-product-price">Pris</Label>
              <Input
                id="edit-product-price"
                placeholder="t.ex. 199"
                value={draft.price ?? ""}
                onChange={(e) => patch({ price: e.target.value || null })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-product-currency">Valuta</Label>
              <Input
                id="edit-product-currency"
                placeholder="t.ex. SEK"
                value={draft.currency ?? ""}
                onChange={(e) => patch({ currency: e.target.value || null })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-product-description">Beskrivning</Label>
            <Textarea
              id="edit-product-description"
              className="min-h-[120px]"
              placeholder="Beskriv produkten. Importerad text från Alibaba eller Shopify kan redigeras fritt här."
              value={draft.description}
              onChange={(e) => patch({ description: e.target.value })}
            />
          </div>

          {(draft.adminUrl || draft.sourceUrl) ? (
            <a
              href={draft.adminUrl || draft.sourceUrl || "#"}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              {draft.source === "shopify" ? "Öppna i Shopify" : "Källa"}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : null}

          {draft.specs.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">Specifikationer</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {draft.specs.map((spec) => (
                  <div key={`${spec.label}-${spec.value}`} className="rounded-md border border-border/60 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{spec.label}</p>
                    <p className="text-sm">{spec.value}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Product image gallery */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Bilder</p>
            {draft.images.length > 0 ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {draft.images.map((image) => (
                  <div key={image.id} className="relative rounded-md overflow-hidden border border-border group/img">
                    <ProductThumb image={image} className="aspect-square w-full" />
                    <button
                      type="button"
                      onClick={() => removeImage(image.id)}
                      className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity"
                      aria-label="Ta bort bild"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Inga bilder ännu.</p>
            )}
          </div>

          {/* Versions */}
          <div className="space-y-3 rounded-lg border border-border/70 bg-muted/20 p-4">
            <div>
              <p className="text-sm font-medium flex items-center gap-2">
                <Layers className="h-4 w-4" />
                Versioner
              </p>
              <p className="text-xs text-muted-foreground">
                Tagga en bild från Content och ge den ett namn för att skapa en version.
              </p>
            </div>

            {draft.versions.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {draft.versions.map((version) => (
                  <div key={version.id} className="rounded-md border border-border overflow-hidden bg-background group/ver">
                    <div className="relative">
                      <ProductThumb image={version.image} className="aspect-square w-full" fallbackLabel={version.name} />
                      <button
                        type="button"
                        onClick={() => removeVersion(version.id)}
                        className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover/ver:opacity-100 transition-opacity"
                        aria-label="Ta bort version"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="px-2 py-1.5">
                      <p className="text-xs font-medium truncate">{version.name}</p>
                      {version.note ? <p className="text-[10px] text-muted-foreground truncate">{version.note}</p> : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="space-y-2">
              <Input
                placeholder="Versionsnamn (t.ex. Röd / Large)"
                value={versionName}
                onChange={(e) => setVersionName(e.target.value)}
              />
              {contentAssets.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                    <Tag className="h-3 w-3" />
                    Bilder markerade i Content — välj en (valfritt)
                  </p>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {contentAssets.map((asset) => {
                      const active = versionAssetId === asset.id;
                      return (
                        <button
                          key={asset.id}
                          type="button"
                          onClick={() => setVersionAssetId(active ? null : asset.id)}
                          className={`shrink-0 h-16 w-16 rounded-md overflow-hidden border-2 transition-colors ${
                            active ? "border-primary" : "border-transparent hover:border-border"
                          }`}
                          title={asset.name}
                        >
                          <img
                            src={asset.thumbnailUrl || asset.previewUrl}
                            alt={asset.name}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Markera bilder i Content-fliken så dyker de upp här som taggbara versioner.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={addVersion} disabled={!versionName.trim()}>
                  <Plus className="h-4 w-4 mr-1.5" />
                  Lägg till version
                </Button>
                {versionAssetId ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const asset = contentAssets.find((a) => a.id === versionAssetId);
                      if (asset) addContentImage(asset);
                    }}
                  >
                    <ImagePlus className="h-4 w-4 mr-1.5" />
                    Lägg till markerad bild i galleri
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-row items-center justify-between sm:justify-between">
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={handleDelete}
            disabled={saving}
          >
            <Trash2 className="h-4 w-4 mr-1.5" />
            Ta bort
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Avbryt
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Spara
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
