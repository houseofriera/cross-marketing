const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const FRONTEND_URL = Deno.env.get("RIERA_FRONTEND_URL") ?? "https://houseofriera.github.io/cross-marketing/";
const FRONTEND_ORIGIN = new URL(FRONTEND_URL).origin;

const encoder = new TextEncoder();
const jsonHeaders = { "content-type": "application/json; charset=utf-8" };

function corsHeaders(origin: string | null): HeadersInit {
  const allowed = origin === FRONTEND_ORIGIN ? origin : FRONTEND_ORIGIN;
  return {
    "access-control-allow-origin": allowed,
    "access-control-allow-headers": "authorization, apikey, content-type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

function response(data: unknown, status = 200, origin: string | null = null): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...jsonHeaders, ...corsHeaders(origin) },
  });
}

function randomState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

async function encryptionKey(): Promise<CryptoKey> {
  const secret = Deno.env.get("META_TOKEN_ENCRYPTION_KEY") ?? "";
  if (secret.length < 32) throw new Error("Tokenverschlüsselung ist noch nicht konfiguriert.");
  const raw = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt"]);
}

async function encryptTokens(value: unknown): Promise<{ token_ciphertext: string; token_iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(),
    encoder.encode(JSON.stringify(value)),
  );
  return { token_ciphertext: toBase64(new Uint8Array(ciphertext)), token_iv: toBase64(iv) };
}

function serviceHeaders(extra: Record<string, string> = {}): HeadersInit {
  if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase-Service-Schlüssel fehlt.");
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "content-type": "application/json",
    ...extra,
  };
}

async function db(
  path: string,
  init: { method?: string; headers?: Record<string, string>; body?: BodyInit | null } = {},
): Promise<Response> {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  return fetch(url, { ...init, headers: serviceHeaders(init.headers) });
}

async function authenticate(req: Request): Promise<{ id: string; email: string }> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error("Supabase-Authentifizierung ist nicht konfiguriert.");
  const authorization = req.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) throw new Error("Bitte melde dich zuerst mit deinem Riera-Admin-Konto an.");
  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, authorization },
  });
  if (!userResponse.ok) throw new Error("Deine Anmeldung ist abgelaufen. Melde dich bitte erneut an.");
  const user = await userResponse.json();
  const adminEmail = (Deno.env.get("RIERA_ADMIN_EMAIL") ?? "").trim().toLowerCase();
  if (!adminEmail) throw new Error("Das Riera-Admin-Konto ist noch nicht konfiguriert.");
  if (!user?.id || String(user.email ?? "").trim().toLowerCase() !== adminEmail) {
    throw new Error("Dieses Konto ist nicht für die Kontoverwaltung freigeschaltet.");
  }
  return { id: user.id, email: user.email };
}

function graphVersion(): string {
  const value = Deno.env.get("META_GRAPH_API_VERSION") ?? "";
  if (!/^v\d+\.\d+$/.test(value)) throw new Error("Die unterstützte Meta-Graph-API-Version fehlt.");
  return value;
}

function requireMetaConfig(): { appId: string; appSecret: string; version: string; redirectUri: string } {
  const appId = Deno.env.get("META_APP_ID") ?? "";
  const appSecret = Deno.env.get("META_APP_SECRET") ?? "";
  const redirectUri = Deno.env.get("META_REDIRECT_URI") ?? "";
  if (!appId || !appSecret || !redirectUri) throw new Error("Die Meta-App ist noch nicht vollständig eingerichtet.");
  return { appId, appSecret, version: graphVersion(), redirectUri };
}

async function graphJson(url: URL): Promise<Record<string, any>> {
  const result = await fetch(url);
  const body = await result.json();
  if (!result.ok || body?.error) throw new Error(body?.error?.message ?? "Meta konnte die Kontodaten nicht laden.");
  return body;
}

function callbackRedirect(result: string): Response {
  const url = new URL(FRONTEND_URL);
  url.searchParams.set("meta", result);
  return Response.redirect(url.toString(), 302);
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });

  const requestUrl = new URL(req.url);
  const action = requestUrl.searchParams.get("action") ?? "status";

  try {
    if (action === "callback" && req.method === "GET") {
      const providerError = requestUrl.searchParams.get("error");
      if (providerError) return callbackRedirect("denied");
      const code = requestUrl.searchParams.get("code") ?? "";
      const state = requestUrl.searchParams.get("state") ?? "";
      if (!code || !state || state.length > 256) return callbackRedirect("invalid");

      const stateHash = await sha256Hex(state);
      const stateResult = await db(`meta_oauth_states?state_hash=eq.${stateHash}&select=state_hash,user_id,expires_at&limit=1`);
      if (!stateResult.ok) return callbackRedirect("setup");
      const states = await stateResult.json();
      const savedState = states[0];
      await db(`meta_oauth_states?state_hash=eq.${stateHash}`, { method: "DELETE" });
      if (!savedState || new Date(savedState.expires_at).getTime() <= Date.now()) return callbackRedirect("expired");

      const config = requireMetaConfig();
      const graphBase = `https://graph.facebook.com/${config.version}`;
      const shortTokenUrl = new URL(`${graphBase}/oauth/access_token`);
      shortTokenUrl.search = new URLSearchParams({
        client_id: config.appId,
        client_secret: config.appSecret,
        redirect_uri: config.redirectUri,
        code,
      }).toString();
      const shortToken = await graphJson(shortTokenUrl);
      const longTokenUrl = new URL(`${graphBase}/oauth/access_token`);
      longTokenUrl.search = new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: config.appId,
        client_secret: config.appSecret,
        fb_exchange_token: shortToken.access_token,
      }).toString();
      const longToken = await graphJson(longTokenUrl);

      const pagesUrl = new URL(`${graphBase}/me/accounts`);
      pagesUrl.search = new URLSearchParams({
        fields: "id,name,access_token,instagram_business_account{id,username}",
        limit: "100",
        access_token: longToken.access_token,
      }).toString();
      const pagesResult = await graphJson(pagesUrl);
      const pages = Array.isArray(pagesResult.data) ? pagesResult.data : [];
      if (pages.length === 0) return callbackRedirect("no-pages");

      const expiresAt = longToken.expires_in
        ? new Date(Date.now() + Number(longToken.expires_in) * 1000).toISOString()
        : null;
      const rows = [];
      for (const page of pages) {
        if (!page?.id || !page?.name || !page?.access_token) continue;
        const encrypted = await encryptTokens({
          user_access_token: longToken.access_token,
          page_access_token: page.access_token,
        });
        rows.push({
          user_id: savedState.user_id,
          facebook_page_id: String(page.id),
          facebook_page_name: String(page.name).slice(0, 200),
          instagram_business_id: page.instagram_business_account?.id ? String(page.instagram_business_account.id) : null,
          instagram_username: page.instagram_business_account?.username
            ? String(page.instagram_business_account.username).slice(0, 100)
            : null,
          token_expires_at: expiresAt,
          ...encrypted,
          updated_at: new Date().toISOString(),
        });
      }
      if (rows.length === 0) return callbackRedirect("no-pages");
      const saved = await db("meta_social_connections?on_conflict=user_id,facebook_page_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(rows),
      });
      if (!saved.ok) return callbackRedirect("storage-error");
      return callbackRedirect("connected");
    }

    if (req.method !== "GET" && req.method !== "POST") return response({ error: "Methode nicht unterstützt." }, 405, origin);
    const user = await authenticate(req);

    if (action === "start" && req.method === "POST") {
      const config = requireMetaConfig();
      await db(`meta_oauth_states?expires_at=lt.${encodeURIComponent(new Date().toISOString())}`, { method: "DELETE" });
      const state = randomState();
      const stateHash = await sha256Hex(state);
      const insert = await db("meta_oauth_states", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          state_hash: stateHash,
          user_id: user.id,
          expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        }),
      });
      if (!insert.ok) throw new Error("Der sichere Anmeldestatus konnte nicht angelegt werden.");
      const authorize = new URL(`https://www.facebook.com/${config.version}/dialog/oauth`);
      authorize.search = new URLSearchParams({
        client_id: config.appId,
        redirect_uri: config.redirectUri,
        response_type: "code",
        scope: "pages_show_list,pages_read_engagement,instagram_basic",
        state,
      }).toString();
      return response({ authorize_url: authorize.toString() }, 200, origin);
    }

    if (action === "status" && req.method === "GET") {
      const result = await db(
        `meta_social_connections?user_id=eq.${encodeURIComponent(user.id)}&select=facebook_page_id,facebook_page_name,instagram_business_id,instagram_username,selected,token_expires_at&order=facebook_page_name.asc`,
      );
      if (!result.ok) throw new Error("Verbindungsstatus konnte nicht geladen werden.");
      return response({ accounts: await result.json() }, 200, origin);
    }

    if (action === "select" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const pageIds = [...new Set(Array.isArray(body.page_ids) ? body.page_ids.map(String) : [])];
      if (pageIds.length > 100 || pageIds.some((id) => !/^\d{1,30}$/.test(id))) {
        return response({ error: "Die Kontenauswahl ist ungültig." }, 400, origin);
      }
      const ownedResult = await db(
        `meta_social_connections?user_id=eq.${encodeURIComponent(user.id)}&select=facebook_page_id`,
      );
      if (!ownedResult.ok) throw new Error("Kontenauswahl konnte nicht geprüft werden.");
      const owned = new Set((await ownedResult.json()).map((row: { facebook_page_id: string }) => row.facebook_page_id));
      if (pageIds.some((id) => !owned.has(id))) return response({ error: "Unbekanntes Konto in der Auswahl." }, 403, origin);
      const clear = await db(`meta_social_connections?user_id=eq.${encodeURIComponent(user.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ selected: false, updated_at: new Date().toISOString() }),
      });
      if (!clear.ok) throw new Error("Die bisherige Kontenauswahl konnte nicht aktualisiert werden.");
      for (const pageId of pageIds) {
        const selected = await db(
          `meta_social_connections?user_id=eq.${encodeURIComponent(user.id)}&facebook_page_id=eq.${pageId}`,
          {
            method: "PATCH",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify({ selected: true, updated_at: new Date().toISOString() }),
          },
        );
        if (!selected.ok) throw new Error("Ein Konto konnte nicht aktiviert werden.");
      }
      return response({ ok: true, selected_count: pageIds.length }, 200, origin);
    }

    if (action === "disconnect" && req.method === "POST") {
      const result = await db(`meta_social_connections?user_id=eq.${encodeURIComponent(user.id)}`, { method: "DELETE" });
      if (!result.ok) throw new Error("Konten konnten nicht getrennt werden.");
      return response({ ok: true }, 200, origin);
    }

    return response({ error: "Aktion nicht gefunden." }, 404, origin);
  } catch (error) {
    if (action === "callback") return callbackRedirect("error");
    const message = error instanceof Error ? error.message : "Die Anfrage ist fehlgeschlagen.";
    const status = message.includes("nicht freigeschaltet") ? 403 : message.includes("melde dich") || message.includes("abgelaufen") ? 401 : 400;
    return response({ error: message }, status, origin);
  }
});

