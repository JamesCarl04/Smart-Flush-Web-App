'use client';

import React, { useState } from 'react';
import { Share2, Check, Copy, Twitter, Facebook, Linkedin, Send } from 'lucide-react';
import { getShareUrls, shareContent, ShareData } from '@/lib/social-share';

interface SocialShareProps {
  title?: string;
  text?: string;
  url?: string;
  className?: string;
}

export const SocialShare: React.FC<SocialShareProps> = ({
  title = 'Klir | IoT Smart Flush & UV Disinfection Platform',
  text = 'Real-time telemetry, automated disinfection status, and maintenance controls.',
  url,
  className = '',
}) => {
  const [copied, setCopied] = useState(false);
  const shareUrl =
    url || (typeof window !== 'undefined' ? window.location.href : 'https://kliradmin.vercel.app');

  const shareData: ShareData = {
    title,
    text,
    url: shareUrl,
  };

  const urls = getShareUrls(shareData);

  const handleNativeShare = async () => {
    const success = await shareContent(shareData);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleCopy = async () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <button
        onClick={handleNativeShare}
        className="btn btn-sm btn-outline gap-1.5 text-xs font-medium"
        title="Share via native device dialog"
      >
        <Share2 className="w-3.5 h-3.5" />
        Share
      </button>

      <a
        href={urls.x}
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn-sm btn-ghost btn-circle"
        title="Share on X (Twitter)"
      >
        <Twitter className="w-4 h-4" />
      </a>

      <a
        href={urls.facebook}
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn-sm btn-ghost btn-circle"
        title="Share on Facebook"
      >
        <Facebook className="w-4 h-4" />
      </a>

      <a
        href={urls.linkedin}
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn-sm btn-ghost btn-circle"
        title="Share on LinkedIn"
      >
        <Linkedin className="w-4 h-4" />
      </a>

      <a
        href={urls.telegram}
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn-sm btn-ghost btn-circle"
        title="Share on Telegram"
      >
        <Send className="w-3.5 h-3.5" />
      </a>

      <button
        onClick={handleCopy}
        className="btn btn-sm btn-ghost gap-1 text-xs"
        title="Copy Link to Clipboard"
      >
        {copied ? (
          <>
            <Check className="w-3.5 h-3.5 text-success" />
            <span className="text-success">Copied</span>
          </>
        ) : (
          <>
            <Copy className="w-3.5 h-3.5" />
            <span>Copy</span>
          </>
        )}
      </button>
    </div>
  );
};
