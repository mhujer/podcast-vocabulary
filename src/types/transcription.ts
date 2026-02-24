export interface TranscriptionWord {
  start: number;
  end: number;
  word: string;
}

export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
  words?: TranscriptionWord[];
}
