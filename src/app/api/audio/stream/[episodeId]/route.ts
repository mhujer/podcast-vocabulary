import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { episodes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { statSync, createReadStream } from "fs";
import { extname } from "path";

const MIME_TYPES: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".aac": "audio/aac",
  ".opus": "audio/opus",
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ episodeId: string }> }
) {
  const { episodeId } = await params;
  const [episode] = await db
    .select()
    .from(episodes)
    .where(eq(episodes.id, episodeId));

  if (!episode || !episode.filePath) {
    return NextResponse.json({ error: "Audio not available" }, { status: 404 });
  }

  let stat;
  try {
    stat = statSync(episode.filePath);
  } catch {
    return NextResponse.json({ error: "Audio file not found on disk" }, { status: 404 });
  }

  const fileSize = stat.size;
  const ext = extname(episode.filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "audio/mpeg";
  const rangeHeader = request.headers.get("range");

  if (rangeHeader) {
    const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
    if (!match) {
      return new NextResponse("Invalid range", { status: 416 });
    }

    const start = parseInt(match[1], 10);
    const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;

    if (start >= fileSize || end >= fileSize) {
      return new NextResponse("Range not satisfiable", {
        status: 416,
        headers: { "Content-Range": `bytes */${fileSize}` },
      });
    }

    const stream = createReadStream(episode.filePath, { start, end });
    const webStream = streamToReadableStream(stream);

    return new NextResponse(webStream, {
      status: 206,
      headers: {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(end - start + 1),
        "Content-Type": contentType,
      },
    });
  }

  const stream = createReadStream(episode.filePath);
  const webStream = streamToReadableStream(stream);

  return new NextResponse(webStream, {
    status: 200,
    headers: {
      "Content-Length": String(fileSize),
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
    },
  });
}

function streamToReadableStream(
  nodeStream: NodeJS.ReadableStream
): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      nodeStream.on("data", (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk));
      });
      nodeStream.on("end", () => {
        controller.close();
      });
      nodeStream.on("error", (err) => {
        controller.error(err);
      });
    },
    cancel() {
      if ("destroy" in nodeStream && typeof nodeStream.destroy === "function") {
        (nodeStream as ReturnType<typeof import("fs").createReadStream>).destroy();
      }
    },
  });
}
