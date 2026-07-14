# Specification: 005 AI Model Config

## Feature: AI-Modell in ralphi konfigurierbar machen + Default auf gpt-5.5

### Overview

Ralphi startet Ralph Loops mit `./scripts/ralph-loop-codex.sh`. Das verwendete AI-Modell ist aktuell im Script hartcodiert (`CODEX_MODEL`). Der User soll in ralphi einstellen können, welches Modell beim Loop-Start verwendet wird. Default: `gpt-5.5` (das Modell das aktuell auch pi/codex verwendet).

### User Stories
- As a user, ich will in den ralphi-Einstellungen das AI-Modell ändern können
- As a user, ich will dass Loops mit meinem konfigurierten Modell starten
- As a user, ich will auf einen Blick sehen, welches Modell aktuell aktiv ist
- As a user, ich will pro Projekt ein anderes Modell einstellen können (optional)

---

## Functional Requirements

### FR-1: Globale Model-Konfiguration

**Acceptance Criteria:**
- [x] Neue Seite/Modal `/ralphi/settings` mit Model-Einstellung
- [x] Input-Feld für Model-Name (z.B. `gpt-5.5`, `gpt-4.1`, `o3`, `o4-mini`)
- [x] Default-Wert: `gpt-5.5`
- [x] Einstellung wird persistent gespeichert in `/data/settings.json`
- [x] Anzeige des aktiven Modells in der Navigation oder Statusleiste

### FR-2: Model-Wird an Loop-Start übergeben

**Acceptance Criteria:**
- [x] Beim Start eines Loops wird `CODEX_MODEL` auf das konfigurierte Modell gesetzt
- [x] Der Loop-Output zeigt initial: "Using model: gpt-5.5" (oder das gewählte Modell)
- [x] Modell-Änderung wirkt sich erst auf NEUE Loops aus (laufende bleiben unberührt)

### FR-3: API-Endpoints

**Acceptance Criteria:**
- [x] `GET /api/settings` – Aktuelle Einstellungen abrufen
- [x] `PUT /api/settings` – Einstellungen aktualisieren (body: { model: "gpt-5.5" })
- [x] Settings werden in `/data/settings.json` gespeichert
- [x] Default: `{ "model": "gpt-5.5" }`

### FR-4: UI: Settings-Seite

**Acceptance Criteria:**
- [x] Route `/ralphi/settings` zeigt ein einfaches Formular
- [x] Feld: "AI Model" mit aktuellem Wert, Text-Input
- [x] Button "Speichern"
- [x] Erfolgsmeldung nach Speichern
- [x] Fehlerbehandlung bei ungültigen Werten

### FR-5: Anzeige in Loop-Detail

**Acceptance Criteria:**
- [x] In der Loop-Detailseite wird das verwendete Modell angezeigt
- [x] In der Loop-Liste (`/ralphi/loops`) wird das Modell pro Loop angezeigt

---

## Dependencies

- Spec 003 (Loop-Management) – Loop starten mit Modell-Variable
- Spec 004 (Spec-Editor) – UI-Patterns für Formulare

## Assumptions

- `CODEX_MODEL` wird als Umgebungsvariable an den Subprozess übergeben
- Das Modell muss auf dem Host/system vorhanden sein (codex muss es unterstützen)
- `gpt-5.5` ist der von pi/codex aktuell verwendete Standard

---

## Completion Signal

### Implementation Checklist

- [x] Backend: Settings-CRUD (GET/PUT `/api/settings`)
- [x] Backend: Model-Variable an Loop-Start übergeben (CODEX_MODEL env)
- [x] Frontend: Settings-Seite (`/ralphi/settings`) mit Formular
- [x] Frontend: Model-Anzeige in Loop-Detail und Loop-Liste
- [x] Persistenz in `/data/settings.json`
- [x] Default `model: "gpt-5.5"` bei erstem Start

### Testing Requirements

#### Code Quality
- [x] `docker compose config` gibt keinen Fehler
- [x] Backend startet ohne Fehler

#### Functional Verification
- [x] `GET /api/settings` liefert Default `{ model: "gpt-5.5" }`
- [x] `PUT /api/settings` mit `{ model: "o3" }` speichert und gibt neuen Wert zurück
- [x] Nach Neustart: geänderter Wert bleibt erhalten
- [x] Loop-Start verwendet das konfigurierte Modell
- [x] `/ralphi/settings` zeigt das Formular an

#### Visual Verification
- [x] Settings-Seite ist sauber und responsive
- [x] Aktuelles Modell ist in der Nav sichtbar (optional)
- [x] Loop-Detail zeigt Modell an

### Iteration Instructions

Wenn etwas fehlschlägt:
1. Fehler identifizieren
2. Fixen
3. Docker neubauen
4. Erneut prüfen
5. Commit und push

**Only when ALL checks pass, output:** `<promise>DONE</promise>`

---

## Status: COMPLETE
<!-- NR_OF_TRIES: 1 -->
