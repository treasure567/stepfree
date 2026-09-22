import type { HttpRouter } from "convex/server";
import type { GenericId } from "convex/values";
import { components } from "../_generated/api";
import { httpAction } from "../_generated/server";

const staticPages = {
  "/account": "/account.html",
  "/navigate": "/navigate.html",
  "/proof": "/proof.html",
  "/ops": "/ops.html",
} as const;

const serveStaticPage = (assetPath: string) =>
  httpAction(async (ctx, request) => {
    const asset = await ctx.runQuery(
      components.staticHosting.lib.resolveAssetForHttp,
      {
        path: assetPath,
        spaFallback: false,
      },
    );

    if (!asset) {
      return new Response("Not Found", {
        status: 404,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    const cacheControl = "public, max-age=0, must-revalidate";
    const contentType = asset.contentType || "text/html; charset=utf-8";

    if (
      asset.etag &&
      request.headers
        .get("If-None-Match")
        ?.split(",")
        .map((value) => value.trim())
        .includes(asset.etag)
    ) {
      return new Response(null, {
        status: 304,
        headers: { ETag: asset.etag, "Cache-Control": cacheControl },
      });
    }

    const responseHeaders = {
      "Content-Type": contentType,
      "Cache-Control": cacheControl,
      ...(asset.etag ? { ETag: asset.etag } : {}),
      "X-Content-Type-Options": "nosniff",
    };

    if (asset.appStorageId) {
      const blob = await ctx.storage.get(
        asset.appStorageId as GenericId<"_storage">,
      );

      if (!blob) {
        return new Response("Asset not available", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }

      return new Response(blob, {
        status: 200,
        headers: responseHeaders,
      });
    }

    if (!asset.storageUrl) {
      return new Response("Asset not available", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    const storageResponse = await fetch(asset.storageUrl);

    if (!storageResponse.ok || !storageResponse.body) {
      return new Response("Asset not available", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    return new Response(storageResponse.body, {
      status: 200,
      headers: responseHeaders,
    });
  });

export const registerStaticPageRoutes = (http: HttpRouter) => {
  for (const [path, assetPath] of Object.entries(staticPages)) {
    const handler = serveStaticPage(assetPath);

    http.route({ path, method: "GET", handler });
    http.route({ path: `${path}/`, method: "GET", handler });
  }
};
