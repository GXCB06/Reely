// Clip links pasted into the chat. Shared by the client (to show what will happen) and the server.

export type ClipLink = { platform: "instagram" | "tiktok"; id: string | null; url: string };

/** The first link in the text to one Instagram reel/post or TikTok video, or null (product links etc.). */
export function parseClipLink(text: string): ClipLink | null {
  // instagram.com/reel/CODE, /reels/, /p/, /tv/, and the newer instagram.com/<user>/reel/CODE
  const ig = text.match(/(?:https?:\/\/)?(?:www\.|m\.)?instagram\.com\/(?:[\w.]+\/)?(?:reels?|p|tv)\/([\w-]{5,})/i);
  if (ig) return { platform: "instagram", id: ig[1], url: `https://www.instagram.com/reel/${ig[1]}/` };
  const tt = text.match(/(?:https?:\/\/)?(?:www\.|m\.)?tiktok\.com\/(@[\w.-]+)\/video\/(\d{8,})/i);
  if (tt) return { platform: "tiktok", id: tt[2], url: `https://www.tiktok.com/${tt[1]}/video/${tt[2]}` };
  // Share links (vm./vt.tiktok.com/XXXX) hide the id until the vendor resolves them.
  const short = text.match(/(?:https?:\/\/)?(vm|vt)\.tiktok\.com\/([\w-]+)/i);
  if (short) return { platform: "tiktok", id: null, url: `https://${short[1].toLowerCase()}.tiktok.com/${short[2]}/` };
  return null;
}
