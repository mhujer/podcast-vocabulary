"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Episode, Podcast } from "@/db/schema";

// Minimal YouTube player interface matching what we use
export interface YTPlayerInstance {
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

interface PlayerState {
  currentEpisode: Episode | null;
  currentPodcast: Podcast | null;
  isPlaying: boolean;
  playbackSpeed: number;
  currentTime: number;
  duration: number;
  segmentEnd: number | null;
  youtubeVideoId: string | null;
  play: (episode: Episode, podcast: Podcast) => void;
  togglePlayPause: () => void;
  seek: (time: number) => void;
  rewind: (seconds: number) => void;
  setSpeed: (speed: number) => void;
  playSegment: (startTime: number, endTime: number) => void;
  stop: () => void;
  registerYouTubePlayer: (player: YTPlayerInstance) => void;
}

export const PlayerContext = createContext<PlayerState | null>(null);

const SAVE_INTERVAL = 5000;
const YT_POLL_INTERVAL = 100;

// YouTube PlayerState constants
const YT_PLAYING = 1;
const YT_BUFFERING = 3;

export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ytPlayerRef = useRef<YTPlayerInstance | null>(null);
  const isYouTubeModeRef = useRef(false);
  const ytPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [currentEpisode, setCurrentEpisode] = useState<Episode | null>(null);
  const [currentPodcast, setCurrentPodcast] = useState<Podcast | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [segmentEnd, setSegmentEnd] = useState<number | null>(null);
  const [youtubeVideoId, setYoutubeVideoId] = useState<string | null>(null);
  const segmentEndRef = useRef<number | null>(null);
  const seekingUntilRef = useRef<number>(0);
  const saveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentEpisodeRef = useRef<Episode | null>(null);

  // Keep ref in sync
  useEffect(() => {
    currentEpisodeRef.current = currentEpisode;
  }, [currentEpisode]);

  const stopYtPolling = useCallback(() => {
    if (ytPollRef.current) {
      clearInterval(ytPollRef.current);
      ytPollRef.current = null;
    }
  }, []);

  const startYtPolling = useCallback(() => {
    stopYtPolling();
    ytPollRef.current = setInterval(() => {
      const player = ytPlayerRef.current;
      if (!player) return;

      try {
        const time = player.getCurrentTime();
        const state = player.getPlayerState();
        if (Date.now() >= seekingUntilRef.current && state !== YT_BUFFERING) {
          setCurrentTime(time);
        }

        const dur = player.getDuration();
        if (dur > 0) setDuration(dur);

        setIsPlaying(state === YT_PLAYING);

        // Check segment end
        if (segmentEndRef.current !== null && time >= segmentEndRef.current) {
          player.pauseVideo();
          segmentEndRef.current = null;
          setSegmentEnd(null);
        }
      } catch {
        // player may be destroyed
      }
    }, YT_POLL_INTERVAL);
  }, [stopYtPolling]);

  // Create audio element once
  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;

    audio.addEventListener("timeupdate", () => {
      if (!isYouTubeModeRef.current) {
        setCurrentTime(audio.currentTime);
        if (segmentEndRef.current !== null && audio.currentTime >= segmentEndRef.current) {
          audio.pause();
          segmentEndRef.current = null;
          setSegmentEnd(null);
        }
      }
    });
    audio.addEventListener("loadedmetadata", () => {
      if (!isYouTubeModeRef.current) {
        setDuration(audio.duration);
      }
    });
    audio.addEventListener("play", () => {
      if (!isYouTubeModeRef.current) setIsPlaying(true);
    });
    audio.addEventListener("pause", () => {
      if (!isYouTubeModeRef.current) setIsPlaying(false);
    });
    audio.addEventListener("ended", () => {
      if (!isYouTubeModeRef.current) setIsPlaying(false);
    });

    return () => {
      audio.pause();
      audio.src = "";
    };
  }, []);

  // Periodic position save (works for both modes)
  useEffect(() => {
    if (isPlaying && currentEpisode) {
      saveIntervalRef.current = setInterval(() => {
        const ep = currentEpisodeRef.current;
        if (!ep) return;

        let position: number | undefined;
        if (isYouTubeModeRef.current && ytPlayerRef.current) {
          try {
            position = ytPlayerRef.current.getCurrentTime();
          } catch { /* player destroyed */ }
        } else if (audioRef.current) {
          position = audioRef.current.currentTime;
        }

        if (position !== undefined) {
          fetch(`/api/episodes/${ep.id}/playback`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ position }),
          }).catch(console.error);
        }
      }, SAVE_INTERVAL);
    }

    return () => {
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
        saveIntervalRef.current = null;
      }
    };
  }, [isPlaying, currentEpisode]);

  const registerYouTubePlayer = useCallback((player: YTPlayerInstance) => {
    console.log("YouTube player registered");
    ytPlayerRef.current = player;

    // Set duration from YouTube player
    try {
      const dur = player.getDuration();
      if (dur > 0) setDuration(dur);
    } catch { /* not ready yet */ }

    // Restore saved position and speed, then start playback
    const ep = currentEpisodeRef.current;
    if (ep) {
      fetch(`/api/episodes/${ep.id}/playback`)
        .then((res) => res.json())
        .then((data) => {
          if (data.position) {
            player.seekTo(data.position, true);
          }
          if (data.speed) {
            player.setPlaybackRate(data.speed);
            setPlaybackSpeed(data.speed);
          }
          // Update duration after seek (may be available now)
          const dur = player.getDuration();
          if (dur > 0) setDuration(dur);

          player.playVideo();
          startYtPolling();
        })
        .catch(() => {
          player.playVideo();
          startYtPolling();
        });
    }
  }, [startYtPolling]);

  const play = useCallback(async (episode: Episode, podcast: Podcast) => {
    // Save current position before switching
    if (currentEpisodeRef.current) {
      let position: number | undefined;
      if (isYouTubeModeRef.current && ytPlayerRef.current) {
        try { position = ytPlayerRef.current.getCurrentTime(); } catch { /* */ }
      } else if (audioRef.current && audioRef.current.currentTime > 0) {
        position = audioRef.current.currentTime;
      }
      if (position !== undefined && position > 0) {
        fetch(`/api/episodes/${currentEpisodeRef.current.id}/playback`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ position }),
        }).catch(console.error);
      }
    }

    // Stop previous playback
    stopYtPolling();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }

    const isYT = !!episode.youtubeVideoId;
    isYouTubeModeRef.current = isYT;

    setCurrentEpisode(episode);
    setCurrentPodcast(podcast);
    setYoutubeVideoId(episode.youtubeVideoId ?? null);
    setCurrentTime(0);
    setDuration(0);

    if (isYT) {
      // YouTube mode: the YouTubePlayer component will call registerYouTubePlayer
      // which handles seeking to saved position + starting playback
      console.log("YouTube mode: waiting for player registration");
    } else {
      // Audio mode
      const audio = audioRef.current;
      if (!audio) return;
      audio.src = `/api/audio/stream/${episode.id}`;

      try {
        const res = await fetch(`/api/episodes/${episode.id}/playback`);
        const data = await res.json();
        if (data.position) {
          audio.currentTime = data.position;
        }
        if (data.speed) {
          audio.playbackRate = data.speed;
          setPlaybackSpeed(data.speed);
        }
      } catch {
        // use defaults
      }

      audio.play().catch(console.error);
    }
  }, [stopYtPolling]);

  const togglePlayPause = useCallback(() => {
    if (isYouTubeModeRef.current) {
      const player = ytPlayerRef.current;
      if (!player) return;
      const state = player.getPlayerState();
      if (state === YT_PLAYING) {
        player.pauseVideo();
        stopYtPolling();
        setIsPlaying(false);
      } else {
        segmentEndRef.current = null;
        setSegmentEnd(null);
        player.playVideo();
        startYtPolling();
        setIsPlaying(true);
      }
    } else {
      const audio = audioRef.current;
      if (!audio) return;
      if (audio.paused) {
        segmentEndRef.current = null;
        setSegmentEnd(null);
        audio.play().catch(console.error);
      } else {
        audio.pause();
      }
    }
  }, [startYtPolling, stopYtPolling]);

  const seek = useCallback((time: number) => {
    segmentEndRef.current = null;
    setSegmentEnd(null);
    seekingUntilRef.current = Date.now() + 500;
    setCurrentTime(time);

    if (isYouTubeModeRef.current) {
      ytPlayerRef.current?.seekTo(time, true);
    } else {
      const audio = audioRef.current;
      if (audio) audio.currentTime = time;
    }
  }, []);

  const rewind = useCallback((seconds: number) => {
    segmentEndRef.current = null;
    setSegmentEnd(null);

    if (isYouTubeModeRef.current) {
      const player = ytPlayerRef.current;
      if (!player) return;
      const newTime = Math.max(0, player.getCurrentTime() - seconds);
      seekingUntilRef.current = Date.now() + 500;
      player.seekTo(newTime, true);
      setCurrentTime(newTime);
    } else {
      const audio = audioRef.current;
      if (audio) {
        audio.currentTime = Math.max(0, audio.currentTime - seconds);
        setCurrentTime(audio.currentTime);
      }
    }
  }, []);

  const setSpeed = useCallback(
    (speed: number) => {
      if (isYouTubeModeRef.current) {
        ytPlayerRef.current?.setPlaybackRate(speed);
      } else {
        const audio = audioRef.current;
        if (audio) audio.playbackRate = speed;
      }
      setPlaybackSpeed(speed);

      if (currentEpisodeRef.current) {
        fetch(`/api/episodes/${currentEpisodeRef.current.id}/playback`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ speed }),
        }).catch(console.error);
      }
    },
    []
  );

  const playSegment = useCallback((startTime: number, endTime: number) => {
    segmentEndRef.current = endTime;
    setSegmentEnd(endTime);
    seekingUntilRef.current = Date.now() + 500;
    setCurrentTime(startTime);

    if (isYouTubeModeRef.current) {
      const player = ytPlayerRef.current;
      if (!player) return;
      player.seekTo(startTime, true);
      player.playVideo();
      startYtPolling();
    } else {
      const audio = audioRef.current;
      if (!audio) return;
      audio.currentTime = startTime;
      audio.play().catch(console.error);
    }
  }, [startYtPolling]);

  const stop = useCallback(() => {
    const ep = currentEpisodeRef.current;

    // Save position
    let position: number | undefined;
    if (isYouTubeModeRef.current && ytPlayerRef.current) {
      try { position = ytPlayerRef.current.getCurrentTime(); } catch { /* */ }
    } else if (audioRef.current && audioRef.current.currentTime > 0) {
      position = audioRef.current.currentTime;
    }

    if (ep && position !== undefined && position > 0) {
      fetch(`/api/episodes/${ep.id}/playback`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ position }),
      }).catch(console.error);
    }

    // Stop playback
    stopYtPolling();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
    }
    isYouTubeModeRef.current = false;
    ytPlayerRef.current = null;

    setCurrentEpisode(null);
    setCurrentPodcast(null);
    setCurrentTime(0);
    setDuration(0);
    setYoutubeVideoId(null);
    segmentEndRef.current = null;
    setSegmentEnd(null);
  }, [stopYtPolling]);

  return (
    <PlayerContext.Provider
      value={{
        currentEpisode,
        currentPodcast,
        isPlaying,
        playbackSpeed,
        currentTime,
        duration,
        play,
        togglePlayPause,
        seek,
        rewind,
        setSpeed,
        segmentEnd,
        playSegment,
        stop,
        youtubeVideoId,
        registerYouTubePlayer,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
}
