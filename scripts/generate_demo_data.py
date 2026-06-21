#!/usr/bin/env python3
"""
Erzeugt synthetische Demo-Daten für das Cursor Usage Dashboard.

Ausgabe:
  samples/usage-events-demo.csv
  samples/project-markers-demo.json

Aufruf (Projektroot):
  python scripts/generate_demo_data.py
"""

from __future__ import annotations

import csv
import json
import random
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parent.parent
SAMPLES_DIR = PROJECT_DIR / "samples"
CSV_PATH = SAMPLES_DIR / "usage-events-demo.csv"
MARKERS_PATH = SAMPLES_DIR / "project-markers-demo.json"

USER_ID = "demo"
END_DATE = datetime(2026, 6, 21, tzinfo=timezone.utc)
DAYS = 28
RANDOM_SEED = 42

CSV_HEADER = [
    "Date",
    "Kind",
    "Model",
    "Max Mode",
    "Input (w/ Cache Write)",
    "Input (w/o Cache Write)",
    "Cache Read",
    "Output Tokens",
    "Total Tokens",
    "Cost",
]

MODELS = [
    ("claude-4-sonnet", 0.40),
    ("gpt-4o", 0.25),
    ("composer-1", 0.20),
    ("cursor-small", 0.15),
]

MARKER_TEMPLATES = [
    ("Web App", "Auth flow implementieren", "Login und Session-Handling"),
    ("API Backend", "REST endpoints", "CRUD für Nutzer-Ressourcen"),
    ("Docs", "README aktualisieren", "Setup-Anleitung für Demo"),
    ("Refactoring", "Parser vereinfachen", "Duplikate entfernen"),
    ("Web App", "Dashboard layout", "Responsive Toolbar"),
    ("API Backend", "Error handling", "Einheitliche Fehlerantworten"),
    ("Refactoring", "Tests ergänzen", "Smoke tests für CSV-Import"),
    ("Docs", "Screenshots", "Hub und Analytics"),
]


def weighted_choice(items: list[tuple[str, float]], rng: random.Random) -> str:
    labels, weights = zip(*items)
    return rng.choices(labels, weights=weights, k=1)[0]


def events_for_day(day: datetime, rng: random.Random) -> int:
    if day.weekday() >= 5:
        return rng.randint(4, 10)
    return rng.randint(18, 32)


def random_timestamp(day: datetime, rng: random.Random) -> datetime:
    hour = rng.randint(8, 21)
    minute = rng.randint(0, 59)
    second = rng.randint(0, 59)
    return day.replace(hour=hour, minute=minute, second=second, microsecond=rng.randint(0, 999000))


def generate_event(ts: datetime, rng: random.Random) -> dict[str, str | int]:
    included = rng.random() < 0.15
    model = weighted_choice(MODELS, rng)
    max_mode = "Yes" if rng.random() < 0.08 else "No"

    input_with_cache = rng.randint(200, 4000) if rng.random() < 0.35 else 0
    input_no_cache = rng.randint(300, 8000)
    cache_read = rng.randint(0, 12000) if rng.random() < 0.55 else 0
    output_tokens = rng.randint(80, 3500)
    total_tokens = input_with_cache + input_no_cache + cache_read + output_tokens

    if included:
        kind = "Included"
        cost = "Included"
    else:
        kind = "USAGE"
        cents = rng.randint(1, 18)
        cost = f"${cents / 100:.2f}"

    return {
        "Date": ts.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
        "Kind": kind,
        "Model": model,
        "Max Mode": max_mode,
        "Input (w/ Cache Write)": input_with_cache,
        "Input (w/o Cache Write)": input_no_cache,
        "Cache Read": cache_read,
        "Output Tokens": output_tokens,
        "Total Tokens": total_tokens,
        "Cost": cost,
    }


def generate_events(rng: random.Random) -> list[dict[str, str | int]]:
    start_day = (END_DATE - timedelta(days=DAYS - 1)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    events: list[dict[str, str | int]] = []

    for offset in range(DAYS):
        day = start_day + timedelta(days=offset)
        count = events_for_day(day, rng)
        timestamps = sorted(random_timestamp(day, rng) for _ in range(count))
        for ts in timestamps:
            events.append(generate_event(ts, rng))

    events.sort(key=lambda row: row["Date"])
    return events


def iso_now(ts: datetime) -> str:
    return ts.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def generate_markers(rng: random.Random, events: list[dict[str, str | int]]) -> dict:
    start_day = datetime.fromisoformat(str(events[0]["Date"]).replace("Z", "+00:00"))
    end_day = datetime.fromisoformat(str(events[-1]["Date"]).replace("Z", "+00:00"))
    span_days = max(1, (end_day - start_day).days)

    markers = []
    for index, (project, task, note) in enumerate(MARKER_TEMPLATES):
        day_offset = int(span_days * (index + 1) / (len(MARKER_TEMPLATES) + 1))
        marker_day = start_day + timedelta(days=day_offset)
        start_hour = rng.randint(9, 16)
        start_ts = marker_day.replace(
            hour=start_hour,
            minute=rng.randint(0, 45),
            second=0,
            microsecond=0,
        )
        duration_minutes = rng.randint(45, 180)
        end_ts = start_ts + timedelta(minutes=duration_minutes)
        created_ts = start_ts - timedelta(minutes=rng.randint(1, 10))

        markers.append(
            {
                "id": f"m-{uuid.uuid5(uuid.NAMESPACE_DNS, f'demo-marker-{index}')}",
                "user": USER_ID,
                "start": iso_now(start_ts),
                "end": iso_now(end_ts) if rng.random() < 0.85 else None,
                "project": project,
                "task": task,
                "note": note,
                "createdAt": iso_now(created_ts),
                "updatedAt": iso_now(end_ts),
            }
        )

    return {"version": 1, "markers": markers}


def write_csv(events: list[dict[str, str | int]]) -> None:
    SAMPLES_DIR.mkdir(parents=True, exist_ok=True)
    with CSV_PATH.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=CSV_HEADER)
        writer.writeheader()
        writer.writerows(events)


def write_markers(store: dict) -> None:
    SAMPLES_DIR.mkdir(parents=True, exist_ok=True)
    MARKERS_PATH.write_text(
        json.dumps(store, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    rng = random.Random(RANDOM_SEED)
    events = generate_events(rng)
    markers = generate_markers(rng, events)

    write_csv(events)
    write_markers(markers)

    chargeable = sum(1 for event in events if event["Cost"] != "Included")
    print(f"Wrote {len(events)} events to {CSV_PATH.relative_to(PROJECT_DIR)}")
    print(f"  chargeable: {chargeable}, included: {len(events) - chargeable}")
    print(f"Wrote {len(markers['markers'])} markers to {MARKERS_PATH.relative_to(PROJECT_DIR)}")


if __name__ == "__main__":
    main()
