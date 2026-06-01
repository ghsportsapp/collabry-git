import { useRef, useState } from "react";
import { Upload, X, Loader2 } from "lucide-react";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
const POPPINS = "'Poppins', sans-serif";
const PINK = "#E14F69";
const ALLOWED = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const TARGET_BYTES = 150 * 1024;

async function compressImage(file: File): Promise<Blob> {
  const dataUrl: string = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = e => res(e.target!.result as string);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
  const img: HTMLImageElement = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i); i.onerror = rej;
    i.src = dataUrl;
  });
  const maxDim = 1280;
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  let quality = 0.85;
  let blob: Blob = await new Promise(res => canvas.toBlob(b => res(b!), "image/jpeg", quality));
  while (blob.size > TARGET_BYTES && quality > 0.4) {
    quality -= 0.1;
    blob = await new Promise(res => canvas.toBlob(b => res(b!), "image/jpeg", quality));
  }
  return blob;
}

interface Props {
  value: string[];
  onChange: (urls: string[]) => void;
  max?: number;
  helperText?: string;
  disabled?: boolean;
  onUploadingChange?: (uploading: boolean) => void;
  error?: string | null;
}

export default function MultiImageUpload({
  value, onChange, max = 4,
  helperText = "Upload up to 4 images to increase reach",
  disabled = false, onUploadingChange, error,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<number>(0);
  const [localErr, setLocalErr] = useState<string | null>(null);

  const setUp = (n: number) => {
    setUploading(n);
    onUploadingChange?.(n > 0);
  };

  const uploadOne = async (f: File): Promise<string | null> => {
    if (!ALLOWED.includes(f.type)) {
      setLocalErr("Only JPG, PNG, or WebP images are allowed");
      return null;
    }
    try {
      const blob = await compressImage(f);
      const formData = new FormData();
      formData.append("file", blob, "photo.jpg");
      const r = await fetch(`${BASE_URL}/api/uploads/image`, {
        method: "POST",
        body: formData,
      });
      if (!r.ok) throw new Error("Upload failed");
      const { objectPath } = await r.json();
      return objectPath;
    } catch (e: any) {
      setLocalErr(e.message ?? "Upload failed");
      return null;
    }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setLocalErr(null);
    const remaining = max - value.length;
    if (remaining <= 0) { setLocalErr(`Maximum ${max} images`); return; }
    const picked = Array.from(files).slice(0, remaining);

    setUp(picked.length);
    try {
      const results = await Promise.all(picked.map(uploadOne));
      const newUrls = results.filter((u): u is string => !!u);
      if (newUrls.length > 0) {
        onChange([...value, ...newUrls].slice(0, max));
      }
    } finally {
      setUp(0);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const removeAt = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
  };

  const canAdd = value.length < max && !disabled;
  const errMsg = error || localErr;

  return (
    <div style={{ fontFamily: POPPINS }}>
      <div className="grid grid-cols-4 gap-2">
        {value.map((url, idx) => (
          <div key={idx} className="relative aspect-square rounded-xl overflow-hidden"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)" }}>
            <img src={url} alt="" loading="lazy" className="w-full h-full object-cover" />
            {!disabled && (
              <button type="button" onClick={() => removeAt(idx)}
                className="absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center"
                style={{ background: "rgba(0,0,0,0.65)", border: "1px solid rgba(255,255,255,0.15)" }}>
                <X className="w-3 h-3 text-white" />
              </button>
            )}
          </div>
        ))}

        {canAdd && (
          <button type="button" onClick={() => inputRef.current?.click()}
            disabled={uploading > 0}
            className="aspect-square rounded-xl flex flex-col items-center justify-center gap-1 transition-opacity"
            style={{
              background: "rgba(240,24,122,0.08)",
              border: `1.5px dashed ${errMsg ? "#ef4444" : "rgba(240,24,122,0.40)"}`,
              opacity: uploading > 0 ? 0.6 : 1,
              cursor: uploading > 0 ? "wait" : "pointer",
            }}>
            {uploading > 0
              ? <Loader2 className="w-5 h-5 text-[#E14F69] animate-spin" />
              : <Upload className="w-5 h-5 text-[#E14F69]" />}
            <span className="text-[10px] text-white/70">
              {uploading > 0 ? "Uploading…" : `Add (${value.length}/${max})`}
            </span>
          </button>
        )}
      </div>

      <input ref={inputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp"
        multiple className="hidden" onChange={e => handleFiles(e.target.files)} />

      {helperText && !errMsg && (
        <p className="text-white/70 text-[11px] mt-2">{helperText}</p>
      )}
      {errMsg && <p className="text-red-400 text-[11px] mt-2">{errMsg}</p>}
    </div>
  );
}

export { PINK as IMAGE_UPLOAD_PINK };
