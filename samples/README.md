# Demo-Daten (synthetisch)

Diese Dateien sind **fiktive Beispieldaten** für Screenshots, lokale Tests und den Public-Release — keine echten Cursor-Accounts oder Abrechnungen.

| Datei | Inhalt |
| ----- | ------ |
| `usage-events-demo.csv` | 4 Wochen Usage-Events (User-ID `demo` über `config/users.json`) |
| `project-markers-demo.json` | Beispiel-Projekt-Marker für denselben Zeitraum |

## Neu erzeugen

```powershell
python scripts/generate_demo_data.py
```

Der Generator nutzt einen festen Random-Seed (`42`) — die Ausgabe ist reproduzierbar.

## Demo starten

```powershell
Copy-Item config\users.example.json config\users.json
python serve.py
```

Browser: http://127.0.0.1:8060/ — User **Demo** wählen. Projekt-Marker werden beim ersten Serverstart aus dieser Datei nach `data/project-markers.json` übernommen (falls dort noch keine Datei existiert).
