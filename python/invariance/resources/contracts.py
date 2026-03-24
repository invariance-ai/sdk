from __future__ import annotations

from typing import Any

from ..crypto import sorted_stringify, sha256, ed25519_sign
from ..http_client import HttpClient
from ..types import Contract, ContractProposeOpts, ContractDeliverOpts, SettlementProof


class ContractsResource:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    async def propose(self, opts: ContractProposeOpts) -> dict[str, Any]:
        terms_hash = sha256(sorted_stringify(opts["terms"]))
        signature = ed25519_sign(terms_hash, opts["privateKey"])
        body: dict[str, Any] = {
            "providerId": opts["providerId"],
            "terms": opts["terms"],
            "termsHash": terms_hash,
            "signature": signature,
        }
        if "requestorIdentity" in opts:
            body["requestorIdentity"] = opts["requestorIdentity"]
        if "providerIdentity" in opts:
            body["providerIdentity"] = opts["providerIdentity"]
        return await self._http.post("/v1/contracts", body)

    async def accept(self, contract_id: str, signature: str) -> dict[str, Any]:
        return await self._http.post(
            f"/v1/contracts/{contract_id}/accept", {"signature": signature}
        )

    async def deliver(
        self, contract_id: str, opts: ContractDeliverOpts
    ) -> dict[str, Any]:
        output_hash = sha256(sorted_stringify(opts["outputData"]))
        signature = ed25519_sign(output_hash, opts["privateKey"])
        return await self._http.post(
            f"/v1/contracts/{contract_id}/deliver",
            {
                "outputData": opts["outputData"],
                "outputHash": output_hash,
                "signature": signature,
            },
        )

    async def accept_delivery(
        self, contract_id: str, delivery_id: str, signature: str
    ) -> dict[str, Any]:
        return await self._http.post(
            f"/v1/contracts/{contract_id}/accept-delivery",
            {"deliveryId": delivery_id, "signature": signature},
        )

    async def settle(self, contract_id: str) -> SettlementProof:
        return await self._http.post(f"/v1/contracts/{contract_id}/settle")

    async def dispute(
        self, contract_id: str, reason: str | None = None
    ) -> dict[str, Any]:
        return await self._http.post(
            f"/v1/contracts/{contract_id}/dispute", {"reason": reason}
        )

    async def get(self, id: str) -> Contract:
        return await self._http.get(f"/v1/contracts/{id}")

    async def list(self) -> list[Contract]:
        return await self._http.get("/v1/contracts")
