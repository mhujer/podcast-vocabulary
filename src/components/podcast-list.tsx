"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Trash2, RefreshCw } from "lucide-react";
import { useState } from "react";

interface PodcastWithCount {
  id: number;
  name: string;
  rssUrl: string;
  latestEpisodeDate: string | null;
  episodeCount: number;
}

export function PodcastList({ podcasts }: { podcasts: PodcastWithCount[] }) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetch("/api/podcasts/refresh", { method: "POST" });
      // Wait a moment for background processing to start, then refresh
      setTimeout(() => router.refresh(), 1000);
    } finally {
      setRefreshing(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this podcast and all its episodes?")) return;
    await fetch(`/api/podcasts/${id}`, { method: "DELETE" });
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
          Refresh All
        </Button>
      </div>

      {podcasts.length === 0 && (
        <p className="text-muted-foreground text-center py-8">
          No podcasts yet. Add one to get started.
        </p>
      )}

      <div className="grid gap-4">
        {podcasts.map((podcast) => (
          <Card key={podcast.id} className="group">
            <CardHeader className="flex flex-row items-start justify-between space-y-0">
              <Link href={`/podcasts/${podcast.id}`} className="flex-1 min-w-0">
                <CardTitle className="text-lg hover:underline">
                  {podcast.name}
                </CardTitle>
                <CardDescription className="mt-1">
                  {podcast.episodeCount} episodes
                  {podcast.latestEpisodeDate && (
                    <> &middot; Latest: {new Date(podcast.latestEpisodeDate).toLocaleDateString()}</>
                  )}
                </CardDescription>
              </Link>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleDelete(podcast.id)}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}
