import { searchPosition, type SearchOptions } from "./engine-fallback";

self.onmessage = (
  event: MessageEvent<{ id: number; fen: string; options: SearchOptions }>,
) => {
  try {
    self.postMessage({
      id: event.data.id,
      result: searchPosition(event.data.fen, event.data.options),
    });
  } catch (error) {
    self.postMessage({
      id: event.data.id,
      error: error instanceof Error ? error.message : "Local analysis failed",
    });
  }
};
