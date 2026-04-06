from __future__ import annotations

from typing import Any

from ..http_client import HttpClient
from ..types import (
    FailureCluster, CreateFailureClusterBody, UpdateFailureClusterBody,
    FailureClusterListOpts, FailureClusterMember, AddClusterMemberBody,
)


class FailureClustersResource:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    async def list(
        self, opts: FailureClusterListOpts | None = None
    ) -> list[FailureCluster]:
        return await self._http.get("/v1/evals/clusters", params=opts)

    async def get(self, id: str) -> FailureCluster:
        return await self._http.get(f"/v1/evals/clusters/{id}")

    async def create(self, body: CreateFailureClusterBody) -> FailureCluster:
        return await self._http.post("/v1/evals/clusters", body)

    async def update(
        self, id: str, body: UpdateFailureClusterBody
    ) -> FailureCluster:
        return await self._http.patch(f"/v1/evals/clusters/{id}", body)

    async def delete(self, id: str) -> dict[str, bool]:
        return await self._http.delete(f"/v1/evals/clusters/{id}")

    async def add_member(
        self, cluster_id: str, body: AddClusterMemberBody
    ) -> FailureClusterMember:
        return await self._http.post(
            f"/v1/evals/clusters/{cluster_id}/members", body
        )
