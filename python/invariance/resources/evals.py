from __future__ import annotations

from typing import Any

from ..http_client import HttpClient
from ..types import (
    EvalSuite, CreateEvalSuiteBody, EvalCase, CreateEvalCaseBody,
    EvalRun, RunEvalBody, EvalCaseResult, EvalCompareResult,
    EvalThreshold, CreateEvalThresholdBody,
)


class EvalsResource:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    # Suites
    async def list_suites(
        self, opts: dict[str, str] | None = None
    ) -> list[EvalSuite]:
        return await self._http.get("/v1/evals/suites", params=opts)

    async def get_suite(self, id: str) -> EvalSuite:
        return await self._http.get(f"/v1/evals/suites/{id}")

    async def create_suite(self, body: CreateEvalSuiteBody) -> EvalSuite:
        return await self._http.post("/v1/evals/suites", body)

    async def update_suite(self, id: str, body: dict[str, Any]) -> EvalSuite:
        return await self._http.patch(f"/v1/evals/suites/{id}", body)

    async def delete_suite(self, id: str) -> None:
        await self._http.delete(f"/v1/evals/suites/{id}")

    # Cases
    async def list_cases(self, suite_id: str) -> list[EvalCase]:
        return await self._http.get(f"/v1/evals/suites/{suite_id}/cases")

    async def create_case(
        self, suite_id: str, body: CreateEvalCaseBody
    ) -> EvalCase:
        return await self._http.post(f"/v1/evals/suites/{suite_id}/cases", body)

    async def update_case(self, id: str, body: dict[str, Any]) -> EvalCase:
        return await self._http.patch(f"/v1/evals/cases/{id}", body)

    async def delete_case(self, id: str) -> None:
        await self._http.delete(f"/v1/evals/cases/{id}")

    # Runs
    async def list_runs(
        self, opts: dict[str, str] | None = None
    ) -> list[EvalRun]:
        return await self._http.get("/v1/evals/runs", params=opts)

    async def get_run(self, id: str) -> dict[str, Any]:
        return await self._http.get(f"/v1/evals/runs/{id}")

    async def trigger_run(self, suite_id: str, body: RunEvalBody) -> EvalRun:
        return await self._http.post(f"/v1/evals/suites/{suite_id}/run", body)

    # Compare
    async def compare(
        self, suite_id: str, run_a: str, run_b: str
    ) -> EvalCompareResult:
        return await self._http.get(
            "/v1/evals/compare",
            params={"suite_id": suite_id, "run_a": run_a, "run_b": run_b},
        )

    # Thresholds
    async def list_thresholds(
        self, opts: dict[str, str] | None = None
    ) -> list[EvalThreshold]:
        return await self._http.get("/v1/evals/thresholds", params=opts)

    async def create_threshold(
        self, body: CreateEvalThresholdBody
    ) -> EvalThreshold:
        return await self._http.post("/v1/evals/thresholds", body)

    async def update_threshold(
        self, id: str, body: dict[str, Any]
    ) -> EvalThreshold:
        return await self._http.patch(f"/v1/evals/thresholds/{id}", body)

    async def delete_threshold(self, id: str) -> None:
        await self._http.delete(f"/v1/evals/thresholds/{id}")
