import type { SseEvent } from './types.js';

/**
 * Parse a single SSE block (delimited by \n\n) into an event object.
 * Returns null if the block contains no data lines.
 */
export function parseSseBlock(block: string): SseEvent | null;

/**
 * Async generator that parses a streaming fetch Response body as SSE events.
 * Yields SseEvent objects until the stream ends or the AbortSignal fires.
 */
export function parseSseStream(
  response: Response,
  options?: { signal?: AbortSignal }
): AsyncGenerator<SseEvent, void, unknown>;
