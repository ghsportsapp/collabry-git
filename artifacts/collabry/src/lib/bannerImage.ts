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
