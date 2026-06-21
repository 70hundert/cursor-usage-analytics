#!/usr/bin/env python3
"""Capture README screenshots (local dev). Requires: pip install playwright pillow && playwright install chromium."""

from __future__ import annotations

import argparse
import os
import shutil
import sys
import time
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "docs" / "screenshots"
MARKERS_PATH = ROOT / "data" / "project-markers.json"
MARKERS_SAMPLE_PATH = ROOT / "samples" / "project-markers-demo.json"
MARKERS_BACKUP_PATH = ROOT / "data" / "project-markers.json.screenshot-backup"
BASE_URL = os.getenv("SCREENSHOT_BASE_URL", "http://127.0.0.1:8060")
VIEWPORT = {"width": 1400, "height": 900}


@dataclass
class DemoMarkerSwap:
    """Temporary demo markers for reproducible README shots; restore in finally."""

    had_existing: bool


def seed_markers_if_missing() -> None:
    if MARKERS_PATH.is_file():
        return
    if not MARKERS_SAMPLE_PATH.is_file():
        return
    MARKERS_PATH.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy(MARKERS_SAMPLE_PATH, MARKERS_PATH)
    print("Seeded data/project-markers.json from samples (file was missing).")


def enter_demo_markers() -> DemoMarkerSwap:
    if not MARKERS_SAMPLE_PATH.is_file():
        raise RuntimeError(f"Demo markers missing: {MARKERS_SAMPLE_PATH}")

    had_existing = MARKERS_PATH.is_file()
    MARKERS_PATH.parent.mkdir(parents=True, exist_ok=True)

    if had_existing:
        shutil.copy(MARKERS_PATH, MARKERS_BACKUP_PATH)
        print(f"Backed up {MARKERS_PATH.name} → {MARKERS_BACKUP_PATH.name}")

    shutil.copy(MARKERS_SAMPLE_PATH, MARKERS_PATH)
    print("Using demo markers for this run (--demo-markers).")
    return DemoMarkerSwap(had_existing=had_existing)


def exit_demo_markers(swap: DemoMarkerSwap | None) -> None:
    if swap is None:
        return

    if swap.had_existing:
        if not MARKERS_BACKUP_PATH.is_file():
            raise RuntimeError(f"Marker backup missing: {MARKERS_BACKUP_PATH}")
        shutil.copy(MARKERS_BACKUP_PATH, MARKERS_PATH)
        MARKERS_BACKUP_PATH.unlink()
        print(f"Restored {MARKERS_PATH.name} from backup.")
    else:
        MARKERS_PATH.unlink(missing_ok=True)
        print("Removed temporary demo markers (no prior file existed).")


def wait_for_server(page, attempts: int = 30) -> None:
    for _ in range(attempts):
        try:
            response = page.goto(f"{BASE_URL}/health", wait_until="domcontentloaded", timeout=3000)
            if response and response.ok:
                return
        except Exception:
            pass
        time.sleep(0.5)
    raise RuntimeError(f"Server not reachable at {BASE_URL} — start with: python serve.py")


def wait_for_dashboard(page) -> None:
    page.goto(f"{BASE_URL}/cursor-usage-analytics.html", wait_until="networkidle")
    page.wait_for_selector("#kpi-grid > *", timeout=30000)
    page.wait_for_selector("#overview-section:not([hidden])", timeout=30000)
    page.wait_for_function(
        """() => {
            const canvas = document.getElementById('chart-overview-daily');
            return canvas instanceof HTMLCanvasElement && canvas.width > 0;
        }""",
        timeout=30000,
    )


def wait_for_chart_paint(page) -> None:
    page.wait_for_function(
        """() => {
            const canvas = document.getElementById('chart-overview-daily');
            if (!(canvas instanceof HTMLCanvasElement) || canvas.width < 10) return false;
            const ctx = canvas.getContext('2d');
            if (!ctx) return false;
            const { width, height } = canvas;
            const data = ctx.getImageData(0, 0, width, height).data;
            for (let i = 3; i < data.length; i += 4) {
                if (data[i] > 0) return true;
            }
            return false;
        }""",
        timeout=30000,
    )
    time.sleep(0.6)


def screenshot_region(page, selectors: list[str], filename: str) -> None:
    for sel in selectors:
        page.locator(sel).first.scroll_into_view_if_needed()
    time.sleep(0.4)
    box = page.evaluate(
        """(sels) => {
            const els = sels.map(s => document.querySelector(s)).filter(Boolean);
            if (!els.length) return null;
            const rects = els.map(el => el.getBoundingClientRect());
            const top = Math.min(...rects.map(r => r.top));
            const left = Math.min(...rects.map(r => r.left));
            const bottom = Math.max(...rects.map(r => r.bottom));
            const right = Math.max(...rects.map(r => r.right));
            const pad = 8;
            return {
                x: Math.max(0, left - pad),
                y: Math.max(0, top - pad),
                width: right - left + pad * 2,
                height: bottom - top + pad * 2,
            };
        }""",
        selectors,
    )
    if not box:
        raise RuntimeError(f"No elements found for {selectors}")
    page.screenshot(path=str(OUT_DIR / filename), clip=box)
    print(f"  {filename}")


def screenshot_stacked(page, selectors: list[str], filename: str) -> None:
    images: list[Image.Image] = []
    for sel in selectors:
        locator = page.locator(sel).first
        locator.scroll_into_view_if_needed()
        time.sleep(0.35)
        images.append(Image.open(BytesIO(locator.screenshot())))
    width = max(img.width for img in images)
    height = sum(img.height for img in images)
    combined = Image.new("RGB", (width, height), (15, 23, 42))
    y = 0
    for img in images:
        combined.paste(img, (0, y))
        y += img.height
    combined.save(OUT_DIR / filename)
    print(f"  {filename}")


def prepare_dashboard_view(page, *, expect_demo_markers: bool) -> None:
    all_btn = page.locator('button[data-all="true"]').first
    if all_btn.is_visible():
        all_btn.click()
        time.sleep(0.5)

    page.select_option("#granularity-select", "day")
    time.sleep(0.5)
    wait_for_chart_paint(page)

    show_btn = page.locator("[data-marker-chart-visible]").first
    if show_btn.count() and show_btn.get_attribute("aria-pressed") != "true":
        show_btn.click()
        time.sleep(0.3)

    labels_btn = page.locator("[data-marker-chart-labels]").first
    if labels_btn.count() and labels_btn.get_attribute("aria-pressed") != "true":
        labels_btn.click()
        time.sleep(0.3)

    wait_for_chart_paint(page)

    if expect_demo_markers:
        page.wait_for_selector("#marker-table-body tr", timeout=30000)
    else:
        try:
            page.wait_for_selector("#marker-table-body tr", timeout=5000)
        except Exception:
            print("  (no marker rows in table — continuing)")


def capture_screenshots(page, *, reload_after_marker_swap: bool) -> None:
    wait_for_dashboard(page)
    if reload_after_marker_swap:
        page.reload(wait_until="networkidle")
        wait_for_dashboard(page)

    prepare_dashboard_view(page, expect_demo_markers=reload_after_marker_swap)

    print("Capturing screenshots …")
    screenshot_region(
        page,
        [".page-header", "#kpi-grid", "#overview-section"],
        "analytics-overview.png",
    )
    screenshot_stacked(
        page,
        ["#overview-section", "#marker-card"],
        "analytics-markers.png",
    )

    events_heading = page.locator("h2", has_text="Einzelne Anfragen")
    if events_heading.count() == 0:
        events_heading = page.locator("h2", has_text="Individual requests")
    events_heading.scroll_into_view_if_needed()
    page.wait_for_selector("#events-table-body tr", timeout=15000)
    time.sleep(0.4)
    events_section = events_heading.locator("xpath=ancestor::section[contains(@class,'card')]")
    events_section.screenshot(path=str(OUT_DIR / "events-table.png"))
    print("  events-table.png")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Capture dashboard PNGs for docs/screenshots/.")
    parser.add_argument(
        "--demo-markers",
        action="store_true",
        help="Temporarily use samples/project-markers-demo.json (backup + restore). "
        "For README shots with config/users.example.json (user: demo).",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    demo_markers = args.demo_markers or os.getenv("SCREENSHOT_USE_DEMO", "").lower() in (
        "1",
        "true",
        "yes",
    )

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    marker_swap: DemoMarkerSwap | None = None
    if demo_markers:
        marker_swap = enter_demo_markers()
    else:
        seed_markers_if_missing()
        print("Existing data/project-markers.json left unchanged (use --demo-markers for README demo).")

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport=VIEWPORT, device_scale_factor=1)
            try:
                print(f"Waiting for {BASE_URL} …")
                wait_for_server(page)
                print("Loading dashboard …")
                capture_screenshots(page, reload_after_marker_swap=demo_markers)
            finally:
                browser.close()
    finally:
        exit_demo_markers(marker_swap)

    print(f"Done — {OUT_DIR}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
