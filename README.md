# cookMark

Rezepte aus Reels, TikToks und Foodblogs an einem Ort — statt in den Instagram-Saves zu wühlen.
Link teilen, Rezept steht als saubere Karte da: Zutaten, Schritte, Timer, Einkaufsliste.

Eine PWA wie bounceBack: lokal-first (funktioniert offline), Sync über Supabase, auf dem
iPhone-Homescreen wie eine App.

**Der Grundsatz, an dem hier alles hängt: nichts dazuerfinden.** Was nicht in der Vorlage steht,
bleibt sichtbar leer. Ein halbes Rezept, dem man ansieht, dass es halb ist, ist brauchbar — ein
vollständig aussehendes, das zur Hälfte geraten wurde, ist gefährlich.

---

## Schnellstart (ohne Server)

```bash
npm install
npm run dev:local
```

Läuft auf <http://localhost:5201>, ganz ohne Supabase: kein Login, alles bleibt in diesem einen
Browser. Rezepte von Hand anlegen geht, der Import nicht — der braucht den Server.

Mit Zugangsdaten (siehe unten) stattdessen `npm run dev` → <http://localhost:5200>.

| Befehl | Was er tut |
|---|---|
| `npm run dev` | Dev-Server mit Supabase |
| `npm run dev:local` | Dev-Server ohne Supabase (lokaler Modus) |
| `npm test` | Unit-Tests für den Rezept-Kern (Mengen, Einheiten, Timer) |
| `npm run build` | Typecheck + Produktions-Build |
| `npm run lint` | oxlint |

---

## Einrichten

### 1. Supabase-Projekt

1. Auf [supabase.com](https://supabase.com) ein Projekt anlegen (eigenes für cookMark — bounceBack
   sein eigenes lassen, das hält die Tabellen auseinander).
2. **SQL Editor** öffnen, den Inhalt von `supabase/schema.sql` einfügen, **Run**.
   Das legt die vier Tabellen, die Row-Level-Security und den Bild-Bucket an.
   *(Falls du das Schema schon vor dem 25.07. eingespielt hattest: zusätzlich
   `supabase/migration-2026-07-25-variante.sql` ausführen — sonst scheitert der Rezept-Push an der
   fehlenden Spalte `variant`.)*
3. **Project Settings → API**: `Project URL` und `anon public` kopieren.
4. `.env.example` nach `.env.local` kopieren und beides eintragen.

### 2. ⚠️ Site URL setzen

**Authentication → URL Configuration → Site URL** auf die Adresse setzen, unter der du die App
benutzt (nach dem Deploy die Vercel-URL). Steht dort noch der Standardwert `localhost:3000`, laufen
Bestätigungs- und Passwort-Mails ins Leere. Unter **Redirect URLs** zusätzlich
`http://localhost:5200/**` eintragen.

### 3. Edge Functions

`import` ist der Motor (Link rein, Rezept raus), `nutrition` macht die
Nährwert-Schätzung. Über die Supabase-CLI:

```bash
npx supabase link --project-ref <deine-projekt-ref>
npx supabase functions deploy import
npx supabase functions deploy nutrition
```

Dann die drei Secrets setzen (**Edge Functions → import → Secrets**, oder per CLI):

| Secret | Woher |
|---|---|
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) → API Keys |
| `IMPORT_TOKEN` | Selbst ausdenken, lang und zufällig: `openssl rand -hex 24` |
| `IMPORT_USER_ID` | Supabase → **Authentication → Users** → deine User-UID (erst einmal in der App anmelden) |

`SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY` setzt Supabase selbst.

`IMPORT_TOKEN` und `IMPORT_USER_ID` braucht nur der iOS-Kurzbefehl — aus der App heraus läuft der
Import über deinen normalen Login.

### 4. iOS-Kurzbefehl (der 2-Tap-Weg)

iOS lässt PWAs nicht ins Teilen-Menü. Ein Kurzbefehl schon — und der schickt einfach an dieselbe
Schnittstelle. Zwei Stück, weil Links und Bilder verschieden verpackt werden.

**„Rezept speichern" (für Links)**

1. Kurzbefehle-App → **+**
2. Oben auf den Namen tippen → **Details** → **In Teilen-Menü anzeigen** einschalten,
   Eingabetypen auf **URLs** beschränken.
3. Aktion **Inhalte einer URL abrufen** hinzufügen:
   - URL: `https://<projekt-ref>.supabase.co/functions/v1/import`
   - **Methode**: `POST`
   - **Header**: `x-import-token` = dein `IMPORT_TOKEN`
   - **Anfragetext**: `JSON` → Feld `url` (Typ Text) = **Kurzbefehl-Eingabe**
4. Aktion **Mitteilung anzeigen** → „Rezept gespeichert ✓"

Danach in TikTok oder Instagram: **Teilen → Rezept speichern**. Fertig.

**„Rezept aus Bild" (für Screenshots)**

Wie oben, aber Eingabetyp **Bilder**, davor die Aktion **Base64 codieren** (Zeilenumbrüche: keine),
und im JSON zwei Felder: `image` = das codierte Bild, `media_type` = `image/jpeg`.

### 5. Deployen (Vercel)

Repo zu GitHub pushen, in Vercel importieren, die beiden `VITE_`-Variablen als Environment
Variables eintragen. `vercel.json` (SPA-Rewrite) liegt schon dabei. Danach Site URL aus Schritt 2
auf die Vercel-Adresse ändern und die App auf dem iPhone zum Home-Bildschirm hinzufügen.

---

## Wie der Import funktioniert

| Quelle | Weg | KI nötig? |
|---|---|---|
| TikTok | `tiktok.com/oembed` → Caption, Creator, Vorschaubild | ja, für die Struktur |
| Instagram | `instagram.com/<code>/embed/captioned/` → Caption, Creator, Bild | ja |
| Foodblog | `schema.org/Recipe` aus der Seite | **nein** — exakt vom Blog, kostenlos |
| Screenshot / Foto | Claude liest den Text im Bild | ja |
| Eingefügter Text | für Seiten hinter einem Login | ja |

Steht im Post kein Rezept — der Klassiker „Kommentier YES und ich schick's dir per DM" —, legt
cookMark trotzdem eine Karte an (Bild, Link, Creator) und markiert sie **„Rezept fehlt"**. Dann
kannst du einen Screenshot nachreichen. Es wird nichts zusammengereimt.

Umgerechnet wird nur, was feststeht: `oz`, `lb`, `cup`, `fl oz`, `stick` Butter, `°F`, `tbsp`→EL,
`tsp`→TL. **Keine** Umrechnung über die Dichte („1 cup Mehl = 120 g“) — dafür müsste man raten, was
in der Tasse ist, und geratene Gramm sehen aus wie gemessene. Die Originalzeile bleibt immer erhalten.

### Vorher ausprobieren, ohne etwas zu speichern

```bash
cd supabase/functions
ANTHROPIC_API_KEY=sk-ant-… deno run --allow-net --allow-env import/probe.ts "https://www.instagram.com/reel/…"
```

Zeigt, was aus dem Link herauskäme. Ohne API-Key läuft nur der Quellen-Teil (kostenlos) — schon das
verrät, ob Caption, Creator und Bild ankommen.

### Kosten

Rund 2–4 Cent pro Import mit `claude-opus-5`, Screenshots etwas mehr. Bei 30 Importen im Monat unter
einem Euro. Foodblogs mit `schema.org` kosten nichts, weil dort keine KI mitspielt. Wenn es zu viel
wird: in `supabase/functions/import/extract.ts` `MODEL` auf `claude-haiku-4-5` stellen — etwa ein
Fünftel, fürs Abschreiben einer Caption völlig ausreichend.

---

## Aufbau

```
src/lib/          Datenhaltung (Dexie), Sync, Auth, Import-Aufrufe
src/routes/       Bildschirme
src/components/   Bausteine
supabase/
  schema.sql            Tabellen + RLS + Bild-Bucket
  functions/_shared/
    recipe-core.ts      Datenmodell + reine Logik (Mengen, Einheiten, Timer)
    sources.ts          TikTok / Instagram / schema.org
  functions/import/     Die Edge Function samt Claude-Aufruf und Trockenlauf
```

`recipe-core.ts` läuft unverändert im Browser **und** in der Edge Function — deshalb rechnet ein
Foodblog-Import mit demselben Code wie die manuelle Eingabe. Der Client kennt ihn als `@core/…`
(Alias in `vite.config.ts` und `tsconfig.app.json`).

### Zwei Sachen, die aus bounceBack gelernt sind

- **Abmelden räumt lokal auf.** Deshalb synchronisiert `signOut()` erst und bricht ab, wenn noch
  etwas in der Outbox liegt (`UnsyncedDataError`) — sonst verschwinden Daten, die nirgendwo sonst
  liegen. Das ist dort zweimal passiert.
- **IDs werden immer zufällig vergeben**, nie fest geseedet. Feste UUIDs kollidieren, sobald ein
  zweiter Account dazukommt, und blockieren dann den ganzen Sync.

---

## Original und deine Version

Ein importiertes Rezept wird beim Bearbeiten nicht überschrieben. Stattdessen entsteht daneben
**deine Version** — mit eigener Zutatenliste, eigenen Schritten und einer Notiz, was du geändert
hast. Im Rezept schaltest du zwischen beiden um; Kochmodus, Einkaufsliste und Nährwerte rechnen
mit deiner Fassung, sobald es sie gibt.

Das Original bleibt so stehen, wie es in der Quelle stand — auch wenn du deine Fassung zehnmal
umbaust. „Meine Version verwerfen" bringt dich zurück auf den Ausgangszustand. Bei selbst
angelegten Rezepten gibt es die Unterscheidung nicht: da gibt es nichts zu schonen.

## Kochen

Der Kochmodus nimmt den ganzen Bildschirm, ein Schritt pro Seite, ohne Tab-Leiste. Zeiten im
Schritttext werden zu Timern („9 Minuten kochen" → 9:00 zum Antippen), der Bildschirm bleibt an,
und die Zutaten lassen sich jederzeit einblenden — in der Menge, die du am Portionsregler
eingestellt hast.

Danach fragt cookMark, wie's war: Bewertung, echte Dauer, Notiz fürs nächste Mal. Weicht die echte
Dauer deutlich von der angegebenen ab, wird das gesagt — und im selben Sheet kannst du die
KI-Behauptungen abhaken oder durchstreichen. Ein widerlegter Tag verschwindet nicht, er bleibt
durchgestrichen stehen. Das ist die Information.

## Stand

Fertig: Rezeptliste mit Suche und Filtern, Rezeptansicht mit Original/eigene-Version-Tabs,
Portionsregler, Kochmodus mit Timern, Einkaufsliste nach Supermarkt-Abteilung, Nachgekocht-Tagebuch
mit Tag-Verifikation, Nährwert-Schätzung auf Knopfdruck, Login und Sync, Import-Backend (TikTok,
Instagram, schema.org, Screenshot, Text), Import-Sheet, JSON-Export, Dark Mode.

Offen: das Ausliefern selbst — Supabase-Projekt, Edge Functions, Vercel, iOS-Kurzbefehl (alles oben
beschrieben). Und der Live-Test der Claude-Extraktion, für den ein API-Key nötig ist.
