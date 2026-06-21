# Public-Repo einrichten

Dieses Projekt nutzt **zwei Ordner**:

| Ordner | Zweck |
|--------|--------|
| `Cursor-Usage-Dashboard` (privat) | Persönliche Config, Roadmap, AI-Prompts, Historie |
| `Cursor-Usage-Dashboard-Public` | **Öffentliches Git-Repo** — ab v0.1 nur hier weiterarbeiten |

## Einmalig: Public-Ordner erzeugen

Im **privaten** Projektroot:

```powershell
.\scripts\init-public-repo.ps1
```

Das Skript kopiert den Stand nach `C:\Projekte\Cursor-Usage-Dashboard-Public` (ohne `.git`, `data/`, `.env`, lokale Dev-Dateien) und erstellt einen **Initial-Commit**.

## GitHub-Repo

**Public-Clone (saubere Historie):** https://github.com/70hundert/cursor-usage-analytics (derzeit **private**)

Das alte Repo `Cursor-Usage-Dashboard` auf GitHub bleibt mit der bisherigen Historie — nicht weiter nutzen für neue Arbeit.

## GitHub-Repo anlegen (falls neu klonen)

```powershell
cd C:\Projekte\Cursor-Usage-Dashboard-Public
git clone https://github.com/70hundert/cursor-usage-analytics.git .
```

Oder nach `init-public-repo.ps1`:

```powershell
gh repo create <name> --private --source=. --remote=origin
git push -u origin main
```

Später public schalten: GitHub → Settings → Change visibility (nur **ein** Initial-Commit sichtbar, keine alte Historie).

## Nach dem Umzug

1. Cursor/IDE auf `Cursor-Usage-Dashboard-Public` öffnen
2. `config/users.json` aus `config/users.example.json` kopieren und anpassen
3. `.env` aus `.env.example` anlegen
4. `data/` für CSV-Exports anlegen

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
