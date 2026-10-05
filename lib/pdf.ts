// Builds one PDF from photos and PDFs, entirely in the browser.
// Used for "Merge into one PDF", "Add pages" and combining front/back photos.

import { fileKind, type Doc } from "@/lib/docs";

const PAGE_WIDTH = 595; // A4 width in PDF points
const MAX_SIDE = 2000;

/** Only photos and PDFs can become pages. */
export function canMergeDoc(doc: Pick<Doc, "ext">): boolean {
  return fileKind(doc.ext) !== "other";
}

export function canMergeFile(file: File): boolean {
  return file.type.startsWith("image/") || file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

function isPdf(bytes: Uint8Array): boolean {
  return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // "%PDF"
}

// Redraws a photo the right way up (phone photos are often stored sideways with a
// "rotate me" note that PDFs ignore) and keeps it a sensible size.
async function photoToJpeg(blob: Blob): Promise<ArrayBuffer> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
  } catch {
    throw new Error(
      "One of the photos can't be read on this phone (it may be a HEIC photo). Please take it again with the 📷 Take photo button.",
    );
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!jpeg) throw new Error("Could not prepare one of the photos.");
  return jpeg.arrayBuffer();
}

/** Puts every part, in order, into one PDF. PDFs keep all their pages. */
export async function buildPdf(parts: Blob[]): Promise<File> {
  const { PDFDocument } = await import("pdf-lib");
  const out = await PDFDocument.create();

  for (const part of parts) {
    const bytes = new Uint8Array(await part.arrayBuffer());
    if (isPdf(bytes)) {
      let src;
      try {
        src = await PDFDocument.load(bytes, { ignoreEncryption: true });
      } catch {
        throw new Error("One of the PDFs is locked or damaged and can't be merged.");
      }
      const pages = await out.copyPages(src, src.getPageIndices());
      pages.forEach((page) => out.addPage(page));
    } else {
      const image = await out.embedJpg(await photoToJpeg(part));
      const page = out.addPage([PAGE_WIDTH, (PAGE_WIDTH * image.height) / image.width]);
      page.drawImage(image, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
    }
  }

  const data = await out.save();
  return new File([data as BlobPart], "merged.pdf", { type: "application/pdf" });
}

/** Downloads a saved document's file so it can be merged. */
export async function fetchDocFile(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Could not load one of the documents. Please check your internet.");
  return res.blob();
}
