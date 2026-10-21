# Riera Studio – öffentlicher Prototyp

Statische Weboberfläche für Videoentwürfe, plattformbezogene Bearbeitung und Affiliate-Kommentarregeln. Entwürfe und Medienvorschauen in der Demo bleiben lokal im Browser.

## Meta-Konten

Die Kontenansicht kann Facebook-Seiten und damit verknüpfte Instagram-Professional-Konten über Meta OAuth autorisieren. OAuth-Start und Callback laufen über eine Supabase Edge Function. Access Tokens werden serverseitig verschlüsselt gespeichert; der Browser erhält nur Seitenname, Instagram-Nutzername und Auswahlstatus.

Die Backend-Funktion und Datentabellen liegen in `../supabase/`. Sie benötigen eine Meta-App sowie die geheimen Einstellungen aus [META_SETUP.md](META_SETUP.md). Ohne diese Einstellungen bleibt die Verbindung deaktiviert. Die Kontoverknüpfung schaltet noch keine Videoveröffentlichung oder Kommentarantworten frei.

## Grenzen

- GitHub Pages liefert nur die Weboberfläche; Geheimnisse und Tokens liegen im Supabase-Backend.
- Meta-Veröffentlichung, Medienhosting, TikTok-Import und automatische Kommentarantworten sind noch nicht implementiert.
- Die Demo speichert Videoentwürfe lokal im jeweiligen Browser.
- Für Instagram über Facebook Login muss ein Professional-Konto mit einer verwalteten Facebook-Seite verbunden sein.

