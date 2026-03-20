export interface SSEFrame {
  id?: string;
  event?: string;
  data: string;
}

export function parseSSEChunk(chunk: string): SSEFrame[] {
  const frames: SSEFrame[] = [];
  const blocks = chunk.split('\n\n');

  for (const block of blocks) {
    if (!block.trim()) continue;

    const frame: Partial<SSEFrame> & { data: string } = { data: '' };
    const lines = block.split('\n');

    for (const line of lines) {
      if (line.startsWith('id:')) {
        frame.id = line.slice(3).trim();
      } else if (line.startsWith('event:')) {
        frame.event = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        frame.data += (frame.data ? '\n' : '') + line.slice(5).trim();
      }
    }

    if (frame.data || frame.event || frame.id) {
      frames.push(frame as SSEFrame);
    }
  }

  return frames;
}
