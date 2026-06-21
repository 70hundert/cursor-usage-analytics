# Cursor Usage Dashboard

Lokales Dashboard zur Analyse der **Cursor-Nutzung** — Token-Verlauf, Kosten, Modelle, Budget und Projekt-Marker. Für persönliche Multi-Account-Setups (CSV + optional inoffizielle Live-API).

**English:** [README_EN.md](README_EN.md)

## Seiten

| Seite | Fokus |
| ----- | ----- |
| [usage-events-chart.html](usage-events-chart.html) | Token-**Verlauf** pro Event (Zoom/Pan) |
| [cursor-usage-analytics.html](cursor-usage-analytics.html) | **Kosten & Muster**, Live-Daten, Budget |
| [index.html](index.html) | Hub / Navigation |

## Schnellstart

```powershell
cd path\to\Cursor-Usage-Dashboard
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
python serve.py
```

Alternativ: `.\start.ps1` (nutzt venv, falls vorhanden)

Browser: **http://127.0.0.1:8060/**

> **Hinweis:** `file://` funktioniert nicht (ES-Modules, Fetch). Server nur lokal binden (`127.0.0.1`).

## Benutzer konfigurieren

Bearbeite [`config/users.json`](config/users.json) (Vorlage: [`config/users.example.json`](config/users.example.json)):

```json
{
  "users": [
    {
      "id": "primary",
      "label": "Primary",
      "defaultCsvPaths": ["./data/usage-events-primary.csv"]
    }
  ]
}
```

Live-Tokens in `.env` (aus `.env.example`):

```
CURSOR_SESSION_TOKEN_PRIMARY=...
```

Env-Variable: `CURSOR_SESSION_TOKEN_<ID>` (ID aus `users.json`, Großbuchstaben).

Token: DevTools → Application → Cookies → `https://cursor.com` → `WorkosCursorSessionToken`

## Datenquellen

### CSV-Export

Cursor Dashboard → Usage → Export nach `data/` — Pfade in `config/users.json` eintragen.

Erwartete Spalten u. a.: `Date`, `Model`, `Kind`, `Cost`, Token-Spalten.

### Live-API (inoffiziell)

Reverse-engineered Endpoints (Quelle: [dmwyatt/cursor-usage](https://github.com/dmwyatt/cursor-usage)):

- `GET /api/usage-summary`
- `POST /api/dashboard/get-filtered-usage-events`

Im Analytics-Dashboard: **Live (Proxy)** oder **Beides**. Health: http://127.0.0.1:8060/health

**Disclaimer:** Keine offizielle Personal-API. Endpoints können sich ändern; Session-Tokens laufen ab. Nutzung auf eigenes Risiko — Cursor-Nutzungsbedingungen beachten.

## Konfiguration

| Variable | Standard | Beschreibung |
| -------- | -------- | ------------ |
| `CURSOR_WEB_HOST` | `127.0.0.1` | Bind-Adresse (nicht öffentlich exponieren) |
| `CURSOR_WEB_PORT` | `8060` | HTTP-Port |
| `CURSOR_SESSION_TOKEN_<USER>` | — | Session-Token pro User-ID aus `config/users.json` |

## Projektstruktur

```
serve.py
config/users.example.json   # nach config/users.json kopieren
cursor-usage-analytics.html
usage-events-chart.html
static/cursor-analytics/   # parser, metrics, charts, markers, users-config, i18n
data/                      # CSV-Exports (gitignored, lokal anlegen)
docs/REFERENCE.md
```

## Related projects

| Projekt | Fokus |
| ------- | ----- |
| [dmwyatt/cursor-usage](https://github.com/dmwyatt/cursor-usage) | CLI für inoffizielle API |
| [ofershap/cursor-usage-tracker](https://github.com/ofershap/cursor-usage-tracker) | Enterprise-Teams, Alerts, Admin-API |
| [apptension/curstat](https://github.com/apptension/curstat) | Persönlich, nur CSV-Upload |

## Screenshots

Siehe [docs/screenshots/README.md](docs/screenshots/README.md) — PNGs vor Release ergänzen.

## Bekannte Einschränkungen

- Python-Server erforderlich
- Chart.js via jsDelivr (CDN) — Offline nur mit lokalem Vendor
- Enterprise Admin API nicht implementiert
- Event-Chart: keine Kosten-Analyse; Analytics: kein Event-Zoom wie Event-Chart
- Sehr große Event-Mengen → Browser-Performance

## Lizenz

[MIT](LICENSE)

## Zwei Repos (privat + public)

Persönliche Planung und AI-Vorlagen bleiben lokal gitignored. Für ein öffentliches Repo mit sauberer Historie: [docs/PUBLIC_REPO.md](docs/PUBLIC_REPO.md).
