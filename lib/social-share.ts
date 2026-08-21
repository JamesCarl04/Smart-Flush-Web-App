/**
 * Social Sharing Helper Utilities for Klir Platform
 * Generates pre-filled share URLs for Facebook, Twitter/X, LinkedIn, WhatsApp, Telegram,
 * and integrates with the native navigator.share Web API.
 */

export interface ShareData {
  title: string;
  text?: string;
  url: string;
}

export function getShareUrls(data: ShareData) {
  const encodedUrl = encodeURIComponent(data.url);
  const encodedTitle = encodeURIComponent(data.title);
  const encodedText = encodeURIComponent(data.text || data.title);

  return {
    twitter: 'https://twitter.com/intent/tweet?url=' + encodedUrl + '&text=' + encodedText,
    x: 'https://x.com/intent/tweet?url=' + encodedUrl + '&text=' + encodedText,
    facebook: 'https://www.facebook.com/sharer/sharer.php?u=' + encodedUrl,
    linkedin: 'https://www.linkedin.com/sharing/share-offsite/?url=' + encodedUrl,
    whatsapp: 'https://api.whatsapp.com/send?text=' + encodedText + '%20' + encodedUrl,
    telegram: 'https://t.me/share/url?url=' + encodedUrl + '&text=' + encodedText,
  };
}

export async function shareContent(data: ShareData): Promise<boolean> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title: data.title,
        text: data.text,
        url: data.url,
      });
      return true;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        return false;
      }
    }
  }

  // Fallback to clipboard copy if Web Share API is unavailable
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(data.url);
      return true;
    } catch {
      return false;
    }
  }

  return false;
}
