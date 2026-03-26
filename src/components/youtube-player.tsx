"use client";

import { useEffect, useId, useRef } from "react";
import { usePlayer } from "@/hooks/use-player";

// Minimal YouTube IFrame API types
interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getPlaybackRate(): number;
  setPlaybackRate(rate: number): void;
  getPlayerState(): number;
  destroy(): void;
  mute(): void;
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

const SYNC_INTERVAL = 500;
const DRIFT_THRESHOLD = 0.5;

export function YouTubePlayer({ videoId }: { videoId: string }) {
  const reactId = useId();
  const containerId = `yt-player-${reactId.replace(/:/g, "")}`;
  const playerRef = useRef<YTPlayer | null>(null);
  const readyRef = useRef(false);
  const { currentTime, isPlaying, playbackSpeed } = usePlayer();

  // Store latest values in refs for use in interval callback
  const currentTimeRef = useRef(currentTime);
  const playbackSpeedRef = useRef(playbackSpeed);

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    playbackSpeedRef.current = playbackSpeed;
  }, [playbackSpeed]);

  // Initialize YT player
  useEffect(() => {
    const initPlayer = () => {
      if (!window.YT) return;

      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
        readyRef.current = false;
      }

      playerRef.current = new window.YT.Player(containerId, {
        videoId,
        playerVars: {
          autoplay: 0,
          modestbranding: 1,
          rel: 0,
          mute: 1,
        },
        events: {
          onReady: (event) => {
            console.log("YouTube player ready (muted follower)");
            event.target.mute();
            readyRef.current = true;
          },
        },
      });
    };

    if (window.YT) {
      initPlayer();
    } else {
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
        readyRef.current = false;
      }
    };
  }, [videoId, containerId]);

  // Sync play/pause state
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !readyRef.current) return;

    try {
      if (isPlaying) {
        player.playVideo();
      } else {
        player.pauseVideo();
      }
    } catch {
      // player may be destroyed
    }
  }, [isPlaying]);

  // Sync playback speed
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !readyRef.current) return;

    try {
      if (player.getPlaybackRate() !== playbackSpeed) {
        player.setPlaybackRate(playbackSpeed);
      }
    } catch {
      // player may be destroyed
    }
  }, [playbackSpeed]);

  // Periodic drift correction
  useEffect(() => {
    const interval = setInterval(() => {
      const player = playerRef.current;
      if (!player || !readyRef.current) return;

      try {
        const ytTime = player.getCurrentTime();
        const audioTime = currentTimeRef.current;
        const drift = Math.abs(ytTime - audioTime);

        if (drift > DRIFT_THRESHOLD) {
          console.log(`YT drift correction: ${drift.toFixed(2)}s`);
          player.seekTo(audioTime, true);
        }

        // Also sync speed if it drifted
        if (player.getPlaybackRate() !== playbackSpeedRef.current) {
          player.setPlaybackRate(playbackSpeedRef.current);
        }
      } catch {
        // player may be destroyed
      }
    }, SYNC_INTERVAL);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-full aspect-video bg-black rounded-md overflow-hidden">
      <div id={containerId} className="w-full h-full" />
    </div>
  );
}
