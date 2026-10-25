/** Resizes an image file in the browser to a JPEG data URL no wider/taller than `max` pixels. */
export async function resizeImage(file: File, max: number, quality: number): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", quality);
}

/** First http(s) URL or bare domain (like accospro.app) in a message, if any. */
export function findLink(text: string): string | null {
  const m = text.match(/\bhttps?:\/\/[^\s]+|\b(?:[a-z0-9-]+\.)+(?:com|app|io|co|ai|dev|net|org|th|xyz|me|so|shop|store)(?:\/[^\s]*)?/i);
  return m ? m[0].replace(/[),.;!?]+$/, "") : null;
}

export function hostOf(link: string): string {
  try {
    return new URL(/^https?:\/\//i.test(link) ? link : `https://${link}`).hostname.replace(/^www\./, "");
  } catch {
    return link;
  }
}
