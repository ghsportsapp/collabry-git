import { useRef, useState, type ChangeEvent } from "react";

const BASE_URL = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

const IMAGE_MIMES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const PDF_MIME = "application/pdf";

export type FileUploadVisibility = "public" | "private";

export interface FileUploadProps {
  /** Current stored URL/path. Null when nothing uploaded yet. */
  value: string | null;
  /** Called with the new URL after a successful upload, or null on clear. */
  onChange: (url: string | null) => void;
  /** Public uploads go to /api/uploads/image (no auth). Private goes to
   *  /api/uploads/private with bearer auth — requires `getAuthToken`. */
  visibility: FileUploadVisibility;
  /** Required for private uploads. One of: "kyc", "product-issue", "deal-evidence". */
  prefix?: string;
  /** Required when visibility === "private". Returns the bearer token or null. */
  getAuthToken?: () => string | null | undefined;
  /** Comma-separated MIME types accepted. Defaults to images only. */
  accept?: string;
  /** Max file size in MB. Defaults to 5. */
  maxSizeMb?: number;
  /** Whether the file picker accepts PDFs (in addition to images). */
  allowPdf?: boolean;
  /** Optional className for the outer button. */
  className?: string;
  /** Label shown when there's nothing uploaded yet. */
  emptyLabel?: string;
  /** Optional onError handler — defaults to setting an internal error message. */
  onError?: (message: string) => void;
  /** When true, disables interaction. */
  disabled?: boolean;
}

async function compressImage(file: File, maxBytes: number): Promise<Blob> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = dataUrl;
  });
  const canvas = document.createElement("canvas");
  const maxDim = 1600;
  let { width, height } = img;
  if (width > maxDim || height > maxDim) {
    const scale = maxDim / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, width, height);

  let quality = 0.85;
  let blob = await new Promise<Blob>((res) =>
    canvas.toBlob((b) => res(b!), "image/jpeg", quality)
  );
  while (blob.size > maxBytes && quality > 0.4) {
    quality -= 0.1;
    blob = await new Promise<Blob>((res) =>
      canvas.toBlob((b) => res(b!), "image/jpeg", quality)
    );
  }
  return blob;
}

export function FileUpload(props: FileUploadProps) {
  const {
    value,
    onChange,
    visibility,
    prefix,
    getAuthToken,
    accept,
    maxSizeMb = 5,
    allowPdf = false,
    className,
    emptyLabel = "Upload",
    onError,
    disabled,
  } = props;

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reportError = (m: string) => {
    setErr(m);
    onError?.(m);
  };

  const handleFile = async (file: File) => {
    setErr(null);
    if (visibility === "private" && !prefix) {
      reportError("Misconfigured: prefix required for private upload");
      return;
    }
    if (file.size > maxSizeMb * 1024 * 1024) {
      reportError(`File is larger than ${maxSizeMb} MB`);
      return;
    }
    const isPdf = file.type === PDF_MIME;
    const isImage = IMAGE_MIMES.includes(file.type);
    if (!isImage && !(allowPdf && isPdf)) {
      reportError(
        allowPdf ? "Only JPG, PNG, WebP, or PDF allowed" : "Only JPG, PNG, or WebP allowed"
      );
      return;
    }

    setUploading(true);
    setProgress(10);
    try {
      let body: Blob = file;
      let filename = file.name;
      let contentType = file.type;
      if (isImage) {
        const compressed = await compressImage(file, maxSizeMb * 1024 * 1024);
        body = compressed;
        filename = "image.jpg";
        contentType = "image/jpeg";
      }
      setProgress(30);

      const formData = new FormData();
      formData.append("file", new File([body], filename, { type: contentType }));
      if (visibility === "private") {
        formData.append("prefix", prefix!);
      }

      const endpoint =
        visibility === "private"
          ? `${BASE_URL}/api/uploads/private`
          : `${BASE_URL}/api/uploads/image`;
      const headers: Record<string, string> = {};
      if (visibility === "private") {
        const token = getAuthToken?.();
        if (!token) {
          reportError("You need to be signed in to upload this file");
          setUploading(false);
          return;
        }
        headers["Authorization"] = `Bearer ${token}`;
      }

      // Use XHR for upload progress
      const objectPath = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", endpoint);
        for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setProgress(30 + Math.round((e.loaded / e.total) * 65));
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const data = JSON.parse(xhr.responseText) as { objectPath?: string };
              if (data.objectPath) resolve(data.objectPath);
              else reject(new Error("Upload response missing objectPath"));
            } catch {
              reject(new Error("Bad upload response"));
            }
          } else {
            reject(new Error(`Upload failed (${xhr.status})`));
          }
        };
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.send(formData);
      });

      setProgress(100);
      onChange(objectPath);
    } catch (e) {
      reportError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const onChangeInput = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void handleFile(f);
  };

  const acceptAttr =
    accept ??
    (allowPdf ? "image/jpeg,image/png,image/webp,application/pdf" : "image/jpeg,image/png,image/webp");

  const isPdfValue = typeof value === "string" && /\.pdf(\?|$)/i.test(value);

  return (
    <div className={className}>
      <input
        ref={inputRef}
        type="file"
        accept={acceptAttr}
        onChange={onChangeInput}
        disabled={disabled || uploading}
        style={{ display: "none" }}
      />
      {value ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {isPdfValue ? (
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 8,
                background: "rgba(240,24,122,0.10)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#F0187A",
                fontWeight: 700,
                fontSize: 12,
              }}
            >
              PDF
            </div>
          ) : (
            <img
              src={value}
              alt="uploaded"
              style={{
                width: 64,
                height: 64,
                borderRadius: 8,
                objectFit: "cover",
              }}
            />
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={disabled || uploading}
              style={pillButton({ pink: false })}
            >
              Replace
            </button>
            <button
              type="button"
              onClick={() => onChange(null)}
              disabled={disabled || uploading}
              style={pillButton({ pink: false, danger: true })}
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || uploading}
          style={{
            ...pillButton({ pink: true }),
            width: "100%",
            padding: "10px 14px",
          }}
        >
          {uploading ? `Uploading ${progress}%` : emptyLabel}
        </button>
      )}
      {err && (
        <div style={{ color: "#ef4444", fontSize: 12, marginTop: 6 }}>{err}</div>
      )}
    </div>
  );
}

function pillButton({
  pink,
  danger,
}: {
  pink: boolean;
  danger?: boolean;
}): React.CSSProperties {
  return {
    border: 0,
    padding: "8px 14px",
    borderRadius: 8,
    fontFamily: "Poppins, sans-serif",
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
    background: pink
      ? "#F0187A"
      : danger
        ? "rgba(239,68,68,0.10)"
        : "rgba(255,255,255,0.06)",
    color: pink ? "#fff" : danger ? "#ef4444" : "#fff",
  };
}
