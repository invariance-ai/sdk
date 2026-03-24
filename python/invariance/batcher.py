from __future__ import annotations

import asyncio
from typing import Callable

from .errors import InvarianceError
from .http_client import HttpClient
from .types import Receipt


class Batcher:
    def __init__(
        self,
        *,
        http: HttpClient,
        flush_interval_ms: int = 5000,
        max_batch_size: int = 50,
        max_queue_size: int = 1000,
        on_error: Callable[[InvarianceError], None] | None = None,
    ) -> None:
        self._http = http
        self._flush_interval_ms = flush_interval_ms
        self._max_batch_size = max_batch_size
        self._max_queue_size = max_queue_size
        self._on_error = on_error
        self._queue: list[Receipt] = []
        self._pending: list[asyncio.Task[None]] = []
        self._timer_task: asyncio.Task[None] | None = None
        self._start_timer()

    def _start_timer(self) -> None:
        try:
            loop = asyncio.get_running_loop()
            self._timer_task = loop.create_task(self._timer_loop())
        except RuntimeError:
            # No running event loop yet — timer will not auto-flush
            self._timer_task = None

    async def _timer_loop(self) -> None:
        try:
            while True:
                await asyncio.sleep(self._flush_interval_ms / 1000.0)
                if self._queue:
                    await self.flush()
        except asyncio.CancelledError:
            pass

    def enqueue(self, receipt: Receipt) -> None:
        if len(self._queue) >= self._max_queue_size:
            overflow = len(self._queue) - self._max_queue_size + 1
            self._queue = self._queue[overflow:]
            if self._on_error:
                self._on_error(
                    InvarianceError(
                        "QUEUE_OVERFLOW",
                        f"Queue overflow: dropped {overflow} receipts",
                    )
                )
        self._queue.append(receipt)

        if len(self._queue) >= self._max_batch_size:
            try:
                loop = asyncio.get_running_loop()
                task = loop.create_task(self.flush())
                self._pending.append(task)
                task.add_done_callback(lambda t: self._pending.remove(t) if t in self._pending else None)
            except RuntimeError:
                pass

    async def flush(self) -> None:
        if not self._queue:
            return

        batch = self._queue[: self._max_batch_size]
        self._queue = self._queue[self._max_batch_size :]
        await self._send_batch(batch)

    async def shutdown(self) -> None:
        if self._timer_task:
            self._timer_task.cancel()
            try:
                await self._timer_task
            except asyncio.CancelledError:
                pass
            self._timer_task = None

        if self._queue:
            await self.flush()

        if self._pending:
            await asyncio.gather(*self._pending, return_exceptions=True)

    async def _send_batch(self, batch: list[Receipt]) -> None:
        try:
            await self._http.post("/v1/receipts", {"receipts": batch})
        except InvarianceError as error:
            if error.status_code and error.status_code >= 500:
                self._queue = batch + self._queue
            if self._on_error:
                self._on_error(error)
        except Exception as exc:
            error = InvarianceError("FLUSH_FAILED", str(exc))
            if self._on_error:
                self._on_error(error)
