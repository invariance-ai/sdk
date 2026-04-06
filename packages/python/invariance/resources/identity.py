from __future__ import annotations

from typing import Any

from ..http_client import HttpClient
from ..types import DeveloperIdentity, OrgIdentity, AgentIdentity, SignupOpts, RegisterAgentOpts


class IdentityResource:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    async def signup(self, opts: SignupOpts) -> DeveloperIdentity:
        return await self._http.post("/v1/identity/signup", opts)

    async def create_org(self, opts: dict[str, str]) -> OrgIdentity:
        return await self._http.post("/v1/identity/orgs", opts)

    async def register_agent(self, owner: str, opts: RegisterAgentOpts) -> AgentIdentity:
        return await self._http.post(f"/v1/identity/agents/{owner}", opts)

    async def lookup(self, owner: str, name: str) -> AgentIdentity:
        return await self._http.get(f"/v1/identity/agents/{owner}/{name}")
