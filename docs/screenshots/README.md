# Screenshots for README

Committed PNGs used in [README.md](../../README.md) and [README_EN.md](../../README_EN.md).

| File | Content |
|------|---------|
| `analytics-overview.png` | Analytics dashboard — KPIs and overview chart |
| `analytics-markers.png` | Project markers on chart + marker table |
| `events-table.png` | Individual requests table with filters |

## Regenerate

```powershell
Copy-Item config\users.example.json config\users.json -ErrorAction SilentlyContinue
python serve.py
# second terminal:
python scripts\capture-screenshots.py
```

Requires Playwright and Pillow in the local venv (`pip install playwright pillow`, then `playwright install chromium`) — dev only, not a runtime dependency.

Recommended viewport: 1400 px width, dark theme as shipped.
