"use client";

import { usePlayer } from "@/hooks/use-player";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Play, Pause, RotateCcw } from "lucide-react";

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

export function PlayerBar() {
  const {
    currentEpisode,
    currentPodcast,
    isPlaying,
    playbackSpeed,
    currentTime,
    duration,
    togglePlayPause,
    seek,
    rewind,
    setSpeed,
  } = usePlayer();

  if (!currentEpisode) return null;

  const cycleSpeed = () => {
    const currentIndex = SPEED_OPTIONS.indexOf(playbackSpeed);
    const nextIndex = (currentIndex + 1) % SPEED_OPTIONS.length;
    setSpeed(SPEED_OPTIONS[nextIndex]);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-background border-t border-border px-4 py-3 z-50">
      <div className="max-w-5xl mx-auto flex items-center gap-4">
        {/* Episode info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{currentEpisode.title}</p>
          <p className="text-xs text-muted-foreground truncate">
            {currentPodcast?.name}
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => rewind(10)} title="Rewind 10s">
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={togglePlayPause}>
            {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={cycleSpeed}
            className="text-xs min-w-[3.5rem]"
            title="Playback speed"
          >
            {playbackSpeed.toFixed(1)}x
          </Button>
        </div>

        {/* Time + slider */}
        <div className="flex items-center gap-2 flex-1">
          <span className="text-xs text-muted-foreground w-12 text-right">
            {formatTime(currentTime)}
          </span>
          <Slider
            value={[currentTime]}
            max={duration || 100}
            step={1}
            onValueChange={([v]) => seek(v)}
            className="flex-1"
          />
          <span className="text-xs text-muted-foreground w-12">
            {formatTime(duration)}
          </span>
        </div>
      </div>
    </div>
  );
}
