from __future__ import annotations

from typing import Any

from ..http_client import HttpClient
from ..types import A2AConversation, A2AMessage, A2APeer, A2AConversationListOpts


class A2AResource:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    async def conversations(
        self, opts: A2AConversationListOpts | None = None
    ) -> list[A2AConversation]:
        return await self._http.get("/v1/a2a/conversations", params=opts)

    async def conversation(self, conversation_id: str) -> A2AConversation:
        return await self._http.get(f"/v1/a2a/conversations/{conversation_id}")

    async def messages(self, conversation_id: str) -> list[A2AMessage]:
        return await self._http.get(
            f"/v1/a2a/conversations/{conversation_id}/messages"
        )

    async def peers(self, agent_id: str) -> list[A2APeer]:
        return await self._http.get(f"/v1/a2a/agents/{agent_id}/peers")
