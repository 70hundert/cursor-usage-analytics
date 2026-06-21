# Cursor Usage Dashboard

Lokales Dashboard zur Analyse der **Cursor-Nutzung** — Token-Verlauf, Kosten, Modelle, Budget und Projekt-Marker. Für persönliche Multi-Account-Setups (CSV + optional inoffizielle Live-API).

**English:** [README_EN.md](README_EN.md)

## Seiten

| Seite | Fokus |
| ----- | ----- |
| [cursor-usage-analytics.html](cursor-usage-analytics.html) | **Kosten & Muster**, Live-Daten, Budget, Zoom |
| [index.html](index.html) | Hub / Navigation |

## Schnellstart

```powershell
git clone https://github.com/70hundert/cursor-usage-analytics.git
cd cursor-usage-analytics
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
python serve.py
```

Alternativ: `.\start.ps1` (nutzt venv, falls vorhanden)

Browser: **http://127.0.0.1:8060/**

> **Hinweis:** `file://` funktioniert nicht (ES-Modules, Fetch). Server nur lokal binden (`127.0.0.1`).

## Demo ohne Live-Token

Sofort ausprobieren mit synthetischen Daten unter [`samples/`](samples/):

```powershell
Copy-Item config\users.example.json config\users.json
python serve.py
```

Im Analytics-Dashboard den User **Demo** wählen — 4 Wochen Usage-Events und Beispiel-Projekt-Marker (Marker werden beim ersten Start nach `data/project-markers.json` übernommen, falls die Datei noch nicht existiert). Daten neu erzeugen: `python scripts/generate_demo_data.py`

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

**Kosten:** Werden nicht aus Tokens geschätzt, sondern aus der Spalte `Cost` (bzw. Live-API) übernommen und summiert — **ohne Gewähr**, nur zur Orientierung; maßgeblich ist die Cursor-Abrechnung. Konfigurierbar ist nur das **Monatsbudget** zum Abgleich. Details: [docs/REFERENCE.md — Kostenberechnung](docs/REFERENCE.md#kostenberechnung-analytics).

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
samples/                    # Demo-CSV + Marker (committed)
scripts/generate_demo_data.py
cursor-usage-analytics.html
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

Demo-Daten (User **Demo**), Zeitraum **Alle**:

| Übersicht & KPIs | Projekt-Marker | Einzelne Anfragen |
| ---------------- | -------------- | ----------------- |
| ![Analytics-Übersicht](docs/screenshots/analytics-overview.png) | ![Projekt-Marker](docs/screenshots/analytics-markers.png) | ![Events-Tabelle](docs/screenshots/events-table.png) |

Neu erzeugen: `python scripts/capture-screenshots.py` (Server muss laufen; im venv: `pip install playwright pillow` + `playwright install chromium`).

## Bekannte Einschränkungen

- Python-Server erforderlich
- Chart.js via jsDelivr (CDN) — Offline nur mit lokalem Vendor
- Enterprise Admin API nicht implementiert
- Sehr große Event-Mengen → Browser-Performance

## Feedback

Frühe Version (v0.1) — ein persönliches Side-Project. Issues, Bugreports und Verbesserungsvorschläge sind willkommen. Bei größeren Änderungen bitte vorher ein Issue eröffnen. Siehe auch [SECURITY.md](SECURITY.md) für sensible Meldungen.

## Lizenz

[MIT](LICENSE)

## Zwei Repos (privat + public)

Persönliche Planung und AI-Vorlagen bleiben lokal gitignored. Für ein öffentliches Repo mit sauberer Historie: [docs/PUBLIC_REPO.md](docs/PUBLIC_REPO.md).
