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

interface PlayerState {
  currentEpisode: Episode | null;
  currentPodcast: Podcast | null;
  isPlaying: boolean;
  playbackSpeed: number;
  currentTime: number;
  duration: number;
  segmentEnd: number | null;
  play: (episode: Episode, podcast: Podcast) => void;
  togglePlayPause: () => void;
  seek: (time: number) => void;
  rewind: (seconds: number) => void;
  setSpeed: (speed: number) => void;
  playSegment: (startTime: number, endTime: number) => void;
}

export const PlayerContext = createContext<PlayerState | null>(null);

const SAVE_INTERVAL = 5000;

export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentEpisode, setCurrentEpisode] = useState<Episode | null>(null);
  const [currentPodcast, setCurrentPodcast] = useState<Podcast | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [segmentEnd, setSegmentEnd] = useState<number | null>(null);
  const segmentEndRef = useRef<number | null>(null);
  const saveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentEpisodeRef = useRef<Episode | null>(null);

  // Keep ref in sync
  useEffect(() => {
    currentEpisodeRef.current = currentEpisode;
  }, [currentEpisode]);

  // Create audio element once
  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;

    audio.addEventListener("timeupdate", () => {
      setCurrentTime(audio.currentTime);
      if (segmentEndRef.current !== null && audio.currentTime >= segmentEndRef.current) {
        audio.pause();
        segmentEndRef.current = null;
        setSegmentEnd(null);
      }
    });
    audio.addEventListener("loadedmetadata", () => {
      setDuration(audio.duration);
    });
    audio.addEventListener("play", () => setIsPlaying(true));
    audio.addEventListener("pause", () => setIsPlaying(false));
    audio.addEventListener("ended", () => setIsPlaying(false));

    return () => {
      audio.pause();
      audio.src = "";
    };
  }, []);

  // Periodic position save
  useEffect(() => {
    if (isPlaying && currentEpisode) {
      saveIntervalRef.current = setInterval(() => {
        const ep = currentEpisodeRef.current;
        const audio = audioRef.current;
        if (ep && audio) {
          fetch(`/api/episodes/${ep.id}/playback`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ position: audio.currentTime }),
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

  const play = useCallback(async (episode: Episode, podcast: Podcast) => {
    const audio = audioRef.current;
    if (!audio) return;

    // Save current position before switching
    if (currentEpisodeRef.current && audio.currentTime > 0) {
      fetch(`/api/episodes/${currentEpisodeRef.current.id}/playback`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ position: audio.currentTime }),
      }).catch(console.error);
    }

    setCurrentEpisode(episode);
    setCurrentPodcast(podcast);
    audio.src = `/api/audio/stream/${episode.id}`;

    // Fetch saved position and speed
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
  }, []);

  const togglePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      segmentEndRef.current = null;
      setSegmentEnd(null);
      audio.play().catch(console.error);
    } else {
      audio.pause();
    }
  }, []);

  const seek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (audio) {
      segmentEndRef.current = null;
      setSegmentEnd(null);
      audio.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  const rewind = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (audio) {
      segmentEndRef.current = null;
      setSegmentEnd(null);
      audio.currentTime = Math.max(0, audio.currentTime - seconds);
      setCurrentTime(audio.currentTime);
    }
  }, []);

  const setSpeed = useCallback(
    (speed: number) => {
      const audio = audioRef.current;
      if (audio) {
        audio.playbackRate = speed;
        setPlaybackSpeed(speed);
      }
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
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = startTime;
    setCurrentTime(startTime);
    segmentEndRef.current = endTime;
    setSegmentEnd(endTime);
    audio.play().catch(console.error);
  }, []);

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
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
}
