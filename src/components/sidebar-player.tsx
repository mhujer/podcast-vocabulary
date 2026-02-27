"use client";

import { useEffect } from "react";
import { usePlayer } from "@/hooks/use-player";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Play, Pause, RotateCcw, Minus, Plus } from "lucide-react";

const SPEED_OPTIONS = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.0];

function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function SidebarPlayer() {
  const {
    currentEpisode,
    isPlaying,
    playbackSpeed,
    currentTime,
    duration,
    togglePlayPause,
    seek,
    rewind,
    setSpeed,
    stop,
  } = usePlayer();

  useEffect(() => {
    return () => stop();
  }, [stop]);

  if (!currentEpisode) return null;

  const currentSpeedIndex = SPEED_OPTIONS.indexOf(playbackSpeed);

  const decreaseSpeed = () => {
    if (currentSpeedIndex > 0) {
      setSpeed(SPEED_OPTIONS[currentSpeedIndex - 1]);
    }
  };

  const increaseSpeed = () => {
    if (currentSpeedIndex < SPEED_OPTIONS.length - 1) {
      setSpeed(SPEED_OPTIONS[currentSpeedIndex + 1]);
    }
  };

  return (
    <div className="space-y-2">
      <Slider
        value={[currentTime]}
        max={duration || 100}
        step={1}
        onValueChange={([v]) => seek(v)}
        className="w-full"
      />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>
      <div className="flex items-center justify-center gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => rewind(10)} title="Rewind 10s">
          <RotateCcw className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={togglePlayPause}>
          {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={decreaseSpeed}
          disabled={currentSpeedIndex <= 0}
          title="Decrease speed"
        >
          <Minus className="h-3 w-3" />
        </Button>
        <span className="text-xs min-w-[3rem] text-center select-none">
          {playbackSpeed.toFixed(1)}x
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={increaseSpeed}
          disabled={currentSpeedIndex >= SPEED_OPTIONS.length - 1}
          title="Increase speed"
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
