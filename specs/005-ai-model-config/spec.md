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
- [ ] Neue Seite/Modal `/ralphi/settings` mit Model-Einstellung
- [ ] Input-Feld für Model-Name (z.B. `gpt-5.5`, `gpt-4.1`, `o3`, `o4-mini`)
- [ ] Default-Wert: `gpt-5.5`
- [ ] Einstellung wird persistent gespeichert in `/data/settings.json`
- [ ] Anzeige des aktiven Modells in der Navigation oder Statusleiste

### FR-2: Model-Wird an Loop-Start übergeben

**Acceptance Criteria:**
- [ ] Beim Start eines Loops wird `CODEX_MODEL` auf das konfigurierte Modell gesetzt
- [ ] Der Loop-Output zeigt initial: "Using model: gpt-5.5" (oder das gewählte Modell)
- [ ] Modell-Änderung wirkt sich erst auf NEUE Loops aus (laufende bleiben unberührt)

### FR-3: API-Endpoints

**Acceptance Criteria:**
- [ ] `GET /api/settings` – Aktuelle Einstellungen abrufen
- [ ] `PUT /api/settings` – Einstellungen aktualisieren (body: { model: "gpt-5.5" })
- [ ] Settings werden in `/data/settings.json` gespeichert
- [ ] Default: `{ "model": "gpt-5.5" }`

### FR-4: UI: Settings-Seite

**Acceptance Criteria:**
- [ ] Route `/ralphi/settings` zeigt ein einfaches Formular
- [ ] Feld: "AI Model" mit aktuellem Wert, Text-Input
- [ ] Button "Speichern"
- [ ] Erfolgsmeldung nach Speichern
- [ ] Fehlerbehandlung bei ungültigen Werten

### FR-5: Anzeige in Loop-Detail

**Acceptance Criteria:**
- [ ] In der Loop-Detailseite wird das verwendete Modell angezeigt
- [ ] In der Loop-Liste (`/ralphi/loops`) wird das Modell pro Loop angezeigt

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

- [ ] Backend: Settings-CRUD (GET/PUT `/api/settings`)
- [ ] Backend: Model-Variable an Loop-Start übergeben (CODEX_MODEL env)
- [ ] Frontend: Settings-Seite (`/ralphi/settings`) mit Formular
- [ ] Frontend: Model-Anzeige in Loop-Detail und Loop-Liste
- [ ] Persistenz in `/data/settings.json`
- [ ] Default `model: "gpt-5.5"` bei erstem Start

### Testing Requirements

#### Code Quality
- [ ] `docker compose config` gibt keinen Fehler
- [ ] Backend startet ohne Fehler

#### Functional Verification
- [ ] `GET /api/settings` liefert Default `{ model: "gpt-5.5" }`
- [ ] `PUT /api/settings` mit `{ model: "o3" }` speichert und gibt neuen Wert zurück
- [ ] Nach Neustart: geänderter Wert bleibt erhalten
- [ ] Loop-Start verwendet das konfigurierte Modell
- [ ] `/ralphi/settings` zeigt das Formular an

#### Visual Verification
- [ ] Settings-Seite ist sauber und responsive
- [ ] Aktuelles Modell ist in der Nav sichtbar (optional)
- [ ] Loop-Detail zeigt Modell an

### Iteration Instructions

Wenn etwas fehlschlägt:
1. Fehler identifizieren
2. Fixen
3. Docker neubauen
4. Erneut prüfen
5. Commit und push

**Only when ALL checks pass, output:** `<promise>DONE</promise>`

---

## Status: PENDING
<!-- NR_OF_TRIES: 0 -->
