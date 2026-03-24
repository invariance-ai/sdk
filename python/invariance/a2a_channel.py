from __future__ import annotations

from typing import Any

from .crypto import sha256, sorted_stringify, ed25519_sign
from .session import Session
from .types import Receipt


class A2AChannel:
    def __init__(
        self,
        *,
        session: Session,
        identity: str,
        private_key: str,
        counter_agent_id: str,
        conversation_id: str,
    ) -> None:
        self._session = session
        self.identity = identity
        self._private_key = private_key
        self._counter_agent_id = counter_agent_id
        self._conversation_id = conversation_id

    async def send(
        self, content: str, metadata: dict[str, Any] | None = None
    ) -> Receipt:
        payload_hash = sha256(sorted_stringify({"content": content, "metadata": metadata}))

        input_data: dict[str, Any] = {
            "conversation_id": self._conversation_id,
            "to": self._counter_agent_id,
            "content": content,
            "payload_hash": payload_hash,
            "message_type": "text",
            "protocol": "invariance-a2a",
        }
        if metadata:
            input_data.update(metadata)

        return await self._session.record({"action": "a2a_send", "input": input_data})

    async def receive(
        self,
        content: str,
        sender_signature: str,
        metadata: dict[str, Any] | None = None,
    ) -> Receipt:
        payload_hash = sha256(sorted_stringify({"content": content, "metadata": metadata}))
        counter_signature = ed25519_sign(payload_hash, self._private_key)

        input_data: dict[str, Any] = {
            "conversation_id": self._conversation_id,
            "from": self._counter_agent_id,
            "content": content,
            "payload_hash": payload_hash,
            "sender_signature": sender_signature,
            "counter_signature": counter_signature,
            "message_type": "text",
            "protocol": "invariance-a2a",
        }
        if metadata:
            input_data.update(metadata)

        return await self._session.record({"action": "a2a_receive", "input": input_data})
