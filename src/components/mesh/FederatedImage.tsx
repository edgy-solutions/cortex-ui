import React, { useEffect, useState } from "react";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { fromWebToken } from "@aws-sdk/credential-providers";
import { useAuth } from "react-oidc-context";
import { AlertCircle } from "lucide-react";
import { config } from "@/config";

interface FederatedImageProps {
  src: string;
  alt?: string;
  className?: string;
}

export const FederatedImage: React.FC<FederatedImageProps> = ({ src, alt, className }) => {
  const auth = useAuth();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;

    const fetchPresignedUrl = async () => {
      try {
        if (!src.startsWith("s3://")) {
          // Not an S3 URI, just pass it through
          if (isMounted) setUrl(src);
          return;
        }

        if (!auth.user?.access_token) {
          if (isMounted) setError(true);
          return;
        }

        // S3Client construction notes for MinIO compatibility:
        //
        // - `endpoint` MUST be set when the cluster's object store is
        //   MinIO (sandbox + most prod setups) instead of real AWS S3.
        //   Without it the AWS SDK defaults to
        //   `https://s3.{region}.amazonaws.com` and the request never
        //   reaches MinIO. Sourced from VITE_AWS_S3_ENDPOINT so the
        //   value is operator-tunable per environment.
        //
        // - `forcePathStyle: true` is required by MinIO — it speaks
        //   bucket/path style only, not the virtual-hosted style AWS
        //   uses by default (`{bucket}.s3.amazonaws.com`). Without
        //   this the SDK will compose URLs MinIO rejects.
        //
        // - The STS web-identity flow (`fromWebToken`) requires MinIO
        //   to be configured as an OIDC relying party for the same
        //   Keycloak realm that issued `auth.user.access_token`. See
        //   the MinIO + Keycloak setup notes in the deploy docs;
        //   if STS isn't configured MinIO will reject the AssumeRole
        //   call with a 400 and the image renders "Image Not Authorized".
        const s3Endpoint = config.VITE_AWS_S3_ENDPOINT;
        const s3Client = new S3Client({
          region: config.VITE_AWS_REGION || "us-east-1",
          endpoint: s3Endpoint || undefined,
          forcePathStyle: !!s3Endpoint, // path-style is MinIO's only mode
          credentials: fromWebToken({
            roleArn: config.VITE_AWS_ROLE_ARN || "arn:aws:iam::123456789012:role/KeycloakS3Reader",
            webIdentityToken: auth.user.access_token,
            // The STS call ALSO needs to be routed to MinIO, not AWS.
            // The default fromWebToken provider's clientConfig is used
            // to construct the STS client.
            clientConfig: s3Endpoint ? {
              region: config.VITE_AWS_REGION || "us-east-1",
              endpoint: s3Endpoint,
            } : undefined,
          })
        });

        // Parse s3://bucket/key
        const s3Match = src.match(/^s3:\/\/([^\/]+)\/(.+)$/);
        if (!s3Match) {
          if (isMounted) setUrl(src);
          return;
        }

        const bucket = s3Match[1];
        const key = s3Match[2];

        const command = new GetObjectCommand({ Bucket: bucket, Key: key });
        const presigned = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
        
        if (isMounted) {
          setUrl(presigned);
          setError(false);
        }
      } catch (err) {
        console.error("Failed to load federated image:", err);
        if (isMounted) {
          setError(true);
        }
      }
    };

    fetchPresignedUrl();

    return () => {
      isMounted = false;
    };
  }, [src, auth.user?.access_token]);

  if (error) {
    return (
      <div className={`flex flex-col items-center justify-center bg-black/50 border border-red-500/30 rounded-lg p-4 text-slate-400 ${className}`} style={{ minHeight: '200px' }}>
        <AlertCircle className="w-8 h-8 text-red-500/50 mb-2" />
        <span className="text-xs font-mono">Image Not Authorized</span>
      </div>
    );
  }

  if (!url) {
    return <div className={`animate-pulse bg-white/10 rounded-lg ${className}`} style={{ minHeight: '200px' }} />;
  }

  return <img src={url} alt={alt} className={className} loading="lazy" />;
};