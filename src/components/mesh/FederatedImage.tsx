import React, { useEffect, useState } from "react";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { fromWebToken } from "@aws-sdk/credential-providers";
import { useAuth } from "react-oidc-context";
import { AlertCircle } from "lucide-react";

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

        const s3Client = new S3Client({
          region: import.meta.env.VITE_AWS_REGION || "us-east-1",
          credentials: fromWebToken({
            roleArn: import.meta.env.VITE_AWS_ROLE_ARN || "arn:aws:iam::123456789012:role/KeycloakS3Reader",
            webIdentityToken: auth.user.access_token
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