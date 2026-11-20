/** Client-side prep for landing-page hero banners: 1:1 + size gates, WebP
 *  conversion, and a tiny LQIP used as a blur-up placeholder. Shared by the
 *  creator and brand landing editors. */

const ALLOWED = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;      // matches the server's multer cap
const MAX_DIM = 1440;
const TARGET_BYTES = 400 * 1024;
const QUALITY_START = 0.92;
const QUALITY_FLOOR = 0.82;
const LQIP_DIM = 24;
/** Allow 1% drift so odd pixel dimensions (e.g. 1081×1080) still count as square. */
const RATIO_TOLERANCE = 0.01;

export interface PreparedBanner {
  blob: Blob;
  blurData: string;
}

function readDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = (e) => res(e.target!.result as string);
    r.onerror = () => rej(new Error("Could not read the file"));
    r.readAsDataURL(file);
  });
}

function decode(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error("Could not read the image"));
    i.src = dataUrl;
  });
}

function draw(img: HTMLImageElement, w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
  return canvas;
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((res) => canvas.toBlob((b) => res(b!), "image/webp", quality));
}

/** Validates and converts a picked file. Resolves with `{ error }` for anything
 *  the admin should fix — the caller shows it inline and never hits the network. */
export async function prepareBannerImage(
  file: File,
  // Input cap on the SOURCE file. The image is compressed to a small WebP
  // (≤TARGET_BYTES) before upload regardless, so this only bounds how large a
  // source the browser will decode. Defaults to 5 MB (hero banners); callers
  // that accept a bigger source — e.g. the signup popup — pass a higher value.
  maxBytes: number = MAX_BYTES
): Promise<PreparedBanner | { error: string }> {
  if (!ALLOWED.includes(file.type)) {
    return { error: "Only JPG, PNG, or WebP images are allowed" };
  }
  if (file.size > maxBytes) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    const capMb = Math.round(maxBytes / (1024 * 1024));
    return { error: `Image is ${mb} MB — maximum is ${capMb} MB` };
  }

  let img: HTMLImageElement;
  try {
    img = await decode(await readDataUrl(file));
  } catch (e) {
    return { error: (e as Error).message };
  }

  const { width, height } = img;
  if (Math.abs(width - height) / Math.max(width, height) > RATIO_TOLERANCE) {
    return { error: `Image must be square (1:1) — this one is ${width}×${height}` };
  }

  const side = Math.min(MAX_DIM, Math.max(width, height));
  const canvas = draw(img, side, side);

  let quality = QUALITY_START;
  let blob = await toBlob(canvas, quality);
  while (blob.size > TARGET_BYTES && quality > QUALITY_FLOOR) {
    quality -= 0.05;
    blob = await toBlob(canvas, quality);
  }

  const blurData = draw(img, LQIP_DIM, LQIP_DIM).toDataURL("image/webp", 0.5);

  return { blob, blurData };
}

/** 16:9 variant for the optional DESKTOP hero image. Same pipeline (WebP + LQIP)
 *  as the square one, but validates landscape 16:9 and draws at 16:9. The square
 *  mobile image is unchanged. */
const WIDE_RATIO = 16 / 9;
const WIDE_RATIO_TOLERANCE = 0.03; // ~16:9; tolerates 1920×1080, 1600×900, etc.
const WIDE_MAX_W = 1600;

export async function prepareWideBannerImage(
  file: File
): Promise<PreparedBanner | { error: string }> {
  if (!ALLOWED.includes(file.type)) {
    return { error: "Only JPG, PNG, or WebP images are allowed" };
  }
  if (file.size > MAX_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return { error: `Image is ${mb} MB — maximum is 5 MB` };
  }

  let img: HTMLImageElement;
  try {
    img = await decode(await readDataUrl(file));
  } catch (e) {
    return { error: (e as Error).message };
  }

  const { width, height } = img;
  if (Math.abs(width / height - WIDE_RATIO) / WIDE_RATIO > WIDE_RATIO_TOLERANCE) {
    return { error: `Desktop image must be 16:9 (landscape) — this one is ${width}×${height}` };
  }

  const w = Math.min(WIDE_MAX_W, width);
  const h = Math.round(w / WIDE_RATIO);
  const canvas = draw(img, w, h);

  let quality = QUALITY_START;
  let blob = await toBlob(canvas, quality);
  while (blob.size > TARGET_BYTES && quality > QUALITY_FLOOR) {
    quality -= 0.05;
    blob = await toBlob(canvas, quality);
  }

  const blurData = draw(img, 32, 18).toDataURL("image/webp", 0.5);

  return { blob, blurData };
}

/** Any-ratio variant — same WebP + size-target + LQIP pipeline as the square
 *  banner image, but with NO aspect-ratio gate. Used for Success-Story posters,
 *  which can be any ratio and are object-cover'd into the 9:16 frame. Longest side
 *  scaled down to MAX_DIM; compressed toward TARGET_BYTES. */
export async function prepareImageAnyRatio(
  file: File
): Promise<PreparedBanner | { error: string }> {
  if (!ALLOWED.includes(file.type)) {
    return { error: "Only JPG, PNG, or WebP images are allowed" };
  }
  if (file.size > MAX_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return { error: `Image is ${mb} MB — maximum is 5 MB` };
  }

  let img: HTMLImageElement;
  try {
    img = await decode(await readDataUrl(file));
  } catch (e) {
    return { error: (e as Error).message };
  }

  const { width, height } = img;
  if (!width || !height) return { error: "Could not read the image" };

  const scale = Math.min(1, MAX_DIM / Math.max(width, height));
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  const canvas = draw(img, w, h);

  let quality = QUALITY_START;
  let blob = await toBlob(canvas, quality);
  while (blob.size > TARGET_BYTES && quality > QUALITY_FLOOR) {
    quality -= 0.05;
    blob = await toBlob(canvas, quality);
  }

  // LQIP keeps the source aspect so the blur-up doesn't distort.
  const lw = w >= h ? LQIP_DIM : Math.max(1, Math.round((LQIP_DIM * w) / h));
  const lh = h >= w ? LQIP_DIM : Math.max(1, Math.round((LQIP_DIM * h) / w));
  const blurData = draw(img, lw, lh).toDataURL("image/webp", 0.5);

  return { blob, blurData };
}
