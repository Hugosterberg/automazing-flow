import { createZipStore } from "../lib/zipStore.ts";
import { rateLimitMiddleware } from "../lib/rateLimit.ts";
import {
  fetchAlibabaImage,
  fetchAlibabaImagesForZip,
  importAlibabaProduct,
  normalizeAlibabaImageUrl,
  normalizeAlibabaProductUrl,
} from "../providers/alibaba.ts";
import { createShopifyDraftProduct } from "../providers/shopify.ts";

interface EcommerceRoutesDeps {
  getSessionUserId: (req: unknown) => string | null;
  getStoredAccountAccess: (
    stored: Record<string, unknown>,
    userId: string
  ) => { allowed: boolean; migrate: boolean };
  tokenStore: {
    get: (id: string) => Promise<Record<string, unknown> | null | undefined>;
  };
}

function mapImportError(error: unknown): { status: number; error: string; message: string } {
  const code = error instanceof Error ? error.message : "import_failed";
  switch (code) {
    case "missing_url":
      return { status: 400, error: code, message: "Klistra in en Alibaba- eller 1688-länk." };
    case "unsupported_host":
      return {
        status: 400,
        error: code,
        message: "Endast Alibaba.com och 1688.com stöds.",
      };
    case "unsupported_protocol":
    case "invalid_image_url":
      return { status: 400, error: code, message: "URL:en är ogiltig." };
    case "blocked_hostname":
      return { status: 400, error: code, message: "URL:en är inte tillåten." };
    case "product_not_found":
      return {
        status: 422,
        error: code,
        message:
          "Kunde inte läsa produktdata. Alibaba kan kräva inloggning eller blockera automatisk hämtning.",
      };
    case "too_many_redirects":
      return { status: 502, error: code, message: "Produktsidan redirectade för många gånger." };
    case "response_too_large":
    case "image_too_large":
      return { status: 413, error: code, message: "Bilden är för stor att ladda ner." };
    default:
      if (code.startsWith("fetch_failed_")) {
        return { status: 502, error: code, message: "Kunde inte ladda produktsidan." };
      }
      if (code.startsWith("image_fetch_failed_")) {
        return { status: 502, error: code, message: "Kunde inte ladda ner bilden." };
      }
      if (code === "not_an_image") {
        return { status: 400, error: code, message: "Filen är inte en bild." };
      }
      if (code === "unsupported_image_host") {
        return { status: 400, error: code, message: "Bildvärden är inte tillåtna." };
      }
      return { status: 500, error: "import_failed", message: "Kunde inte importera produkten." };
  }
}

function imageExtension(contentType: string): string {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  return "jpg";
}

export function registerEcommerceRoutes(app, deps: EcommerceRoutesDeps) {
  const { getSessionUserId, getStoredAccountAccess, tokenStore } = deps;
  const limitImport = rateLimitMiddleware("ecommerce:alibaba:import", getSessionUserId, 10, 60_000);
  const limitImage = rateLimitMiddleware("ecommerce:alibaba:image", getSessionUserId, 60, 60_000);
  const limitZip = rateLimitMiddleware("ecommerce:alibaba:zip", getSessionUserId, 5, 60_000);
  const limitShopifyCreate = rateLimitMiddleware("ecommerce:shopify:create", getSessionUserId, 10, 60_000);

  app.post("/api/ecommerce/alibaba/import", async (req, res) => {
    if (!limitImport(req, res)) return;
    const userId = getSessionUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "not_authenticated" });
    }

    try {
      normalizeAlibabaProductUrl(req.body?.url);
    } catch (error) {
      const mapped = mapImportError(error);
      return res.status(mapped.status).json({ error: mapped.error, message: mapped.message });
    }

    try {
      const product = await importAlibabaProduct(req.body?.url);
      return res.json({ product });
    } catch (error) {
      const mapped = mapImportError(error);
      return res.status(mapped.status).json({ error: mapped.error, message: mapped.message });
    }
  });

  app.get("/api/ecommerce/alibaba/image", async (req, res) => {
    if (!limitImage(req, res)) return;
    const userId = getSessionUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "not_authenticated" });
    }

    try {
      const { buffer, contentType } = await fetchAlibabaImage(req.query.url);
      const filename = `product.${imageExtension(contentType)}`;
      const download = String(req.query.download || "") === "1";
      res.setHeader("Content-Type", contentType);
      if (download) {
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      }
      res.setHeader("Cache-Control", "private, max-age=3600");
      return res.send(buffer);
    } catch (error) {
      const mapped = mapImportError(error);
      return res.status(mapped.status).json({ error: mapped.error, message: mapped.message });
    }
  });

  app.post("/api/ecommerce/alibaba/images/zip", async (req, res) => {
    if (!limitZip(req, res)) return;
    const userId = getSessionUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "not_authenticated" });
    }

    const images = Array.isArray(req.body?.images) ? req.body.images : [];
    if (images.length === 0) {
      return res.status(400).json({ error: "missing_images", message: "Inga bilder att ladda ner." });
    }

    try {
      for (const imageUrl of images.slice(0, 24)) {
        normalizeAlibabaImageUrl(imageUrl);
      }
      const entries = await fetchAlibabaImagesForZip(images);
      if (entries.length === 0) {
        return res.status(422).json({ error: "no_images_downloaded", message: "Inga bilder kunde laddas ner." });
      }
      const zip = createZipStore(entries);
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", 'attachment; filename="alibaba-product-images.zip"');
      return res.send(zip);
    } catch (error) {
      const mapped = mapImportError(error);
      return res.status(mapped.status).json({ error: mapped.error, message: mapped.message });
    }
  });

  app.post("/api/ecommerce/shopify/:accountId/products", async (req, res) => {
    if (!limitShopifyCreate(req, res)) return;
    const userId = getSessionUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "not_authenticated" });
    }

    const { accountId } = req.params;
    const stored = await tokenStore.get(accountId);
    if (!stored) {
      return res.status(404).json({ error: "Account not connected" });
    }
    const access = getStoredAccountAccess(stored, userId);
    if (!access.allowed) {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (stored.platform !== "shopify") {
      return res.status(400).json({ error: "Account is not a Shopify store" });
    }

    const title = String(req.body?.title || "").trim();
    const description = String(req.body?.description || "").trim();
    const sourceUrl = String(req.body?.sourceUrl || "").trim() || null;
    const price = req.body?.price != null ? String(req.body.price) : null;
    const imageUrls = Array.isArray(req.body?.images) ? req.body.images.slice(0, 10) : [];

    if (!title) {
      return res.status(400).json({ error: "missing_title", message: "Produkttitel saknas." });
    }

    try {
      const shopifyImages = [];
      for (let index = 0; index < imageUrls.length; index++) {
        const { buffer, contentType } = await fetchAlibabaImage(imageUrls[index]);
        shopifyImages.push({
          filename: `product-${index + 1}.${imageExtension(contentType)}`,
          attachment: buffer.toString("base64"),
        });
      }

      const result = await createShopifyDraftProduct(String(stored.accessToken || ""), String(stored.shop || ""), {
        title,
        description,
        price,
        sourceUrl,
        images: shopifyImages,
      });

      if (result.error) {
        return res.status(result.status || 500).json({ error: result.error });
      }
      return res.json(result);
    } catch (error) {
      const mapped = mapImportError(error);
      return res.status(mapped.status).json({ error: mapped.error, message: mapped.message });
    }
  });
}
