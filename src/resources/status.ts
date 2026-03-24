import type { HttpClient } from '../http.js';
import type { LiveStatusEvent } from '../types/misc.js';

export type StatusEventHandler = (event: LiveStatusEvent) => void;

export interface LiveStatusConnection {
  close(): void;
}

export class StatusResource {
  constructor(private http: HttpClient) {}

  async connect(onEvent: StatusEventHandler): Promise<LiveStatusConnection> {
    const response = await this.http.raw('/v1/status/live', {
      headers: { Accept: 'text/event-stream' },
    });

    if (!response.body) {
      throw new Error('SSE: No response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let aborted = false;

    const processStream = async () => {
      while (!aborted) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        let eventType = '';
        let eventData = '';

        for (const line of lines) {
          if (line.startsWith('event:')) {
            eventType = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            eventData = line.slice(5).trim();
          } else if (line === '') {
            if (eventType && eventData) {
              try {
                const data = JSON.parse(eventData);
                onEvent({ type: eventType as LiveStatusEvent['type'], data });
              } catch {
                onEvent({ type: eventType as LiveStatusEvent['type'], data: eventData });
              }
            }
            eventType = '';
            eventData = '';
          }
        }
      }
    };

    processStream().catch(() => {});

    return {
      close() {
        aborted = true;
        reader.cancel().catch(() => {});
      },
    };
  }
}
