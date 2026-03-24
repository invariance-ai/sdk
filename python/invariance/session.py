from __future__ import annotations

import asyncio
from typing import Any, Awaitable, Callable, TypeVar

from ulid import ULID

from .errors import InvarianceError
from .receipt import create_receipt
from .types import Action, Receipt, SessionInfo

T = TypeVar("T")

EnqueueFn = Callable[[Receipt], None]
SessionCreateFn = Callable[[dict[str, Any]], Awaitable[None]]
SessionCloseFn = Callable[[str, str, str], Awaitable[None]]


class Session:
    def __init__(
        self,
        *,
        agent: str,
        name: str,
        id: str | None = None,
        private_key: str | None = None,
        enqueue: EnqueueFn,
        on_create: SessionCreateFn,
        on_close: SessionCloseFn,
    ) -> None:
        self.id = id or str(ULID())
        self.agent = agent
        self.name = name
        self._private_key = private_key
        self._enqueue = enqueue
        self._on_close = on_close
        self._previous_hash = "0"
        self._receipts: list[Receipt] = []
        self._closed = False

        loop = asyncio.get_running_loop()
        self._ready: asyncio.Future[None] = loop.create_future()

        async def _init() -> None:
            try:
                await on_create({"id": self.id, "name": self.name, "agent_id": agent})
                if not self._ready.done():
                    self._ready.set_result(None)
            except Exception as exc:
                if not self._ready.done():
                    self._ready.set_exception(exc)

        loop.create_task(_init())

    @property
    def ready(self) -> asyncio.Future[None]:
        return self._ready

    async def record(self, action: Action) -> Receipt:
        await self._ready
        if self._closed:
            raise InvarianceError("SESSION_CLOSED", f"Session {self.id} is closed")

        receipt = create_receipt(
            session_id=self.id,
            agent=action.get("agent", self.agent),
            action=action["action"],
            input=action.get("input", {}),
            output=action.get("output"),
            error=action.get("error"),
            previous_hash=self._previous_hash,
            private_key=self._private_key,
        )

        self._previous_hash = receipt["hash"]
        self._receipts.append(receipt)
        self._enqueue(receipt)
        return receipt

    async def wrap(
        self,
        action: Action,
        fn: Callable[[], T | Awaitable[T]],
    ) -> dict[str, Any]:
        """Execute fn, then record a receipt with the result or error.

        Returns:
            {'result': T, 'receipt': Receipt}
        """
        result: Any = None
        error: str | None = None
        output: dict[str, Any] | None = None

        try:
            call_result = fn()
            if asyncio.iscoroutine(call_result) or asyncio.isfuture(call_result):
                result = await call_result
            else:
                result = call_result
            if result is not None and isinstance(result, dict):
                output = result
        except Exception as exc:
            error = str(exc)
            receipt = await self.record({**action, "error": error})
            exc.receipt = receipt  # type: ignore[attr-defined]
            raise

        receipt = await self.record({**action, "output": output, "error": error})
        return {"result": result, "receipt": receipt}

    async def end(self, status: str = "closed") -> SessionInfo:
        if self._closed:
            raise InvarianceError("SESSION_CLOSED", f"Session {self.id} is already closed")
        self._closed = True
        close_hash = self._previous_hash
        await self._on_close(self.id, status, close_hash)
        return self.info()

    def get_receipts(self) -> list[Receipt]:
        return list(self._receipts)

    def info(self) -> SessionInfo:
        return {
            "id": self.id,
            "name": self.name,
            "agent": self.agent,
            "status": "closed" if self._closed else "open",
            "receiptCount": len(self._receipts),
            "rootHash": self._receipts[0]["hash"] if self._receipts else None,
            "closeHash": self._previous_hash if self._closed else None,
        }
