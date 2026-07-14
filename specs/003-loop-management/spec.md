# Specification: 003 Loop-Management

## Feature: Ralph Loops über die Web-GUI starten, überwachen und verwalten

### Overview

Ralphi soll Ralph Wiggum Loops für importierte Projekte starten und überwachen können. Der User klickt in der Projekt-Detailansicht auf "Ralph Loop starten", und ralphi führt `ralph-loop.sh` (oder `ralph-loop-codex.sh`) im entsprechenden Projektverzeichnis aus. Der Output wird live gestreamt, Logs werden gespeichert, und der User sieht den Status (running, done, failed).

### User Stories
- As a user, ich will für ein importiertes Projekt einen Ralph Loop starten können
- As a user, ich will live sehen, was Ralph gerade macht (Log-Output)
- As a user, ich will sehen, ob ein Loop läuft, fertig ist oder fehlgeschlagen ist
- As a user, ich will laufende Loops abbrechen können
- As a user, ich will die Historie aller Loops sehen

---

## Functional Requirements

### FR-1: Loop starten

**Acceptance Criteria:**
- [x] Button "Ralph Loop starten" in der Projekt-Detailansicht startet einen Loop
- [x] Der Loop wird als Subprozess gestartet im Projektverzeichnis
- [x] Es wird `./scripts/ralph-loop-codex.sh 1` (oder `ralph-loop.sh`) ausgeführt
- [x] Mehrere Loops können parallel laufen (ein Loop pro Projekt)
- [x] Versuch einen zweiten Loop fürs gleiche Projekt zu starten → Fehlermeldung "Loop läuft bereits"

### FR-2: Live-Logs via SSE (Server-Sent Events)

**Acceptance Criteria:**
- [x] `GET /api/loops/{id}/stream` liefert SSE mit Live-Log-Output
- [x] Der Client zeigt Logs in einem Terminal-ähnlichen Fenster an
- [x] Neue Zeilen erscheinen automatisch (kein manuelles Refreshen)
- [x] Logs sind farbig (stderr rot, stdout normal)
- [x] Verbindung wird geschlossen wenn der Loop endet

### FR-3: Loop-Status-API

**Acceptance Criteria:**
- [x] `GET /api/loops` – Liste aller Loops (aktiv + historisch)
- [x] `GET /api/loops/{id}` – Details zu einem Loop
- [x] `POST /api/projects/{name}/loop/start` – Loop starten
- [x] `POST /api/loops/{id}/stop` – Loop abbrechen
- [x] `GET /api/loops/{id}/logs` – Komplette Logs abrufen
- [x] Jeder Loop hat: id, projectId, status (running/done/failed/stopped), startedAt, finishedAt, exitCode

### FR-4: UI: Live-Log-Ansicht

**Acceptance Criteria:**
- [x] Nach Klick auf "Ralph Loop starten" öffnet sich eine Log-Ansicht
- [x] Log-Ansicht ist ein Terminal-ähnliches Fenster (monospace, schwarzer Hintergrund)
- [x] Auto-scrollt bei neuem Output
- [x] Button "Abbrechen" um den Loop zu stoppen
- [x] Button "Schliessen" um die Log-Ansicht zu schliessen (Loop läuft im Hintergrund weiter)
- [x] Status-Badge zeigt live ob der Loop läuft

### FR-5: UI: Loop-Historie

**Acceptance Criteria:**
- [x] Projekt-Detailseite zeigt Historie der Loops für dieses Projekt
- [x] Jeder Eintrag zeigt: Datum, Status, Dauer, Exit-Code
- [x] Klick auf einen historischen Eintrag öffnet die Logs (Read-only)
- [x] Seite `/ralphi/loops` zeigt alle Loops aller Projekte

### FR-6: Sicherheit

**Acceptance Criteria:**
- [x] Loops laufen nur für Projekte die tatsächlich auf der Festplatte existieren
- [x] Kein Path-Traversal beim Projektnamen
- [x] Subprozesse werden mit timeout gestartet (max 24h)
- [x] Wenn der ralphi-Container neustartet, werden laufende Loops als "failed" markiert

---

## Dependencies

- `scripts/ralph-loop-codex.sh` existiert in den importierten Projekten
- vibes-Ordner ist Read-Only gemountet (Loops schreiben in die Projekte, also braucht's Write-Zugriff)

## Assumptions

- Die importierten Projekte haben tatsächlich Ralph-Setup (scripts/)
- Fürs Starten braucht ralphi Write-Zugriff auf das Projektverzeichnis
- Der Pfad zum Projekt ist `/vibes/{directoryName}` im Container
- Codex CLI (`codex`) ist im ralphi-Container verfügbar (oder wird per Host-Exec ausgeführt)

---

## Completion Signal

### Implementation Checklist

- [x] Backend: Loop-Manager mit Subprozess-Steuerung
- [x] SSE-Streaming für Live-Logs
- [x] CRUD-API für Loops (start, stop, list, detail, logs)
- [x] Frontend: Log-Ansicht (Terminal-Stil, monospace, auto-scroll)
- [x] Frontend: Loop-Historie pro Projekt
- [x] Frontend: Loop starten/stoppen aus Projekt-Detail
- [x] Persistenz: Loop-Historie in `/data/loops.json`

### Testing Requirements

#### Code Quality
- [x] `docker compose config` gibt keinen Fehler
- [x] Backend startet ohne Fehler
- [x] Subprozesse werden korrekt gemanagt (keine Zombie-Prozesse)

#### Functional Verification
- [x] `POST /api/projects/planed1/loop/start` startet einen Loop
- [x] `GET /api/loops` zeigt den laufenden Loop
- [x] SSE-Endpoint liefert Event-Stream
- [x] `POST /api/loops/{id}/stop` stoppt den Loop
- [x] Nach Loop-Ende: Status ist "done" oder "failed"
- [x] Zweiter Start für gleiches Projekt wird abgewiesen
- [x] Loop-Historie bleibt nach Neustart erhalten

#### Visual Verification
- [x] Log-Ansicht sieht aus wie ein Terminal
- [x] Auto-scroll funktioniert
- [x] "Abbrechen"-Button ist sichtbar und funktioniert
- [x] Status-Badge zeigt korrekten Zustand

#### Console/Network Check
- [x] SSE-Verbindung wird sauber auf- und abgebaut
- [x] Keine 404er
- [x] Keine Speicherlecks bei langen SSE-Verbindungen

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
