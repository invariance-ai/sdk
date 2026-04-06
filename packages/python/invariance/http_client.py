from __future__ import annotations

import asyncio
from typing import Any, Callable
from urllib.parse import urlencode, urljoin

import httpx

from .errors import InvarianceError


class HttpClient:
    def __init__(
        self,
        *,
        base_url: str,
        api_key: str,
        max_retries: int = 3,
        on_error: Callable[[InvarianceError], None] | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._max_retries = max_retries
        self._on_error = on_error
        self._client = httpx.AsyncClient(timeout=30.0)

    def _build_url(
        self, path: str, params: dict[str, Any] | None = None
    ) -> str:
        base = self._base_url if self._base_url.endswith("/") else self._base_url + "/"
        full_path = path.lstrip("/")
        url = urljoin(base, full_path)
        if params:
            filtered = {k: str(v) for k, v in params.items() if v is not None}
            if filtered:
                url = url + "?" + urlencode(filtered)
        return url

    async def get(
        self, path: str, *, params: dict[str, Any] | None = None
    ) -> Any:
        url = self._build_url(path, params)
        return await self._request("GET", url)

    async def post(self, path: str, body: Any = None) -> Any:
        url = self._build_url(path)
        return await self._request("POST", url, json_body=body)

    async def put(self, path: str, body: Any = None) -> Any:
        url = self._build_url(path)
        return await self._request("PUT", url, json_body=body)

    async def patch(self, path: str, body: Any = None) -> Any:
        url = self._build_url(path)
        return await self._request("PATCH", url, json_body=body)

    async def delete(self, path: str) -> Any:
        url = self._build_url(path)
        return await self._request("DELETE", url)

    async def raw(
        self, path: str, *, headers: dict[str, str] | None = None
    ) -> httpx.Response:
        url = self._build_url(path)
        hdrs = dict(headers or {})
        hdrs["Authorization"] = f"Bearer {self._api_key}"
        return await self._client.request("GET", url, headers=hdrs)

    async def _request(
        self,
        method: str,
        url: str,
        *,
        json_body: Any = None,
    ) -> Any:
        headers: dict[str, str] = {"Authorization": f"Bearer {self._api_key}"}
        if json_body is not None:
            headers["Content-Type"] = "application/json"

        last_error: InvarianceError | None = None

        for attempt in range(self._max_retries + 1):
            if attempt > 0:
                delay = min(1000 * 2 ** (attempt - 1), 8000) / 1000.0
                await asyncio.sleep(delay)

            try:
                if json_body is not None:
                    response = await self._client.request(
                        method, url, headers=headers, json=json_body
                    )
                else:
                    response = await self._client.request(
                        method, url, headers=headers
                    )
            except Exception as exc:
                last_error = InvarianceError(
                    "API_ERROR", f"Network error: {exc}"
                )
                continue

            if 200 <= response.status_code < 300:
                text = response.text
                if not text:
                    return None
                try:
                    return response.json()
                except Exception:
                    return text

            error_body = response.text
            try:
                details = response.json()
            except Exception:
                details = error_body

            error = InvarianceError(
                "API_ERROR",
                f"{method} {url} returned {response.status_code}: {error_body}",
                status_code=response.status_code,
                details=details,
            )

            if response.status_code >= 500:
                last_error = error
                continue

            if self._on_error:
                self._on_error(error)
            raise error

        if last_error:
            if self._on_error:
                self._on_error(last_error)
            raise last_error

        raise InvarianceError("API_ERROR", "Request failed after all retries")

    async def close(self) -> None:
        await self._client.aclose()
