/**
 * FederatedImage — render an image whose `src` is an `s3://bucket/key`
 * URI (typically emitted by Engine E when a Neo4j node has an attached
 * procedure diagram extracted by doc-tools).
 *
 * Architecture (Option A): the s3:// URI is forwarded to cortex-bff's
 * GET /federated_image?src=... endpoint. The bff enforces the same JWT
 * + entitled_domains gate the rest of the data path uses, fetches the
 * object from MinIO with its own static credentials, and streams it
 * back. The browser never speaks to MinIO directly — same authz
 * surface as the text answer path.
 *
 * Implementation note: a plain `<img src="/federated_image?src=...">`
 * tag does NOT send the Authorization: Bearer header — we have to
 * `fetch` the image (which DOES carry the header via interceptors) and
 * then convert the response to an object URL the <img> can render.
 *
 * Non-s3:// `src` values (http(s):, data:, blob:) pass through unchanged.
 */
import React, { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import { useAuth } from "react-oidc-context";
import { config } from "@/config";

interface FederatedImageProps {
  src: string;
  alt?: string;
  className?: string;
}

export const FederatedImage: React.FC<FederatedImageProps> = ({ src, alt, className }) => {
  const auth = useAuth();
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Non-s3 sources pass through with no fetch indirection.
    if (!src || !src.startsWith("s3://")) {
      setObjectUrl(src || null);
      setError(src ? null : "no src");
      return;
    }

    let cancelled = false;
    let createdObjectUrl: string | null = null;

    const fetchImage = async () => {
      try {
        const token = auth.user?.access_token;
        if (!token) {
          setError("not authenticated");
          return;
        }
        // transport-exception: raw fetch — carries the caller's OIDC bearer explicitly.
        // Must be raw rather than the axios wrapper because the response is a binary
        // blob (URL.createObjectURL), not JSON. cortex-bff re-checks domain
        // entitlement on /federated_image and 403s if the caller is not entitled.
        const resp = await fetch(
          `${config.VITE_API_URL}/federated_image?src=${encodeURIComponent(src)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!resp.ok) {
          setError(resp.status === 403 ? "not entitled" : `bff ${resp.status}`);
          return;
        }
        const blob = await resp.blob();
        createdObjectUrl = URL.createObjectURL(blob);
        if (!cancelled) {
          setObjectUrl(createdObjectUrl);
          setError(null);
        } else {
          // Component unmounted before we set state — release the URL now.
          URL.revokeObjectURL(createdObjectUrl);
        }
      } catch (e) {
        console.error("FederatedImage fetch failed:", e);
        if (!cancelled) setError("fetch failed");
      }
    };

    fetchImage();

    return () => {
      cancelled = true;
      if (createdObjectUrl) URL.revokeObjectURL(createdObjectUrl);
    };
  }, [src, auth.user?.access_token]);

  if (error) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-black/50 border border-red-500/30 rounded-lg p-4 text-slate-400 ${className}`}
        style={{ minHeight: "200px" }}
      >
        <AlertCircle className="w-8 h-8 text-red-500/50 mb-2" />
        <span className="text-xs font-mono">
          {error === "not entitled" ? "Not Entitled" : "Image Unavailable"}
        </span>
      </div>
    );
  }

  if (!objectUrl) {
    return (
      <div
        className={`animate-pulse bg-white/10 rounded-lg ${className}`}
        style={{ minHeight: "200px" }}
      />
    );
  }

  return <img src={objectUrl} alt={alt} className={className} loading="lazy" />;
};
