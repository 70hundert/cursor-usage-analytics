#!/usr/bin/env python3
"""
Lokaler Server für Cursor-Usage-Dashboard: statische Dateien + Live-API-Proxy.

Start (im Projektroot):
    python serve.py

Session-Tokens in .env (optional, nur für Live-Modus), pro User in config/users.json:
    CURSOR_SESSION_TOKEN_PRIMARY=...
    CURSOR_SESSION_TOKEN_SECONDARY=...
"""

from __future__ import annotations

from datetime import datetime, timezone
import json
import mimetypes
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock
import time
from typing import Any
from urllib.parse import parse_qs, unquote, urlparse

import requests
from dotenv import load_dotenv

PROJECT_DIR = Path(__file__).resolve().parent
load_dotenv(PROJECT_DIR / ".env")

CURSOR_ORIGIN = "https://cursor.com"
USAGE_SUMMARY_URL = f"{CURSOR_ORIGIN}/api/usage-summary"
EVENTS_URL = f"{CURSOR_ORIGIN}/api/dashboard/get-filtered-usage-events"

USERS_CONFIG_PATH = PROJECT_DIR / "config" / "users.json"

LEGACY_TOKEN_ENV = {
    "info": "CURSOR_SESSION_TOKEN_INFO",
    "slope": "CURSOR_SESSION_TOKEN_SLOPE",
}


def _sanitize_user_id(value: str) -> str:
    cleaned = "".join(ch for ch in value.strip() if ch.isalnum() or ch in ("_", "-"))
    return cleaned


def load_user_ids() -> list[str]:
    try:
        data = json.loads(USERS_CONFIG_PATH.read_text(encoding="utf-8"))
        users = data.get("users", [])
        ids = []
        for entry in users:
            if not isinstance(entry, dict):
                continue
            user_id = _sanitize_user_id(str(entry.get("id", "")))
            if user_id:
                ids.append(user_id)
        if ids:
            return ids
    except (OSError, json.JSONDecodeError, TypeError):
        pass
    return ["primary", "secondary"]


def _token_env_key(user_id: str) -> str:
    return f"CURSOR_SESSION_TOKEN_{user_id.upper().replace('-', '_')}"


def load_user_tokens() -> dict[str, str]:
    tokens: dict[str, str] = {}
    for user_id in load_user_ids():
        env_key = _token_env_key(user_id)
        token = os.getenv(env_key, "").strip()
        if not token and user_id in LEGACY_TOKEN_ENV:
            token = os.getenv(LEGACY_TOKEN_ENV[user_id], "").strip()
        tokens[user_id] = token
    return tokens


USER_TOKENS = load_user_tokens()

PAGE_SIZE = 100
CACHE_TTL_SEC = int(os.getenv("CURSOR_EVENTS_CACHE_TTL", "120"))

MIME_OVERRIDES = {
    ".js": "application/javascript; charset=utf-8",
    ".csv": "text/csv; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".json": "application/json; charset=utf-8",
}

_events_cache: dict[str, tuple[float, list[dict[str, Any]], int]] = {}
_cache_lock = Lock()

MARKERS_PATH = PROJECT_DIR / "data" / "project-markers.json"
MARKERS_SAMPLE_PATH = PROJECT_DIR / "samples" / "project-markers-demo.json"
_markers_lock = Lock()


def _events_cache_key(user: str, start_date: str | None, end_date: str | None) -> str:
    return f"{user}:{start_date or ''}:{end_date or ''}"


def _normalize_epoch_param(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = str(value).strip()
    return cleaned or None


def fetch_all_events_cached(
    user: str,
    token: str,
    start_date: str | None = None,
    end_date: str | None = None,
) -> tuple[list[dict[str, Any]], int]:
    start_date = _normalize_epoch_param(start_date)
    end_date = _normalize_epoch_param(end_date)
    cache_key = _events_cache_key(user, start_date, end_date)
    now = time.time()

    with _cache_lock:
        cached = _events_cache.get(cache_key)
        if cached and cached[0] > now:
            return cached[1], cached[2]

    events, total = fetch_all_events(token, start_date, end_date)

    with _cache_lock:
        _events_cache[cache_key] = (now + CACHE_TTL_SEC, events, total)

    return events, total


def _session_for_token(token: str) -> requests.Session:
    session = requests.Session()
    session.cookies.set("WorkosCursorSessionToken", token, domain="cursor.com")
    session.headers.update(
        {
            "Origin": CURSOR_ORIGIN,
            "Referer": f"{CURSOR_ORIGIN}/dashboard/usage",
            "User-Agent": "cursor-usage-dashboard/1.0",
        }
    )
    return session


def _json_response(handler: BaseHTTPRequestHandler, status: int, payload: dict[str, Any]) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def _read_json_body(handler: BaseHTTPRequestHandler) -> dict[str, Any]:
    length = int(handler.headers.get("Content-Length", 0))
    if length <= 0:
        return {}
    raw = handler.rfile.read(length)
    if not raw:
        return {}
    return json.loads(raw.decode("utf-8"))


def _empty_markers_store() -> dict[str, Any]:
    return {"version": 1, "markers": []}


def _seed_markers_from_sample() -> bool:
    if not MARKERS_SAMPLE_PATH.is_file():
        return False
    try:
        sample = json.loads(MARKERS_SAMPLE_PATH.read_text(encoding="utf-8"))
        validated = _validate_markers_store(sample)
        if not validated:
            return False
        _save_markers_store(validated)
        return True
    except (json.JSONDecodeError, OSError):
        return False


def _load_markers_store() -> dict[str, Any]:
    MARKERS_PATH.parent.mkdir(parents=True, exist_ok=True)
    if not MARKERS_PATH.is_file():
        if _seed_markers_from_sample():
            return _load_markers_store()
        return _empty_markers_store()
    try:
        data = json.loads(MARKERS_PATH.read_text(encoding="utf-8"))
        if isinstance(data, dict) and isinstance(data.get("markers"), list):
            return data
    except (json.JSONDecodeError, OSError):
        pass
    return _empty_markers_store()


def _save_markers_store(store: dict[str, Any]) -> None:
    MARKERS_PATH.parent.mkdir(parents=True, exist_ok=True)
    temp_path = MARKERS_PATH.with_suffix(".json.tmp")
    temp_path.write_text(
        json.dumps(store, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    temp_path.replace(MARKERS_PATH)


def _validate_markers_store(store: dict[str, Any]) -> dict[str, Any] | None:
    if not isinstance(store, dict):
        return None
    markers = store.get("markers")
    if not isinstance(markers, list):
        return None
    return {"version": int(store.get("version") or 1), "markers": markers}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _marker_id_for_session(session_id: str) -> str:
    return f"m-cursor-{session_id}"


def _truncate_task(text: str, max_len: int = 120) -> str:
    cleaned = " ".join(str(text or "").split())
    if len(cleaned) <= max_len:
        return cleaned
    return cleaned[: max_len - 1].rstrip() + "…"


_PLACEHOLDER_TASKS = frozenset({"", "Neuer Chat", "New chat"})


def _find_marker(markers: list[dict[str, Any]], marker_id: str) -> dict[str, Any] | None:
    for marker in markers:
        if marker.get("id") == marker_id:
            return marker
    return None


def _close_open_markers_for_user(
    markers: list[dict[str, Any]],
    user: str,
    now: str,
    *,
    except_id: str | None = None,
) -> None:
    for marker in markers:
        if marker.get("user") != user:
            continue
        if marker.get("end") is not None:
            continue
        if except_id and marker.get("id") == except_id:
            continue
        marker["end"] = now
        marker["updatedAt"] = now


def _apply_marker_session(
    store: dict[str, Any],
    body: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any] | None]:
    action = str(body.get("action") or "").strip()
    session_id = str(body.get("sessionId") or "").strip()
    user = _sanitize_user_id(str(body.get("user") or load_user_ids()[0]))
    project = str(body.get("project") or "").strip()
    note = str(body.get("note") or "").strip()
    task = _truncate_task(str(body.get("task") or ""))

    if action not in {"start", "prompt", "end"}:
        return store, {"error": "Unbekannte action"}
    if not session_id:
        return store, {"error": "sessionId fehlt"}
    if not user:
        return store, {"error": "user fehlt"}

    marker_id = _marker_id_for_session(session_id)
    now = _now_iso()
    markers = [dict(marker) for marker in store.get("markers", [])]

    if action == "start":
        if not project:
            return store, {"error": "project fehlt"}

        _close_open_markers_for_user(markers, user, now, except_id=marker_id)
        existing = _find_marker(markers, marker_id)
        if existing:
            existing["start"] = now
            existing["end"] = None
            existing["project"] = project
            existing["user"] = user
            existing["updatedAt"] = now
            if note:
                existing["note"] = note
            if task and existing.get("task") in _PLACEHOLDER_TASKS:
                existing["task"] = task
        else:
            markers.append(
                {
                    "id": marker_id,
                    "user": user,
                    "start": now,
                    "end": None,
                    "project": project,
                    "task": task or "Neuer Chat",
                    "note": note,
                    "createdAt": now,
                    "updatedAt": now,
                }
            )

    elif action == "prompt":
        existing = _find_marker(markers, marker_id)
        if not existing:
            if not project:
                return store, {"error": "Marker nicht gefunden und project fehlt"}
            markers.append(
                {
                    "id": marker_id,
                    "user": user,
                    "start": now,
                    "end": None,
                    "project": project,
                    "task": task or "Neuer Chat",
                    "note": note,
                    "createdAt": now,
                    "updatedAt": now,
                }
            )
        elif task and existing.get("task") in _PLACEHOLDER_TASKS:
            existing["task"] = task
            existing["updatedAt"] = now
            if note and not existing.get("note"):
                existing["note"] = note

    elif action == "end":
        existing = _find_marker(markers, marker_id)
        if existing and existing.get("end") is None:
            existing["end"] = now
            existing["updatedAt"] = now

    return {"version": int(store.get("version") or 1), "markers": markers}, None


def fetch_usage_summary(token: str) -> dict[str, Any]:
    session = _session_for_token(token)
    response = session.get(USAGE_SUMMARY_URL, timeout=30)
    if response.status_code == 401:
        raise RuntimeError(
            "Session-Token abgelaufen oder ungültig — "
            "DevTools → Application → Cookies → WorkosCursorSessionToken kopieren."
        )
    response.raise_for_status()
    return response.json()


def fetch_all_events(
    token: str,
    start_date: str | None = None,
    end_date: str | None = None,
) -> tuple[list[dict[str, Any]], int]:
    session = _session_for_token(token)
    all_events: list[dict[str, Any]] = []
    page = 1
    total_count = 0

    while True:
        body: dict[str, Any] = {"page": page, "pageSize": PAGE_SIZE}
        if start_date:
            body["startDate"] = str(start_date)
        if end_date:
            body["endDate"] = str(end_date)

        response = session.post(EVENTS_URL, json=body, timeout=60)
        if response.status_code == 401:
            raise RuntimeError(
                "Session-Token abgelaufen oder ungültig — "
                "DevTools → Application → Cookies → WorkosCursorSessionToken kopieren."
            )
        response.raise_for_status()
        payload = response.json()

        total_count = int(payload.get("totalUsageEventsCount") or 0)
        batch = payload.get("usageEventsDisplay") or []
        if not batch:
            break

        all_events.extend(batch)
        if len(all_events) >= total_count:
            break
        if len(batch) < PAGE_SIZE:
            break
        page += 1

    return all_events, total_count


def _resolve_static_path(url_path: str) -> Path | None:
    decoded = unquote(url_path.split("?", 1)[0])
    if decoded in ("", "/"):
        decoded = "/index.html"

    relative = decoded.lstrip("/")
    if not relative or ".." in relative.split("/"):
        return None

    candidate = (PROJECT_DIR / relative).resolve()
    try:
        candidate.relative_to(PROJECT_DIR)
    except ValueError:
        return None

    if not candidate.is_file():
        return None
    return candidate


def _guess_content_type(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix in MIME_OVERRIDES:
        return MIME_OVERRIDES[suffix]
    guessed, _ = mimetypes.guess_type(str(path))
    return guessed or "application/octet-stream"


def _serve_static(handler: BaseHTTPRequestHandler, file_path: Path) -> None:
    data = file_path.read_bytes()
    handler.send_response(200)
    handler.send_header("Content-Type", _guess_content_type(file_path))
    handler.send_header("Content-Length", str(len(data)))
    handler.end_headers()
    handler.wfile.write(data)


def _token_error(user: str) -> dict[str, Any]:
    return {
        "error": (
            f"Kein Token für Benutzer '{user}' — "
            f"CURSOR_SESSION_TOKEN_{user.upper()} in .env setzen."
        )
    }


class CursorUsageHandler(BaseHTTPRequestHandler):
    server_version = "CursorUsageDashboard/1.0"

    def log_message(self, format: str, *args: Any) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), format % args))

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)

        if parsed.path == "/health":
            configured = {user: bool(token) for user, token in USER_TOKENS.items()}
            marker_hook_config = Path.home() / ".cursor" / "marker-hook.json"
            _json_response(
                self,
                200,
                {
                    "ok": True,
                    "users": configured,
                    "port": self.server.server_port,
                    "markerHooks": marker_hook_config.is_file(),
                },
            )
            return

        if parsed.path == "/api/users":
            users_payload = []
            try:
                config = json.loads(USERS_CONFIG_PATH.read_text(encoding="utf-8"))
                for entry in config.get("users", []):
                    if not isinstance(entry, dict):
                        continue
                    user_id = _sanitize_user_id(str(entry.get("id", "")))
                    if not user_id:
                        continue
                    users_payload.append(
                        {
                            "id": user_id,
                            "label": str(entry.get("label") or user_id),
                            "defaultCsvPaths": entry.get("defaultCsvPaths") or [],
                            "hasToken": bool(USER_TOKENS.get(user_id)),
                        }
                    )
            except (OSError, json.JSONDecodeError, TypeError):
                users_payload = [
                    {
                        "id": user_id,
                        "label": user_id,
                        "defaultCsvPaths": [],
                        "hasToken": bool(token),
                    }
                    for user_id, token in USER_TOKENS.items()
                ]
            _json_response(self, 200, {"users": users_payload})
            return

        if parsed.path == "/api/summary":
            default_user = load_user_ids()[0]
            user = (query.get("user") or [default_user])[0]
            token = USER_TOKENS.get(user, "")
            if not token:
                _json_response(self, 400, _token_error(user))
                return
            try:
                summary = fetch_usage_summary(token)
                _json_response(self, 200, {"user": user, "summary": summary})
            except Exception as exc:
                _json_response(self, 502, {"error": str(exc)})
            return

        if parsed.path == "/api/events":
            default_user = load_user_ids()[0]
            user = (query.get("user") or [default_user])[0]
            token = USER_TOKENS.get(user, "")
            if not token:
                _json_response(self, 400, _token_error(user))
                return
            start_date = (query.get("startDate") or [None])[0]
            end_date = (query.get("endDate") or [None])[0]
            try:
                events, total = fetch_all_events_cached(
                    user,
                    token,
                    start_date,
                    end_date,
                )
                _json_response(
                    self,
                    200,
                    {"user": user, "events": events, "totalUsageEventsCount": total},
                )
            except Exception as exc:
                _json_response(self, 502, {"error": str(exc)})
            return

        if parsed.path == "/api/markers":
            user = (query.get("user") or [None])[0]
            with _markers_lock:
                store = _load_markers_store()
            if user:
                store = {
                    **store,
                    "markers": [
                        marker
                        for marker in store.get("markers", [])
                        if marker.get("user") in (user, "all")
                    ],
                }
            _json_response(self, 200, store)
            return

        static_path = _resolve_static_path(parsed.path)
        if static_path:
            _serve_static(self, static_path)
            return

        _json_response(self, 404, {"error": "Not found"})

    def do_POST(self) -> None:
        parsed = urlparse(self.path)

        if parsed.path == "/api/markers/session":
            try:
                body = _read_json_body(self)
            except json.JSONDecodeError:
                _json_response(self, 400, {"error": "Ungültiges JSON"})
                return

            with _markers_lock:
                store = _load_markers_store()
                updated, error = _apply_marker_session(store, body)
                if error:
                    _json_response(self, 400, error)
                    return
                try:
                    _save_markers_store(updated)
                except OSError as exc:
                    _json_response(self, 500, {"error": str(exc)})
                    return

            marker_id = _marker_id_for_session(str(body.get("sessionId") or ""))
            marker = _find_marker(updated.get("markers", []), marker_id)
            _json_response(
                self,
                200,
                {
                    "ok": True,
                    "action": body.get("action"),
                    "marker": marker,
                },
            )
            return

        if parsed.path != "/api/events":
            _json_response(self, 404, {"error": "Not found"})
            return

        try:
            body = _read_json_body(self)
        except json.JSONDecodeError:
            _json_response(self, 400, {"error": "Ungültiges JSON"})
            return

        user = str(body.get("user") or load_user_ids()[0])
        token = USER_TOKENS.get(user, "")
        if not token:
            _json_response(self, 400, _token_error(user))
            return

        start_date = body.get("startDate")
        end_date = body.get("endDate")
        try:
            events, total = fetch_all_events_cached(
                user,
                token,
                str(start_date) if start_date else None,
                str(end_date) if end_date else None,
            )
            _json_response(
                self,
                200,
                {"user": user, "events": events, "totalUsageEventsCount": total},
            )
        except Exception as exc:
            _json_response(self, 502, {"error": str(exc)})

    def do_PUT(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path != "/api/markers":
            _json_response(self, 404, {"error": "Not found"})
            return

        try:
            body = _read_json_body(self)
        except json.JSONDecodeError:
            _json_response(self, 400, {"error": "Ungültiges JSON"})
            return

        validated = _validate_markers_store(body)
        if validated is None:
            _json_response(self, 400, {"error": "Ungültiges Marker-Schema"})
            return

        try:
            with _markers_lock:
                _save_markers_store(validated)
            _json_response(self, 200, validated)
        except OSError as exc:
            _json_response(self, 500, {"error": str(exc)})


def main() -> None:
    port = int(os.getenv("CURSOR_WEB_PORT", "8060"))
    host = os.getenv("CURSOR_WEB_HOST", "127.0.0.1")
    server = ThreadingHTTPServer((host, port), CursorUsageHandler)
    configured = [user for user, token in USER_TOKENS.items() if token]
    base_url = f"http://{host}:{port}"
    print(f"Cursor Usage Dashboard auf {base_url}")
    print(f"  Hub:       {base_url}/")
    print(f"  Analytics: {base_url}/cursor-usage-analytics.html")
    if configured:
        print(f"Live-API: Benutzer {', '.join(configured)}")
    else:
        print("Live-API: keine Session-Tokens — nur CSV (siehe .env.example)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nBeendet.")
        server.server_close()


if __name__ == "__main__":
    main()
