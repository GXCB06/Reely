// Official embed players, so clips play inside Reely (pure: used by client components and tested directly).

export type EmbedPlatform = "tiktok" | "youtube" | "instagram";

/**
 * The player URL for a clip. `preview`: muted, no controls, looping (hover previews on cards); otherwise a normal
 * player with sound and controls. Instagram's embed can't autoplay or hide its controls, so it has no preview.
 */
export function embedUrl(platform: EmbedPlatform, id: string, preview = false): string | null {
  if (!id) return null;
  if (platform === "tiktok") {
    if (!/^\d+$/.test(id)) return null;
    const base = "autoplay=1&loop=1&rel=0&description=0&music_info=0&native_context_menu=0&closed_caption=0";
    const quiet = "&muted=1&controls=0&progress_bar=0&play_button=0&volume_control=0&fullscreen_button=0&timestamp=0";
    return `https://www.tiktok.com/player/v1/${id}?${base}${preview ? quiet : ""}`;
  }
  if (platform === "youtube") {
    if (!/^[\w-]{6,20}$/.test(id)) return null;
    const base = `autoplay=1&playsinline=1&rel=0&modestbranding=1&loop=1&playlist=${id}`;
    return `https://www.youtube-nocookie.com/embed/${id}?${base}${preview ? "&mute=1&controls=0&disablekb=1" : ""}`;
  }
  if (preview || !/^[\w-]{5,}$/.test(id)) return null;
  return `https://www.instagram.com/reel/${id}/embed/`;
}
