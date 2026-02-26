"use client";

import { usePlayer } from "@/hooks/use-player";

export function PlayerSpacer() {
  const { hideGlobalPlayer, currentEpisode } = usePlayer();

  if (hideGlobalPlayer || !currentEpisode) return null;

  return <div className="h-24" />;
}
