(() => {
  // Supabase publishable key is intentionally public. Meta app secrets and social tokens stay server-side.
  const SUPABASE_URL = "https://cvgkmlwxeqnwmrkwcrng.supabase.co";
  const SUPABASE_KEY = "sb_publishable_NQa0F0mZQNzb4jopCwrmCA_G7o04vqE";
  const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/meta-connect`;
  const SESSION_KEY = "riera-supabase-session-v1";
  const redirectUrl = `${location.origin}${location.pathname}`;
  let accounts = [];

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[char]);
  }

  function readSession() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null"); }
    catch { return null; }
  }

  function writeSession(session) {
    if (session?.access_token) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(SESSION_KEY);
  }

  function absorbAuthCallback() {
    const params = new URLSearchParams(location.hash.slice(1));
    const token = params.get("access_token");
    if (token) {
      writeSession({
        access_token: token,
        refresh_token: params.get("refresh_token"),
        expires_at: Date.now() + Number(params.get("expires_in") || 3600) * 1000,
      });
      history.replaceState({}, document.title, `${location.pathname}${location.search}`);
    }
    const query = new URLSearchParams(location.search);
    const result = query.get("meta");
    if (result) {
      const messages = {
        connected: "Meta-Konten gefunden. Wähle jetzt die Facebook-Seiten aus.",
        denied: "Meta-Anmeldung abgebrochen.",
        invalid: "Die Meta-Rückmeldung war ungültig. Bitte erneut verbinden.",
        expired: "Der Anmeldelink ist abgelaufen. Bitte erneut verbinden.",
        setup: "Die Kontoverbindung ist noch nicht vollständig eingerichtet.",
        "no-pages": "Meta hat keine verwalteten Facebook-Seiten gefunden.",
        "storage-error": "Konten konnten nicht sicher gespeichert werden.",
      };
      history.replaceState({}, document.title, location.pathname);
      setTimeout(() => window.toast?.(messages[result] || "Meta-Verbindung fehlgeschlagen."), 0);
    }
  }

  absorbAuthCallback();

  async function authFetch(path, options = {}) {
    return fetch(`${SUPABASE_URL}${path}`, {
      ...options,
      headers: {
        apikey: SUPABASE_KEY,
        "content-type": "application/json",
        ...(options.headers || {}),
      },
    });
  }

  async function currentSession() {
    let session = readSession();
    if (!session?.access_token) return null;
    if (session.expires_at && session.expires_at < Date.now() + 60_000 && session.refresh_token) {
      const refreshed = await authFetch("/auth/v1/token?grant_type=refresh_token", {
        method: "POST",
        body: JSON.stringify({ refresh_token: session.refresh_token }),
      });
      if (!refreshed.ok) {
        writeSession(null);
        return null;
      }
      const data = await refreshed.json();
      session = { ...data, expires_at: Date.now() + Number(data.expires_in || 3600) * 1000 };
      writeSession(session);
    }
    return session;
  }

  async function api(action, body = null) {
    const session = await currentSession();
    if (!session) throw new Error("Bitte melde dich zuerst mit deinem Admin-Link an.");
    const response = await fetch(`${FUNCTION_URL}?action=${encodeURIComponent(action)}`, {
      method: body === null ? "GET" : "POST",
      headers: {
        apikey: SUPABASE_KEY,
        authorization: `Bearer ${session.access_token}`,
        "content-type": "application/json",
      },
      body: body === null ? undefined : JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Verbindung zum Kontodienst fehlgeschlagen.");
    return data;
  }

  function statusBlock(message, error = false) {
    const box = document.querySelector("#metaConnectionStatus");
    if (box) {
      box.innerHTML = `<div class="${error ? "disclosure" : "editor-note"}" role="status">${escapeHtml(message)}</div>`;
    }
  }

  function accountRows() {
    const list = document.querySelector("#metaAccountList");
    if (!list) return;
    if (!accounts.length) {
      list.innerHTML = '<p class="hint">Noch keine Facebook-Seite verbunden. Nutze „Facebook & Instagram verbinden“.</p>';
      return;
    }
    list.innerHTML = accounts.map((account) => {
      const title = escapeHtml(account.facebook_page_name);
      const ig = account.instagram_username
        ? `Instagram @${escapeHtml(account.instagram_username)}`
        : "Kein verknüpftes Instagram-Profil erkannt";
      return `<label style="display:flex;align-items:flex-start;gap:10px;border:1px solid var(--line);border-radius:9px;padding:12px;margin:8px 0">
        <input type="checkbox" data-page-id="${escapeHtml(account.facebook_page_id)}" ${account.selected ? "checked" : ""}>
        <span><b>${title}</b><br><small class="hint">Facebook-Seite · ${ig}</small></span>
      </label>`;
    }).join("");
  }

  async function loadAccounts() {
    try {
      const data = await api("status");
      accounts = data.accounts || [];
      accountRows();
      statusBlock(`Angemeldet als ${readSession()?.user?.email || "Riera-Admin"}. Wähle unten die freizugebenden Seiten.`);
    } catch (error) {
      if (!readSession()?.access_token) {
        statusBlock("Melde dich mit dem freigeschalteten Riera-Admin-Konto an, um Verbindungen zu verwalten.");
      } else {
        statusBlock(error.message, true);
      }
    }
  }

  function connectionsDialog() {
    const session = readSession();
    const login = !session?.access_token;
    window.openModal(
      "Konten & Verbindungen",
      `<div class="disclosure" style="margin-bottom:16px">Die Facebook-Anmeldung liest verwaltete Facebook-Seiten und dort verknüpfte Instagram-Professional-Konten. Wähle anschließend aus, welche Seiten Riera Studio verwenden darf. Meta-Zugriffstoken werden verschlüsselt im Backend gespeichert.</div>
      ${login ? `<div class="formgrid"><div class="field full"><label for="adminEmail">Admin-E-Mail</label><input id="adminEmail" type="email" autocomplete="email" placeholder="deine E-Mail-Adresse"></div><div class="field full"><button class="primary" id="sendAdminLink">Admin-Anmeldelink senden</button><span class="hint">Nur ein zuvor in Supabase angelegtes und als Riera-Admin freigeschaltetes Konto kann fortfahren. Das Admin-Konto erhält einen Anmeldelink per E-Mail.</span></div></div>` : `<div id="metaConnectionStatus" style="margin-bottom:14px"></div><div class="formgrid"><div class="field full"><button class="primary" id="connectMeta">Facebook & Instagram verbinden</button><span class="hint">Instagram muss ein Professional-Konto sein und mit einer Facebook-Seite verknüpft sein.</span></div><div class="field full"><label>Gefundene Seiten und Instagram-Konten</label><div id="metaAccountList"></div></div><div class="field full" style="display:flex;gap:8px;flex-wrap:wrap"><button class="secondary" id="saveMetaAccounts">Auswahl speichern</button><button class="secondary" id="disconnectMeta">Verbindung trennen</button><button class="secondary" id="logoutAdmin">Abmelden</button></div></div>`}
      <div class="hint" style="margin-top:16px">Cloudspeicher, automatischer Import, Veröffentlichung und Kommentarantworten werden separat angebunden. Diese Meta-Verbindung schaltet zunächst nur die Kontenautorisierung frei.</div>`,
      () => window.closeModal(),
      "Zugangsdaten werden nicht im Browsercode hinterlegt.",
    );

    document.querySelector("#sendAdminLink")?.addEventListener("click", async () => {
      const email = document.querySelector("#adminEmail")?.value.trim();
      if (!email) return window.toast("Gib zuerst deine Admin-E-Mail ein.");
      try {
        const url = new URL("/auth/v1/otp", SUPABASE_URL);
        url.searchParams.set("redirect_to", redirectUrl);
        const response = await authFetch(`${url.pathname}${url.search}`, {
          method: "POST",
          body: JSON.stringify({ email, create_user: false }),
        });
        if (!response.ok) throw new Error("Anmeldelink konnte nicht gesendet werden. Prüfe, ob das Admin-Konto in Supabase angelegt ist.");
        statusBlock("Anmeldelink wurde angefordert. Öffne den Link in dieser Browser-Sitzung.");
        window.toast("Anmeldelink angefordert.");
      } catch (error) {
        statusBlock(error.message, true);
      }
    });

    if (!login) {
      loadAccounts();
      document.querySelector("#connectMeta")?.addEventListener("click", async () => {
        try {
          const data = await api("start", {});
          location.assign(data.authorize_url);
        } catch (error) {
          statusBlock(error.message, true);
        }
      });
      document.querySelector("#saveMetaAccounts")?.addEventListener("click", async () => {
        const page_ids = [...document.querySelectorAll("[data-page-id]:checked")].map((input) => input.dataset.pageId);
        try {
          await api("select", { page_ids });
          accounts = accounts.map((account) => ({ ...account, selected: page_ids.includes(account.facebook_page_id) }));
          accountRows();
          statusBlock(`${page_ids.length} Facebook-Seite(n) ausgewählt. Verknüpfte Instagram-Profile sind damit ebenfalls zugeordnet.`);
        } catch (error) {
          statusBlock(error.message, true);
        }
      });
      document.querySelector("#disconnectMeta")?.addEventListener("click", async () => {
        try {
          await api("disconnect", {});
          accounts = [];
          accountRows();
          statusBlock("Alle Meta-Seiten wurden getrennt.");
        } catch (error) {
          statusBlock(error.message, true);
        }
      });
      document.querySelector("#logoutAdmin")?.addEventListener("click", () => {
        writeSession(null);
        window.closeModal();
        window.toast("Abgemeldet.");
      });
    }
  }

  window.connectDialog = connectionsDialog;
  document.querySelector("#connectBtn").onclick = connectionsDialog;
  document.querySelector("#accountsNav").onclick = connectionsDialog;
})();

