import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { flashcards } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { generateText, Output } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

const flashcardSchema = z.object({
  baseForm: z
    .string()
    .describe(
      "Dictionary/base form of the word or canonical form of the phrase"
    ),
  translation: z
    .string()
    .describe("Czech translation in context of the sentence"),
});

export async function POST(req: NextRequest) {
  const { episodeId, segmentIndex, sentenceText, selectedWords } =
    await req.json();

  console.log(
    `[flashcards] Creating flashcard: episode=${episodeId} segment=${segmentIndex} words="${selectedWords}"`
  );

  const { output } = await generateText({
    model: openai("gpt-5.2"),
    output: Output.object({ schema: flashcardSchema }),
    prompt: `You are a German-Czech language assistant helping build vocabulary flashcards.

Given a German sentence from a podcast and a highlighted word or phrase from it, return:
- baseForm: the dictionary/base form of the highlighted word(s) in German. For verbs use infinitive, for nouns use nominative singular with article (e.g. "der Hund"), for adjectives use base form. If it's an idiom or multi-word phrase, return the phrase in its canonical form.
- translation: the Czech translation of the highlighted word(s), translated in the context of the given sentence.

Sentence: "${sentenceText}"
Highlighted: "${selectedWords}"`,
  });

  if (!output) {
    return NextResponse.json(
      { error: "LLM returned no output" },
      { status: 500 }
    );
  }

  const front = `${output.baseForm}\n\n(${sentenceText})`;
  const back = output.translation;

  const [card] = await db
    .insert(flashcards)
    .values({
      episodeId,
      segmentIndex,
      front,
      back,
      selectedText: selectedWords,
    })
    .returning();

  console.log(`[flashcards] Created flashcard id=${card.id}`);
  return NextResponse.json(card);
}

export async function GET(req: NextRequest) {
  const episodeId = req.nextUrl.searchParams.get("episodeId");
  if (!episodeId) {
    return NextResponse.json(
      { error: "episodeId required" },
      { status: 400 }
    );
  }

  const cards = await db
    .select()
    .from(flashcards)
    .where(eq(flashcards.episodeId, episodeId))
    .orderBy(asc(flashcards.segmentIndex), asc(flashcards.createdAt));

  return NextResponse.json(cards);
}
