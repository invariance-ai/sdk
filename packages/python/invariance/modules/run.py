from __future__ import annotations

import time
from typing import Any, Awaitable, Callable, TYPE_CHECKING
from ulid import ULID

if TYPE_CHECKING:
    from .resources import ResourcesModule
    from ..session import Session


def _build_trace_event(
    *,
    session_id: str,
    agent_id: str,
    action_type: str,
    input: dict[str, Any] | None = None,
    output: dict[str, Any] | None = None,
    error: str | None = None,
    parent_id: str | None = None,
    span_id: str | None = None,
    duration_ms: int | None = None,
    tags: list[str] | None = None,
    custom_attributes: dict[str, Any] | None = None,
    custom_headers: dict[str, str] | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    event: dict[str, Any] = {
        "session_id": session_id,
        "agent_id": agent_id,
        "action_type": action_type,
    }
    if input is not None:
        event["input"] = input
    if output is not None:
        event["output"] = output
    if error is not None:
        event["error"] = error
    if parent_id:
        event["parent_id"] = parent_id
    if span_id:
        event["span_id"] = span_id
    if duration_ms is not None:
        event["duration_ms"] = duration_ms
    if custom_attributes:
        event["custom_attributes"] = custom_attributes
    if custom_headers:
        event["custom_headers"] = custom_headers

    meta = dict(metadata or {})
    if tags:
        meta["tags"] = tags
    if meta:
        event["metadata"] = meta

    return event


class RunModule:
    def __init__(
        self,
        resources: ResourcesModule,
        *,
        agent: str | None = None,
        private_key: str | None = None,
        instrumentation: dict[str, Any] | None = None,
        session_factory: Callable[..., Session] | None = None,
        flush_pending_work: Callable[[], Awaitable[None]] | None = None,
    ) -> None:
        self._resources = resources
        self._agent = agent
        self._private_key = private_key
        self._instrumentation = instrumentation or {}
        self._session_factory = session_factory
        self._flush_pending_work = flush_pending_work

    async def start(
        self,
        *,
        name: str,
        agent: str | None = None,
        tags: list[str] | None = None,
    ) -> Run:
        agent = agent or self._agent
        if not agent:
            raise ValueError(
                "agent is required: pass it to run.start() or set it in the Invariance config"
            )

        session_id = str(ULID())
        traces_enabled = self._instrumentation.get("traces", True) is not False

        provenance_session: Session | None = None
        provenance_enabled = bool(
            self._private_key
            and self._instrumentation.get("provenance", False) is True
        )
        if provenance_enabled and self._session_factory:
            provenance_session = self._session_factory(
                agent=agent, name=name, id=session_id
            )
            await provenance_session.ready
        else:
            await self._resources.sessions.create(
                {"id": session_id, "name": name, "agent_id": agent}
            )

        return Run(
            session_id=session_id,
            agent=agent,
            name=name,
            tags=tags,
            resources=self._resources,
            provenance_session=provenance_session,
            traces_enabled=traces_enabled,
            flush_pending_work=self._flush_pending_work,
        )


class Run:
    def __init__(
        self,
        *,
        session_id: str,
        agent: str,
        name: str,
        tags: list[str] | None = None,
        resources: ResourcesModule,
        provenance_session: Session | None = None,
        traces_enabled: bool = True,
        flush_pending_work: Callable[[], Awaitable[None]] | None = None,
    ) -> None:
        self.session_id = session_id
        self.agent = agent
        self.name = name
        self._resources = resources
        self._provenance_session = provenance_session
        self._traces_enabled = traces_enabled
        self._flush_pending_work = flush_pending_work
        self._parent_stack: list[str] = []
        self._event_count = 0
        self._start_time = time.time()
        self._tags = tags
        self._finished = False

    def _current_parent_id(self) -> str | None:
        return self._parent_stack[-1] if self._parent_stack else None

    async def _submit_event(self, event: dict[str, Any]) -> Any:
        if not self._traces_enabled:
            return {"nodes": []}
        self._event_count += 1
        return await self._resources.trace.submit_events([event])

    async def _record_receipt(
        self,
        action: str,
        input_data: dict[str, Any] | None = None,
        output_data: dict[str, Any] | None = None,
        error: str | None = None,
    ) -> None:
        if self._provenance_session:
            receipt_data: dict[str, Any] = {
                "action": action,
                "input": input_data or {},
            }
            if output_data is not None:
                receipt_data["output"] = output_data
            if error is not None:
                receipt_data["error"] = error
            await self._provenance_session.record(receipt_data)

    def _assert_open(self) -> None:
        if self._finished:
            raise RuntimeError(f"Run {self.session_id} is already finished")

    async def step(
        self,
        name: str,
        fn: Callable[[], Any | Awaitable[Any]],
        *,
        tags: list[str] | None = None,
        custom_attributes: dict[str, Any] | None = None,
        custom_headers: dict[str, str] | None = None,
    ) -> Any:
        self._assert_open()
        span_id = str(ULID())
        parent_id = self._current_parent_id()
        self._parent_stack.append(span_id)

        start = time.time()
        error = None
        result = None
        try:
            result = await fn()
        except Exception as e:
            error = str(e)
            event = _build_trace_event(
                session_id=self.session_id,
                agent_id=self.agent,
                action_type="trace_step",
                input={"step": name},
                error=error,
                parent_id=parent_id,
                span_id=span_id,
                duration_ms=int((time.time() - start) * 1000),
                tags=tags or self._tags,
                custom_attributes=custom_attributes,
                custom_headers=custom_headers,
            )
            await self._submit_event(event)
            await self._record_receipt(name, {"step": name}, error=error)
            self._parent_stack.pop()
            raise

        output = result if isinstance(result, dict) else {"result": result}
        event = _build_trace_event(
            session_id=self.session_id,
            agent_id=self.agent,
            action_type="trace_step",
            input={"step": name},
            output=output,
            parent_id=parent_id,
            span_id=span_id,
            duration_ms=int((time.time() - start) * 1000),
            tags=tags or self._tags,
            custom_attributes=custom_attributes,
            custom_headers=custom_headers,
        )
        await self._submit_event(event)
        await self._record_receipt(name, {"step": name}, output)
        self._parent_stack.pop()
        return result

    async def tool(
        self,
        name: str,
        args: dict[str, Any],
        fn: Callable[[], Any | Awaitable[Any]],
        *,
        tags: list[str] | None = None,
        custom_attributes: dict[str, Any] | None = None,
        custom_headers: dict[str, str] | None = None,
    ) -> Any:
        self._assert_open()
        span_id = str(ULID())
        parent_id = self._current_parent_id()
        self._parent_stack.append(span_id)

        start = time.time()
        error = None
        result = None
        try:
            result = await fn()
        except Exception as e:
            error = str(e)
            event = _build_trace_event(
                session_id=self.session_id,
                agent_id=self.agent,
                action_type="tool_invocation",
                input={"tool": name, "args": args},
                error=error,
                parent_id=parent_id,
                span_id=span_id,
                duration_ms=int((time.time() - start) * 1000),
                tags=tags or self._tags,
                custom_attributes=custom_attributes,
                custom_headers=custom_headers,
                metadata={"tool_calls": [name]},
            )
            await self._submit_event(event)
            await self._record_receipt(f"tool:{name}", args, error=error)
            self._parent_stack.pop()
            raise

        output = result if isinstance(result, dict) else {"result": result}
        event = _build_trace_event(
            session_id=self.session_id,
            agent_id=self.agent,
            action_type="tool_invocation",
            input={"tool": name, "args": args},
            output=output,
            parent_id=parent_id,
            span_id=span_id,
            duration_ms=int((time.time() - start) * 1000),
            tags=tags or self._tags,
            custom_attributes=custom_attributes,
            custom_headers=custom_headers,
            metadata={
                "tool_calls": [name],
                "execution_ms": int((time.time() - start) * 1000),
            },
        )
        await self._submit_event(event)
        await self._record_receipt(f"tool:{name}", args, output)
        self._parent_stack.pop()
        return result

    async def decision(
        self,
        name: str,
        context: dict[str, Any],
        fn: Callable[[], Any | Awaitable[Any]],
        *,
        tags: list[str] | None = None,
        custom_attributes: dict[str, Any] | None = None,
        custom_headers: dict[str, str] | None = None,
    ) -> Any:
        """context should be dict with candidates, chosen, reasoning (optional)."""
        self._assert_open()
        span_id = str(ULID())
        parent_id = self._current_parent_id()
        self._parent_stack.append(span_id)

        start = time.time()
        try:
            result = await fn()
        except Exception:
            self._parent_stack.pop()
            raise

        event = _build_trace_event(
            session_id=self.session_id,
            agent_id=self.agent,
            action_type="decision_point",
            input={"candidates": context.get("candidates", [])},
            output={
                "chosen": context.get("chosen"),
                "reasoning": context.get("reasoning"),
            },
            parent_id=parent_id,
            span_id=span_id,
            duration_ms=int((time.time() - start) * 1000),
            tags=tags or self._tags,
            custom_attributes=custom_attributes,
            custom_headers=custom_headers,
        )
        await self._submit_event(event)
        await self._record_receipt(
            f"decision:{name}", context, {"chosen": context.get("chosen")}
        )
        self._parent_stack.pop()
        return result

    async def handoff(
        self,
        target_agent: str,
        task: str | None = None,
        *,
        tags: list[str] | None = None,
        custom_attributes: dict[str, Any] | None = None,
        custom_headers: dict[str, str] | None = None,
    ) -> Any:
        self._assert_open()
        event = _build_trace_event(
            session_id=self.session_id,
            agent_id=self.agent,
            action_type="sub_agent_spawn",
            input={"target_agent_id": target_agent, "task": task},
            parent_id=self._current_parent_id(),
            tags=tags or self._tags,
            custom_attributes=custom_attributes,
            custom_headers=custom_headers,
        )
        await self._submit_event(event)
        await self._record_receipt(
            "handoff", {"target_agent_id": target_agent, "task": task}
        )

    async def message(
        self,
        content: Any,
        *,
        tags: list[str] | None = None,
        custom_attributes: dict[str, Any] | None = None,
        custom_headers: dict[str, str] | None = None,
    ) -> Any:
        self._assert_open()
        output = content if isinstance(content, dict) else {"content": content}
        event = _build_trace_event(
            session_id=self.session_id,
            agent_id=self.agent,
            action_type="message",
            output=output,
            parent_id=self._current_parent_id(),
            tags=tags or self._tags,
            custom_attributes=custom_attributes,
            custom_headers=custom_headers,
        )
        await self._submit_event(event)

    async def constraint(
        self,
        name: str,
        passed: bool,
        details: str | None = None,
        *,
        tags: list[str] | None = None,
        custom_attributes: dict[str, Any] | None = None,
        custom_headers: dict[str, str] | None = None,
    ) -> Any:
        self._assert_open()
        event = _build_trace_event(
            session_id=self.session_id,
            agent_id=self.agent,
            action_type="constraint_check",
            input={"constraint": name},
            output={"passed": passed, "details": details},
            parent_id=self._current_parent_id(),
            tags=tags or self._tags,
            custom_attributes=custom_attributes,
            custom_headers=custom_headers,
        )
        await self._submit_event(event)
        await self._record_receipt(
            f"constraint:{name}", {"constraint": name}, {"passed": passed}
        )

    async def context(
        self,
        label: str,
        value: Any,
        *,
        tags: list[str] | None = None,
        custom_attributes: dict[str, Any] | None = None,
        custom_headers: dict[str, str] | None = None,
    ) -> Any:
        self._assert_open()
        event = _build_trace_event(
            session_id=self.session_id,
            agent_id=self.agent,
            action_type="context",
            input={"label": label},
            output={"value": value},
            parent_id=self._current_parent_id(),
            tags=tags or self._tags,
            custom_attributes=custom_attributes,
            custom_headers=custom_headers,
        )
        await self._submit_event(event)

    async def log(
        self,
        label: str,
        data: Any = None,
        *,
        tags: list[str] | None = None,
        custom_attributes: dict[str, Any] | None = None,
        custom_headers: dict[str, str] | None = None,
    ) -> Any:
        """Log a simple message or data payload against this run."""
        self._assert_open()
        output = None
        if data is not None:
            output = data if isinstance(data, dict) else {"value": data}
        event = _build_trace_event(
            session_id=self.session_id,
            agent_id=self.agent,
            action_type="trace_step",
            input={"label": label},
            output=output,
            parent_id=self._current_parent_id(),
            tags=tags or self._tags,
            custom_attributes=custom_attributes,
            custom_headers=custom_headers,
        )
        await self._submit_event(event)
        await self._record_receipt(f"log:{label}", {"label": label}, output)

    async def signal(self, body: dict[str, Any]) -> Any:
        self._assert_open()
        return await self._resources.signals.create(body)

    async def flush(self) -> None:
        """Flush any pending trace or receipt work without closing the run."""
        if self._flush_pending_work:
            await self._flush_pending_work()

    async def fail(self, error: Any) -> dict[str, Any]:
        """Mark the run as failed, emit an error event, and close the session."""
        self._assert_open()
        error_msg = str(error)

        event = _build_trace_event(
            session_id=self.session_id,
            agent_id=self.agent,
            action_type="trace_step",
            input={"step": "__run_failed"},
            error=error_msg,
            parent_id=self._current_parent_id(),
            tags=self._tags,
        )
        await self._submit_event(event)
        await self._record_receipt("__run_failed", error=error_msg)

        return await self._close("failed")

    async def cancel(self, reason: str | None = None) -> dict[str, Any]:
        """Cancel the run with an optional reason and close the session."""
        self._assert_open()

        if reason:
            output = {"reason": reason}
            event = _build_trace_event(
                session_id=self.session_id,
                agent_id=self.agent,
                action_type="trace_step",
                input={"step": "__run_cancelled"},
                output=output,
                parent_id=self._current_parent_id(),
                tags=self._tags,
            )
            await self._submit_event(event)
            await self._record_receipt("__run_cancelled", output_data=output)
        else:
            await self._record_receipt("__run_cancelled")

        return await self._close("cancelled")

    async def finish(self, status: str = "closed") -> dict[str, Any]:
        self._assert_open()
        return await self._close(status)

    async def _close(self, status: str) -> dict[str, Any]:
        self._finished = True

        receipt_count = 0
        session_status = "closed" if status == "closed" else "tampered"
        if self._provenance_session:
            receipt_count = len(self._provenance_session.get_receipts())
            await self._provenance_session.end(session_status)
        else:
            await self._resources.sessions.close(self.session_id, session_status, "0")

        return {
            "session_id": self.session_id,
            "duration_ms": int((time.time() - self._start_time) * 1000),
            "event_count": self._event_count,
            "receipt_count": receipt_count,
            "status": status,
        }
