# Public-Repo einrichten

Dieses Projekt nutzt **zwei Ordner**:

| Ordner | Zweck |
|--------|--------|
| `Cursor-Usage-Dashboard` (privat) | Persönliche Config, Roadmap, AI-Prompts, Historie |
| `Cursor-Usage-Dashboard-Public` | **Öffentliches Git-Repo** — ab v0.1 nur hier weiterarbeiten |

Die einmalige Migration vom privaten Ordner ins Public-Repo ist abgeschlossen. Für neue Setups reicht ein normaler Git-Clone.

## GitHub-Repo

**Public-Clone (saubere Historie):** https://github.com/70hundert/cursor-usage-analytics (derzeit **private**)

Das alte Repo `Cursor-Usage-Dashboard` auf GitHub bleibt mit der bisherigen Historie — nicht weiter nutzen für neue Arbeit.

## Repo klonen

```powershell
cd C:\Projekte
git clone https://github.com/70hundert/cursor-usage-analytics.git Cursor-Usage-Dashboard-Public
cd Cursor-Usage-Dashboard-Public
```

Falls du ein neues Remote-Repo anlegst:

```powershell
gh repo create <name> --private --source=. --remote=origin
git push -u origin main
```

Später public schalten: GitHub → Settings → Change visibility.

## Nach dem Klon

1. Cursor/IDE auf `Cursor-Usage-Dashboard-Public` öffnen
2. `config/users.json` aus `config/users.example.json` kopieren und anpassen
3. `.env` aus `.env.example` anlegen (optional, nur für Live-Modus)
4. `data/` für eigene CSV-Exports anlegen (optional — Demo-Daten liegen unter `samples/`)

**Demo out-of-the-box:** `users.example.json` enthält einen Demo-User mit `./samples/usage-events-demo.csv`. Projekt-Marker: `samples/project-markers-demo.json` wird beim ersten `python serve.py` nach `data/project-markers.json` kopiert, falls diese Datei noch fehlt.

Lokale Dateien, die **nicht** im Public-Repo landen (siehe `.gitignore`):

- `config/users.json`
- `docs/ROADMAP.md`, `docs/PROMPT-feature-reference.md`, `docs/VORLAGE-PROMPT-feature-reference.md`
- `.cursor/rules/feature-reference-workflow.mdc`

Diese bleiben im privaten Ordner oder nur lokal im Public-Clone (gitignored).

## Releases

```powershell
git tag v0.1.0
git push origin v0.1.0
gh release create v0.1.0 --title "v0.1.0" --notes "Initial public release"
```
