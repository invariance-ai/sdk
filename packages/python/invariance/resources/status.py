from __future__ import annotations

from typing import Any, Callable

from ..http_client import HttpClient
from ..types import LiveStatusEvent, LiveStatusSnapshot


class LiveStatusConnection:
    def __init__(self, close_fn: Callable[[], None]) -> None:
        self._close_fn = close_fn

    def close(self) -> None:
        self._close_fn()


class StatusResource:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    async def snapshot(self) -> LiveStatusSnapshot:
        return await self._http.get("/v1/status/live")

    async def connect(
        self, on_event: Callable[[LiveStatusEvent], None]
    ) -> LiveStatusConnection:
        import asyncio
        import json

        response = await self._http.raw(
            "/v1/status/live", headers={"Accept": "text/event-stream"}
        )

        aborted = False

        async def process_stream() -> None:
            nonlocal aborted
            buffer = ""
            event_type = ""
            event_data = ""

            async for chunk in response.aiter_text():
                if aborted:
                    break
                buffer += chunk
                lines = buffer.split("\n")
                buffer = lines.pop()

                for line in lines:
                    if line.startswith("event:"):
                        event_type = line[6:].strip()
                    elif line.startswith("data:"):
                        event_data = line[5:].strip()
                    elif line == "":
                        if event_type and event_data:
                            try:
                                parsed = json.loads(event_data)
                                on_event(parsed)
                            except Exception:
                                pass
                        event_type = ""
                        event_data = ""

        task = asyncio.get_running_loop().create_task(process_stream())

        def close() -> None:
            nonlocal aborted
            aborted = True
            task.cancel()

        return LiveStatusConnection(close)
