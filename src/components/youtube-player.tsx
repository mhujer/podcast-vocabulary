"use client";

import { useEffect, useId, useRef } from "react";
import { usePlayer } from "@/hooks/use-player";

// Minimal YouTube IFrame API types
interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlaybackRate(): number;
  setPlaybackRate(rate: number): void;
  getPlayerState(): number;
  destroy(): void;
}

interface YTPlayerEvent {
  target: YTPlayer;
  data: number;
}

declare global {
  interface Window {
    YT?: {
      Player: new (
        elementId: string,
        config: {
          videoId: string;
          playerVars?: Record<string, number | string>;
          events?: {
            onReady?: (event: YTPlayerEvent) => void;
            onStateChange?: (event: YTPlayerEvent) => void;
          };
        }
      ) => YTPlayer;
      PlayerState: {
        PLAYING: number;
        PAUSED: number;
        ENDED: number;
        BUFFERING: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

export function YouTubePlayer({ videoId }: { videoId: string }) {
  const reactId = useId();
  const containerId = `yt-player-${reactId.replace(/:/g, "")}`;
  const playerRef = useRef<YTPlayer | null>(null);
  const { registerYouTubePlayer } = usePlayer();

  useEffect(() => {

    const initPlayer = () => {
      if (!window.YT) return;

      // Destroy previous instance if any
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }

      playerRef.current = new window.YT.Player(containerId, {
        videoId,
        playerVars: {
          autoplay: 0,
          modestbranding: 1,
          rel: 0,
        },
        events: {
          onReady: (event) => {
            console.log("YouTube player ready");
            registerYouTubePlayer(event.target);
          },
          onStateChange: (event) => {
            console.log("YouTube state change:", event.data);
          },
        },
      });
    };

    if (window.YT) {
      initPlayer();
    } else {
      // Load the API script
      const existingScript = document.querySelector(
        'script[src="https://www.youtube.com/iframe_api"]'
      );
      if (!existingScript) {
        const tag = document.createElement("script");
        tag.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(tag);
      }
      window.onYouTubeIframeAPIReady = initPlayer;
    }

    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, [videoId, containerId, registerYouTubePlayer]);

  return (
    <div className="w-full aspect-video bg-black rounded-md overflow-hidden">
      <div id={containerId} className="w-full h-full" />
    </div>
  );
}
