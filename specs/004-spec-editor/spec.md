# Specification: 004 Spec-Editor

## Feature: Specs im GUI definieren und als "done" markieren

### Overview

Specs sollen direkt im ralphi-WebGUI erstellt, bearbeitet und verwaltet werden können – analog zum walter- Aufgaben-System, aber speziell für Ralph Wiggum Specs. Jede Spec kann mit Tags versehen werden (z.B. "done" wenn abgeschlossen). Der User sieht, welche Specs offen sind, welche laufen und welche fertig sind.

### User Stories
- As a user, I want direkt im Browser eine neue Spec erstellen (Titel + Beschreibung + Tags)
- As a user, I want bestehende Specs sehen und nach Status filtern (offen, läuft, done)
- As a user, I want eine Spec als "done" markieren (Tag setzen)
- As a user, I want Specs bearbeiten und löschen
- As a user, I want Specs einem Projekt zuordnen

---

## Functional Requirements

### FR-1: Spec-Liste

**Acceptance Criteria:**
- [ ] Neue Route `/ralphi/specs` zeigt alle Specs
- [ ] Specs sind filterbar nach Status (pending, running, done)
- [ ] Jede Spec zeigt: Titel, Projekt, Tags, Erstelldatum
- [ ] Suche über Titel und Beschreibung
- [ ] Sortierung: neueste zuerst

### FR-2: Spec erstellen

**Acceptance Criteria:**
- [ ] Button "Neue Spec" öffnet ein Formular
- [ ] Formular-Felder: Titel, Beschreibung, Projekt (Auswahl importierter Projekte), Tags
- [ ] Tags sind frei wählbar (Komma-getrennt oder Chips)
- [ ] Spec wird in `specs/` als `.md`-Datei gespeichert (Spec-Template-Format)
- [ ] Nach Speichern: Redirect zur Spec-Detailseite

### FR-3: Spec-Detail

**Acceptance Criteria:**
- [ ] Route `/ralphi/specs/{id}` zeigt die Spec
- [ ] Anzeige: Titel, Beschreibung, Projekt, Tags, Status, Erstell-/Änderungsdatum
- [ ] Button "Als done markieren" setzt Tag "done"
- [ ] Button "In Arbeit" setzt Tag "running"
- [ ] Button "Bearbeiten" öffnet das Formular im Edit-Mode
- [ ] Button "Löschen" entfernt die Spec (mit Bestätigung)

### FR-4: Tags

**Acceptance Criteria:**
- [ ] Tags werden als Metadaten in der Spec-Datei gespeichert (z.B. `<!-- TAGS: done -->`)
- [ ] ODER alternativ: Tags werden in einem separaten Index/JSON verwaltet
- [ ] API-Endpoint `GET /api/specs?tag=done` filtert nach Tag
- [ ] API-Endpoint `POST /api/specs/{id}/tags` fügt Tag hinzu
- [ ] API-Endpoint `DELETE /api/specs/{id}/tags/{tag}` entfernt Tag
- [ ] Bekannte Tags: "done", "running", "pending" (Default)

### FR-5: API-Endpoints

**Acceptance Criteria:**
- [ ] `GET /api/specs` – Alle Specs (filterbar via `?tag=`, `?project=`, `?q=`)
- [ ] `GET /api/specs/{id}` – Spec-Detail
- [ ] `POST /api/specs` – Neue Spec anlegen (body: title, description, projectId?, tags[])
- [ ] `PUT /api/specs/{id}` – Spec aktualisieren
- [ ] `DELETE /api/specs/{id}` – Spec löschen
- [ ] `POST /api/specs/{id}/tags` – Tag hinzufügen (body: tag)
- [ ] `DELETE /api/specs/{id}/tags/{tag}` – Tag entfernen
- [ ] `GET /api/tags` – Alle verwendeten Tags

### FR-6: Speicherung im Projekt-Ordner

**Acceptance Criteria:**
- [ ] Neue Specs werden im Projekt-Ordner gespeichert: `/vibes/{project}/specs/{id}/spec.md`
- [ ] Wenn kein Projekt ausgewählt: Speicherung in ralphi-eigenem specs/
- [ ] Spec-Liste scannt ALLE importierten Projekte + ralphi selbst nach Specs
- [ ] Specs können im Projekt-Ordner bearbeitet (überschrieben) werden
- [ ] Bestehende Specs in Projekten werden erkannt und angezeigt
- [ ] Beim Löschen einer Spec: Wenn sie in einem Projekt liegt, wird sie dort gelöscht

### FR-7: Alle Projekte durchsuchen

**Acceptance Criteria:**
- [ ] Spec-Liste aggregiert Specs aus allen importierten Projekten
- [ ] Jede Spec zeigt aus welchem Projekt sie stammt
- [ ] Filter nach Projekt möglich
- [ ] Änderungen an Specs (erstellen/editieren/löschen) wirken direkt im Projekt-Ordner

---

## Dependencies

- Das ralphi-Volume muss read-write sein (ist bereits :rw gesetzt)
- Spec-Template aus `templates/spec-template.md`

## Assumptions

- Specs werden als echte Dateien gespeichert, nicht nur in einer DB
- Ralph kann später die Specs direkt aus dem GUI starten (Spec-Liste → Loop starten)
- Das System ist kompatibel zum bestehenden walter-Notizen-Modell (Tags, "done")

---

## Completion Signal

### Implementation Checklist

- [ ] Backend: CRUD-API für Specs inkl. Tag-Filter
- [ ] Backend: Specs in Projekt-Ordnern speichern (nicht nur in ralphi/specs)
- [ ] Backend: Alle importierten Projekte nach Specs durchsuchen
- [ ] Frontend: Spec-Liste (`/ralphi/specs`) mit Filter/Suche
- [ ] Frontend: Spec-Erstellungs-Formular mit Projekt-Auswahl
- [ ] Frontend: Spec-Detailseite mit Tag-Management
- [ ] Speicherung als echte Spec-Dateien im Projekt-Ordner

### Testing Requirements

#### Code Quality
- [ ] `docker compose config` gibt keinen Fehler
- [ ] Backend startet ohne Fehler
- [ ] API-Responses sind valides JSON

#### Functional Verification
- [ ] `GET /api/specs` liefert Specs (bestehende + neue)
- [ ] `POST /api/specs` erstellt eine Spec-Datei
- [ ] Die Datei ist im Spec-Format mit `## Status: PENDING`
- [ ] `POST /api/specs/{id}/tags` mit tag "done" funktioniert
- [ ] `GET /api/specs?tag=done` filtert korrekt
- [ ] Spec-Detailseite zeigt alle Informationen
- [ ] Neue Spec ist im Dateisystem vorhanden

#### Visual Verification
- [ ] Spec-Liste sieht sauber aus
- [ ] Tag-Chips sind farbig unterscheidbar
- [ ] Formular ist benutzbar
- [ ] Mobile-Ansicht funktioniert

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
