import React, { useRef } from 'react';
import '@vidstack/react/player/styles/default/theme.css';
import '@vidstack/react/player/styles/default/layouts/video.css';
import {
  MediaPlayer,
  MediaProvider,
  Poster,
  type MediaPlayerInstance,
} from '@vidstack/react';
import {
  DefaultVideoLayout,
  defaultLayoutIcons,
} from '@vidstack/react/player/layouts/default';
import { Camera } from 'lucide-react';
import { MediaItem } from '@/types/media';

interface VideoPlayerProps {
  item: MediaItem;
  autoPlay?: boolean;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ item, autoPlay = true }) => {
  const playerRef = useRef<MediaPlayerInstance>(null);

  const rawUrl = `/api/media/${item.id}/raw`;
  const posterUrl = `/api/media/${item.id}/thumbnail?size=md`;

  // 創作者專屬：一鍵擷取當前影格並下載為 PNG
  const captureCurrentFrame = () => {
    const video = playerRef.current?.el?.querySelector('video');
    if (!video) return;

    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || video.clientWidth;
      canvas.height = video.videoHeight || video.clientHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        const baseName = item.filename.replace(/\.[^/.]+$/, '');
        const timeSec = Math.floor(video.currentTime);
        link.download = `${baseName}_frame_${timeSec}s.png`;
        link.href = dataUrl;
        link.click();
      }
    } catch (e) {
      console.warn('[VideoPlayer] Frame capture restricted by cross-origin:', e);
    }
  };

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-black overflow-hidden select-none font-mono group/vidstack">
      {/* 頂部快捷動作條：截圖取幀（懸停淡入） */}
      <div className="absolute top-3 left-3 z-30 opacity-0 group-hover/vidstack:opacity-100 transition-opacity duration-150">
        <button
          type="button"
          onClick={captureCurrentFrame}
          className="flex items-center space-x-1.5 px-2 py-1 rounded-sm bg-black/80 backdrop-blur-md border border-neutral-700 hover:border-neutral-400 text-[11px] text-neutral-300 hover:text-white shadow-none transition-colors"
          title="擷取當前畫格為圖片"
        >
          <Camera className="h-3 w-3" />
          <span>截圖</span>
        </button>
      </div>

      {/* Vidstack Modern Media Player */}
      <MediaPlayer
        ref={playerRef}
        key={item.id}
        title={item.title || item.filename}
        src={rawUrl}
        viewType="video"
        streamType="on-demand"
        logLevel="warn"
        playsInline
        autoPlay={autoPlay}
        muted
        className="w-full h-full max-h-[85vh] object-contain overflow-hidden rounded-none border-none font-mono text-white"
        style={{
          '--media-brand': '#ffffff',
          '--media-focus-ring-color': '#ffffff',
          '--video-bg': '#000000',
          '--video-controls-color': '#f4f4f5',
          '--video-font-family': "'JetBrains Mono', monospace",
          '--video-border-radius': '0px',
        }}
      >
        <MediaProvider>
          <Poster
            className="vds-poster object-contain"
            src={posterUrl}
            alt={item.title || item.filename}
          />
        </MediaProvider>

        {/* 內建強大控制列：支援快捷鍵、倍速選單、進度條、畫中畫、全螢幕 */}
        <DefaultVideoLayout
          icons={defaultLayoutIcons}
          noModal={false}
          thumbnails={posterUrl}
        />
      </MediaPlayer>
    </div>
  );
};
