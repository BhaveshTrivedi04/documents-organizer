// Browser helpers for opening and saving a document's file.

import { downloadFileName, type Doc } from "@/lib/docs";

export function fileUrl(doc: Doc, download = false) {
  return `/api/file?p=${encodeURIComponent(doc.pathname)}${download ? "&download=1" : ""}`;
}

/**
 * Saves the file to the phone without leaving the app. Following a plain link
 * would open the file on its own screen, and in the installed app there is no
 * way back from there.
 */
export async function downloadDoc(doc: Doc) {
  const res = await fetch(fileUrl(doc, true));
  if (!res.ok) throw new Error("Could not download. Please check your internet and try again.");
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = downloadFileName(doc);
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
