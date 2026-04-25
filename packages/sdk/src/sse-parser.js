/**
 * Server-Sent Events (SSE) stream parser.
 *
 * Works in both browser (ReadableStream via fetch) and Node.js (Web Streams API
 * available in Node 18+ or via polyfill). The CAM streaming endpoint sends
 * standard SSE blocks delimited by double newlines.
 *
 * SSE event shape from CAM/be-pfc:
 *   - partial_object: progressive tokens as the LLM generates them
 *   - object_ready:   complete output from a finished cascade layer
 *   - final_response: the complete MessageResponse with full context
 */

/**
 * Parse a single SSE block (delimited by \n\n) into an event object.
 * Returns null if the block contains no data lines.
 *
 * @param {string} block - Raw text of one SSE block.
 * @returns {{ eventName: string, data: unknown } | null}
 */
export function parseSseBlock(block) {
  let eventName = 'message';
  const dataLines = [];

  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).replace(/^\s/, ''));
    }
  }

  if (dataLines.length === 0) return null;

  const raw = dataLines.join('\n');
  if (raw === '[DONE]') return { eventName: 'done', data: null };

  try {
    return { eventName, data: JSON.parse(raw) };
  } catch {
    return { eventName, data: raw };
  }
}

/**
 * Async generator that reads a fetch Response body as an SSE stream and
 * yields parsed { eventName, data } events.
 *
 * Terminates when the stream ends or when the optional AbortSignal fires.
 * The "done" sentinel event is NOT yielded; the generator simply returns.
 *
 * @param {Response} response - A fetch Response with a readable body.
 * @param {{ signal?: AbortSignal }} [options]
 * @yields {import('./types.js').SseEvent}
 */
export async function* parseSseStream(response, { signal } = {}) {
  if (!response.body || typeof response.body.getReader !== 'function') {
    throw new Error('@cogability/sdk: streaming requires a browser or Node 18+ environment with fetch ReadableStream support');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      if (signal?.aborted) break;

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split(/\r?\n\r?\n/);
      buffer = parts.pop() ?? '';

      for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        const event = parseSseBlock(trimmed);
        if (!event || event.eventName === 'done') return;
        yield event;
      }
    }

    // Flush any remaining partial block
    if (buffer.trim()) {
      const event = parseSseBlock(buffer.trim());
      if (event && event.eventName !== 'done') yield event;
    }
  } finally {
    try { reader.cancel(); } catch { /* already closed */ }
  }
}
