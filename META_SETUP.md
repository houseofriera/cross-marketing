# Meta-Kontenverknüpfung einrichten

## Bereits bereitgestellt

- Supabase-Projekt: `cross marketing` (`cvgkmlwxeqnwmrkwcrng`, Region `eu-north-1`)
- Datenbanktabellen mit Row Level Security und Zugriff nur für den serverseitigen Dienst
- Supabase Edge Function `meta-connect`
- Öffentliche Website: <https://houseofriera.github.io/cross-marketing/>

Die Funktion verlangt ein angemeldetes Supabase-Konto und prüft serverseitig, ob dessen E-Mail mit `RIERA_ADMIN_EMAIL` übereinstimmt. Meta-Tokens werden mit AES-GCM verschlüsselt. Weder Meta-App-Geheimnis noch Tokens gehören in `index.html`, `connection.js` oder GitHub.

## 1. Supabase Auth vorbereiten

1. Lege in Supabase Auth einen Benutzer für das Riera-Admin-Konto an bzw. lade ihn ein.
2. Öffne **Authentication → URL Configuration** und trage als Site URL `https://houseofriera.github.io/cross-marketing/` ein.
3. Füge dieselbe Adresse unter den erlaubten Redirect URLs hinzu.
4. Stelle sicher, dass E-Mail-Magic-Links aktiviert sind. Die Website erlaubt keine Selbstregistrierung für Kontoverbindungen.

## 2. Meta-App vorbereiten

1. Lege eine Meta-App für das Business-Login an und füge Facebook Login sowie die Instagram Graph API mit Facebook Login hinzu.
2. Registriere diese exakte OAuth-Redirect-URI in den Facebook-Login-Einstellungen:

   `https://cvgkmlwxeqnwmrkwcrng.supabase.co/functions/v1/meta-connect?action=callback`

3. Für die Kontenerkennung fordert die Verbindung `pages_show_list`, `pages_read_engagement` und `instagram_basic` an.
4. Das Instagram-Konto muss ein Professional-Konto (Business oder Creator) sein und mit einer Facebook-Seite verbunden sein, die der angemeldete Facebook-Benutzer verwalten darf.
5. Für Tests muss der anmeldende Facebook-Benutzer je nach App-Modus eine App-Rolle haben. Für eine Nutzung durch externe Personen müssen die passenden Berechtigungen und der Live-Modus von Meta freigegeben sein.

Meta-Referenz: [Instagram API with Facebook Login – Meta API collection](https://www.postman.com/meta/instagram/folder/9cgqucg/instagram-api-with-facebook-login).

## 3. Supabase Function Secrets setzen

Setze diese Werte im Supabase Dashboard unter **Edge Functions → Secrets**. Die Website und das GitHub-Repository dürfen nur die Supabase-URL und den Publishable Key enthalten.

| Secret | Wert |
| --- | --- |
| `RIERA_ADMIN_EMAIL` | Exakte E-Mail des eingeladenen Riera-Admin-Benutzers |
| `RIERA_FRONTEND_URL` | `https://houseofriera.github.io/cross-marketing/` |
| `META_APP_ID` | App-ID aus Meta for Developers |
| `META_APP_SECRET` | App Secret aus Meta for Developers |
| `META_GRAPH_API_VERSION` | Von Meta für die App aktuell unterstützte Versionsnummer im Format `vNN.0` |
| `META_REDIRECT_URI` | Die oben angegebene vollständige Callback-URI |
| `META_TOKEN_ENCRYPTION_KEY` | Zufälliges Geheimnis mit mindestens 32 Zeichen, nur im Supabase-Backend |

Erzeuge den Verschlüsselungsschlüssel lokal, zum Beispiel mit `openssl rand -base64 32`, und füge ihn nur im Supabase-Dashboard ein. Teile ihn nicht im Chat und committe ihn nicht.

Nach dem Setzen der Secrets öffne die Website, wähle **Konten & Verbindungen**, fordere einen Admin-Anmeldelink an und öffne ihn in derselben Browser-Sitzung. Danach startet **Facebook & Instagram verbinden** den Meta-OAuth-Dialog. Wähle anschließend die Facebook-Seiten aus, die die Anwendung verwenden darf.

## Funktionsumfang und nächste Freigaben

Diese Einrichtung verbindet Konten und speichert die Auswahl. Sie veröffentlicht noch keine Videos. Dafür braucht es zusätzlich den Veröffentlichungsablauf für Medien, passende Meta-Berechtigungen wie `instagram_content_publish` und `pages_manage_posts`, App Review soweit von Meta verlangt, sowie bestätigte Veröffentlichungsaktionen. Kommentarautomationen benötigen eigene Webhooks und Berechtigungen.

