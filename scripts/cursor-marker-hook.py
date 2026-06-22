#!/usr/bin/env python3
"""
Cursor User-Hook: Projekt-Marker automatisch aus Composer-Sessions (Agent/Edit).

Install: scripts/setup-marker-hooks.ps1
Config:  ~/.cursor/marker-hook.json (Vorlage: config/marker-hook.example.json)
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

CONFIG_PATH = Path.home() / ".cursor" / "marker-hook.json"
STATE_PATH = Path.home() / ".cursor" / "marker-hook-state.json"
DEFAULT_MODES = frozenset({"agent", "edit", "chat"})
MODE_NOTE_LABELS = {
    "agent": "Modus: Agent",
    "edit": "Modus: Edit",
    "chat": "Modus: Chat",
}
EVENT_ACTIONS = {
    "sessionStart": "start",
    "beforeSubmitPrompt": "prompt",
    "sessionEnd": "end",
}


def _load_json(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8-sig"))
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def _save_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def _load_config() -> dict[str, Any]:
    config = _load_json(CONFIG_PATH)
    default_user = os.getenv("CURSOR_MARKER_DEFAULT_USER", "").strip()
    if default_user and not str(config.get("defaultUser") or "").strip():
        config["defaultUser"] = default_user
    api_base = os.getenv("CURSOR_MARKER_API_BASE", "").strip()
    if api_base:
        config["apiBase"] = api_base
    return config


def _allowed_modes(config: dict[str, Any]) -> frozenset[str]:
    modes = config.get("modes")
    if isinstance(modes, list) and modes:
        return frozenset(str(mode).strip().lower() for mode in modes if str(mode).strip())
    return DEFAULT_MODES


def _resolve_user(config: dict[str, Any], payload: dict[str, Any]) -> str:
    email = str(payload.get("user_email") or "").strip().lower()
    email_map = config.get("emailMap")
    if email and isinstance(email_map, dict):
        mapped = email_map.get(email) or email_map.get(payload.get("user_email"))
        if mapped:
            return str(mapped).strip()
    default_user = str(config.get("defaultUser") or "").strip()
    if default_user:
        return default_user
    return "primary"


def _resolve_project(payload: dict[str, Any]) -> str:
    roots = payload.get("workspace_roots")
    if isinstance(roots, list) and roots:
        first = str(roots[0] or "").strip()
        if first:
            return Path(first).name or first
    project_dir = os.getenv("CURSOR_PROJECT_DIR", "").strip()
    if project_dir:
        return Path(project_dir).name or project_dir
    return "Unknown"


def _session_id(payload: dict[str, Any]) -> str:
    return str(
        payload.get("conversation_id")
        or payload.get("session_id")
        or ""
    ).strip()


def _explicit_composer_mode(payload: dict[str, Any]) -> str:
    return str(payload.get("composer_mode") or "").strip().lower()


def _default_composer_mode(config: dict[str, Any], allowed: frozenset[str]) -> str:
    default = str(config.get("defaultComposerMode") or "agent").strip().lower()
    if default in allowed:
        return default
    return ""


def _resolve_composer_mode(
    payload: dict[str, Any],
    config: dict[str, Any],
    allowed: frozenset[str],
    session_id: str,
    *,
    use_default: bool,
) -> str:
    """Payload → Hook-State → Config-Default (nur wenn use_default)."""
    explicit = _explicit_composer_mode(payload)
    if explicit:
        if explicit == _PLAN_MODE or explicit not in allowed:
            return ""
        return explicit

    if session_id:
        stored = _read_state(session_id)
        from_state = str(stored.get("composer_mode") or "").strip().lower()
        if from_state in allowed:
            return from_state

    if use_default:
        return _default_composer_mode(config, allowed)
    return ""


def _repair_text(text: str) -> str:
    """Fix UTF-8 mojibake when Windows passes hook JSON with wrong code page."""
    if not text:
        return text
    for encoding in ("latin-1", "cp1252"):
        try:
            repaired = text.encode(encoding).decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            continue
        if repaired != text and "\ufffd" not in repaired:
            return repaired
    return text


def _mode_note(composer_mode: str) -> str:
    mode = str(composer_mode or "").strip().lower()
    return MODE_NOTE_LABELS.get(mode, f"Modus: {mode}" if mode else "")


def _truncate_task(text: str, max_len: int = 120) -> str:
    cleaned = " ".join(_repair_text(str(text or "")).split())
    if len(cleaned) <= max_len:
        return cleaned
    return cleaned[: max_len - 1].rstrip() + "…"


_PLAN_MODE = "plan"
_PLAN_BOILERPLATE_PREFIXES = (
    "implement the plan as specified",
    "to-do's from the plan have already been created",
    "todos from the plan have already been created",
)
_PLACEHOLDER_TASKS = frozenset({"", "Neuer Chat", "New chat"})
_VALID_COMPOSER_MODES = frozenset({"agent", "edit", "chat"})


def _normalize_composer_mode(value: str) -> str | None:
    mode = str(value or "").strip().lower()
    if mode in _VALID_COMPOSER_MODES:
        return mode
    return None


def _apply_composer_mode(marker: dict[str, Any], composer_mode: str) -> None:
    normalized = _normalize_composer_mode(composer_mode)
    if normalized:
        marker["composerMode"] = normalized


def _is_boilerplate_task(text: str) -> bool:
    normalized = " ".join(_repair_text(str(text or "")).split()).lower()
    if not normalized:
        return True
    return any(normalized.startswith(prefix) for prefix in _PLAN_BOILERPLATE_PREFIXES)


def _is_replaceable_task(text: str) -> bool:
    cleaned = str(text or "").strip()
    return cleaned in _PLACEHOLDER_TASKS or _is_boilerplate_task(cleaned)


def _task_from_prompt(prompt: str) -> str:
    for line in str(prompt or "").splitlines():
        cleaned = line.strip()
        if cleaned and not _is_boilerplate_task(cleaned):
            return _truncate_task(cleaned)
    return ""


def _read_pending_task(session_id: str) -> str:
    stored = _read_state(session_id)
    pending = _truncate_task(str(stored.get("pending_task") or ""))
    if pending and not _is_boilerplate_task(pending):
        return pending
    return ""


def _resolve_task(session_id: str, prompt: str) -> str:
    task = _task_from_prompt(prompt)
    if task:
        return task
    return _read_pending_task(session_id)


def _update_state(
    session_id: str,
    composer_mode: str,
    project: str,
    *,
    pending_task: str | None = None,
) -> None:
    if not session_id:
        return
    state = _load_json(STATE_PATH)
    entry = state.get(session_id)
    if not isinstance(entry, dict):
        entry = {}
    if composer_mode:
        entry["composer_mode"] = composer_mode
    if project:
        entry["project"] = project
    if pending_task:
        entry["pending_task"] = _truncate_task(pending_task)
    state[session_id] = entry
    _save_json(STATE_PATH, state)


def _read_state(session_id: str) -> dict[str, Any]:
    state = _load_json(STATE_PATH)
    entry = state.get(session_id)
    return entry if isinstance(entry, dict) else {}


def _clear_state(session_id: str) -> None:
    if not session_id:
        return
    state = _load_json(STATE_PATH)
    if session_id in state:
        del state[session_id]
        _save_json(STATE_PATH, state)


def _build_request_body(
    action: str,
    payload: dict[str, Any],
    config: dict[str, Any],
    *,
    composer_mode: str,
    project: str,
) -> dict[str, Any]:
    session_id = _session_id(payload)
    body: dict[str, Any] = {
        "action": action,
        "sessionId": session_id,
        "user": _resolve_user(config, payload),
        "project": project,
        "note": _mode_note(composer_mode),
        "composerMode": composer_mode,
    }
    if action in {"start", "prompt"}:
        prompt = str(payload.get("prompt") or "")
        body["task"] = _resolve_task(session_id, prompt) if action == "prompt" else _read_pending_task(session_id)
    return body


def _post_session(api_base: str, body: dict[str, Any]) -> bool:
    url = f"{api_base.rstrip('/')}/api/markers/session"
    data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=3) as response:
            return 200 <= response.status < 300
    except (urllib.error.URLError, TimeoutError, OSError):
        return False


def _fallback_write(config: dict[str, Any], body: dict[str, Any]) -> bool:
    fallback_path = config.get("fallbackWritePath")
    dashboard_root = config.get("dashboardRoot")
    target: Path | None = None

    if isinstance(fallback_path, str) and fallback_path.strip():
        target = Path(fallback_path.strip())
    elif isinstance(dashboard_root, str) and dashboard_root.strip():
        target = Path(dashboard_root.strip()) / "data" / "project-markers.json"

    if target is None:
        return False

    try:
        if target.is_file():
            store_data = json.loads(target.read_text(encoding="utf-8"))
        else:
            store_data = {"version": 1, "markers": []}
        if not isinstance(store_data, dict) or not isinstance(store_data.get("markers"), list):
            store_data = {"version": 1, "markers": []}

        updated, error = _apply_marker_session_local(store_data, body)
        if error:
            print(error.get("error", "fallback failed"), file=sys.stderr)
            return False
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(updated, ensure_ascii=False, indent=2), encoding="utf-8")
        return True
    except (OSError, json.JSONDecodeError) as exc:
        print(f"fallback write failed: {exc}", file=sys.stderr)
        return False


def _apply_marker_session_local(
    store: dict[str, Any],
    body: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any] | None]:
    """Minimal duplicate of serve.py logic for offline fallback."""
    action = str(body.get("action") or "").strip()
    session_id = str(body.get("sessionId") or "").strip()
    user = str(body.get("user") or "primary").strip()
    project = str(body.get("project") or "").strip()
    note = str(body.get("note") or "").strip()
    task = _truncate_task(str(body.get("task") or ""))
    composer_mode = str(body.get("composerMode") or "").strip().lower()

    if action not in {"start", "prompt", "end"}:
        return store, {"error": "Unbekannte action"}
    if not session_id:
        return store, {"error": "sessionId fehlt"}

    from datetime import datetime, timezone

    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    marker_id = f"m-cursor-{session_id}"
    markers = [dict(marker) for marker in store.get("markers", [])]

    def find_marker() -> dict[str, Any] | None:
        for marker in markers:
            if marker.get("id") == marker_id:
                return marker
        return None

    if action == "start":
        if not project:
            return store, {"error": "project fehlt"}
        for marker in markers:
            if marker.get("user") == user and marker.get("end") is None and marker.get("id") != marker_id:
                marker["end"] = now
                marker["updatedAt"] = now
        existing = find_marker()
        if existing:
            existing.update(
                {
                    "start": now,
                    "end": None,
                    "project": project,
                    "user": user,
                    "updatedAt": now,
                }
            )
            if note:
                existing["note"] = note
            if task and _is_replaceable_task(str(existing.get("task") or "")):
                existing["task"] = task
            _apply_composer_mode(existing, composer_mode)
        else:
            marker = {
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
            _apply_composer_mode(marker, composer_mode)
            markers.append(marker)
    elif action == "prompt":
        existing = find_marker()
        if not existing:
            if not project:
                return store, {"error": "Marker nicht gefunden und project fehlt"}
            marker = {
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
            _apply_composer_mode(marker, composer_mode)
            markers.append(marker)
        elif task and _is_replaceable_task(str(existing.get("task") or "")):
            existing["task"] = task
            existing["updatedAt"] = now
            if not existing.get("composerMode"):
                _apply_composer_mode(existing, composer_mode)
    elif action == "end":
        existing = find_marker()
        if existing and existing.get("end") is None:
            existing["end"] = now
            existing["updatedAt"] = now

    return {"version": int(store.get("version") or 1), "markers": markers}, None


def _capture_plan_task(payload: dict[str, Any], session_id: str, project: str) -> None:
    composer_mode = str(payload.get("composer_mode") or _PLAN_MODE).strip().lower()
    task = _task_from_prompt(str(payload.get("prompt") or ""))
    if task:
        _update_state(session_id, composer_mode, project, pending_task=task)


def _dispatch(payload: dict[str, Any]) -> None:
    event_name = str(payload.get("hook_event_name") or "").strip()
    action = EVENT_ACTIONS.get(event_name)
    if not action:
        return

    config = _load_config()
    allowed = _allowed_modes(config)
    session_id = _session_id(payload)
    project = _resolve_project(payload)

    if event_name == "beforeSubmitPrompt":
        if _explicit_composer_mode(payload) == _PLAN_MODE:
            if session_id:
                _capture_plan_task(payload, session_id, project)
            return

    composer_mode = _resolve_composer_mode(
        payload,
        config,
        allowed,
        session_id,
        use_default=event_name in {"sessionStart", "beforeSubmitPrompt", "sessionEnd"},
    )
    if not composer_mode:
        return

    if (not project or project == "Unknown") and session_id:
        stored_project = str(_read_state(session_id).get("project") or "").strip()
        if stored_project:
            project = stored_project

    if event_name in {"sessionStart", "beforeSubmitPrompt"}:
        _update_state(session_id, composer_mode, project)

    body = _build_request_body(
        action,
        payload,
        config,
        composer_mode=composer_mode,
        project=project,
    )
    if not body.get("sessionId"):
        return

    api_base = str(config.get("apiBase") or "http://127.0.0.1:8060").strip()
    if _post_session(api_base, body):
        if event_name == "sessionEnd":
            _clear_state(session_id)
        return

    if _fallback_write(config, body):
        if event_name == "sessionEnd":
            _clear_state(session_id)
        return

    print(
        f"marker hook: API unreachable ({api_base}) and no fallback configured",
        file=sys.stderr,
    )


def _read_hook_payload() -> dict[str, Any]:
    env_payload = os.environ.get("CURSOR_HOOK_PAYLOAD", "").strip()
    if env_payload:
        parsed = json.loads(env_payload)
        return parsed if isinstance(parsed, dict) else {}

    raw_bytes = sys.stdin.buffer.read()
    if not raw_bytes:
        return {}

    for encoding in ("utf-8-sig", "utf-8", "cp1252", "latin-1", "utf-16", "utf-16-le", "utf-16-be"):
        try:
            raw = raw_bytes.decode(encoding).strip()
        except UnicodeDecodeError:
            continue
        if not raw:
            return {}
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            continue

    raise json.JSONDecodeError("Could not decode hook payload", str(raw_bytes[:80]), 0)


def main() -> int:
    try:
        payload = _read_hook_payload()
    except json.JSONDecodeError as exc:
        print(f"marker hook: invalid stdin JSON: {exc}", file=sys.stderr)
        print("{}")
        return 0

    if not isinstance(payload, dict):
        print("{}")
        return 0

    try:
        _dispatch(payload)
    except Exception as exc:
        print(f"marker hook: {exc}", file=sys.stderr)

    print("{}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
