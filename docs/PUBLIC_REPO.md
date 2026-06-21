# Lokales Setup

**GitHub:** https://github.com/70hundert/cursor-usage-analytics (public seit v0.1.0)

## Repo klonen

```powershell
cd C:\Projekte
git clone https://github.com/70hundert/cursor-usage-analytics.git
cd cursor-usage-analytics
```

## Nach dem Klon

1. Projektordner in Cursor/IDE öffnen
2. `config/users.json` aus `config/users.example.json` kopieren und anpassen
3. `.env` aus `.env.example` anlegen (optional, nur für Live-Modus)
4. `data/` für eigene CSV-Exports anlegen (optional — Demo-Daten liegen unter `samples/`)

**Demo out-of-the-box:** `users.example.json` enthält einen Demo-User mit `./samples/usage-events-demo.csv`. Projekt-Marker: `samples/project-markers-demo.json` wird beim ersten `python serve.py` nach `data/project-markers.json` kopiert, falls diese Datei noch fehlt.

## Lokale Dateien (nicht im Git)

Diese Dateien sind in `.gitignore` und bleiben nur auf deinem Rechner:

- `config/users.json`
- `docs/ROADMAP.md`, `docs/PROMPT-feature-reference.md`, `docs/VORLAGE-PROMPT-feature-reference.md`
- `.cursor/rules/feature-reference-workflow.mdc`

## Releases

```powershell
git tag v0.1.0
git push origin v0.1.0
gh release create v0.1.0 --title "v0.1.0" --notes "Initial public release"
```

## Maintainer: neues Remote-Repo anlegen

```powershell
gh repo create <name> --public --source=. --remote=origin
git push -u origin main
```
