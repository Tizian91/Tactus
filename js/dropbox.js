'use strict';
/*
 * Dropbox: songs and kit profiles in the user's Dropbox (adapted from MindMapper's cloud-dropbox.js).
 *
 * The Dropbox app ("App folder" access) sees only /Apps/<app name>/ of the signed-in account:
 *   /Songs/*.tactus.json                 scores (File menu: open from / save to Dropbox)
 *   /Kit-Profile/Kits.tactus-kits.json   all kit profiles (kept in step automatically)
 *
 * Sign-in: OAuth 2 with PKCE - no app secret, no server. The page itself is the redirect URI
 * (registered in the Dropbox App Console: https://tizian91.github.io/Tactus/ and …/index.html).
 * token_access_type=offline gives a refresh token: the short access tokens (4 h) are renewed
 * without signing in again. The tokens stay in this browser (localStorage of this site).
 * Needs a secure page (https / localhost) - not available when index.html is opened as a file.
 *
 * Saving a song again checks Dropbox's revision ("rev"): if the file was changed elsewhere
 * since it was opened (another device), Tactus asks before overwriting.
 *
 * Kit profiles: every change is uploaded (shortly after). On start the Dropbox copy replaces the
 * local one - unless local changes could not be uploaded yet (offline): then they are uploaded.
 * The first connection joins the profiles of both sides.
 * API: https://www.dropbox.com/developers/documentation/http/documentation
 */
(function (TC) {
  const DB = (TC.dropbox = {});
  const KEY = 'tactus.dropbox';               // localStorage: { refresh, access, expires, account }
  const PKCE = 'tactus.dropbox.pkce';         // sessionStorage during the sign-in: { verifier, state, after }
  const KITS_PENDING = 'tactus.kits.pending'; // localStorage: local kit profiles not uploaded yet
  const tr = (s, v) => TC.tr(s, v);

  /** App key of the Dropbox app - public by design of PKCE (the app secret is never used). */
  DB.APP_KEY = 'ey33xyly2p04g5d';
  DB.SONGS = '/Songs';
  DB.KITS_FILE = '/Kit-Profile/Kits.tactus-kits.json';
  const API = 'https://api.dropboxapi.com';
  const CONTENT = 'https://content.dropboxapi.com';
  const AUTHORIZE = 'https://www.dropbox.com/oauth2/authorize';
  const redirectUri = () => location.origin + location.pathname;

  /** Sign-in needs a secure page (https or localhost) and the browser's crypto. */
  DB.allowed = !!(typeof window !== 'undefined' && window.isSecureContext && window.crypto && window.crypto.subtle);

  // ---- Settings (tokens) -------------------------------------------------------------

  function load(storage, key) {
    try {
      const v = JSON.parse(storage.getItem(key) || 'null');
      return v && typeof v === 'object' ? v : null;
    } catch (e) {
      return null;
    }
  }
  function store(storage, key, value) {
    try {
      if (value === null) storage.removeItem(key);
      else storage.setItem(key, JSON.stringify(value));
    } catch (e) { /* storage unavailable: the sign-in only lasts for this page */ }
  }
  let cfg = (DB.allowed && load(localStorage, KEY)) || {};
  const save = (c) => {
    cfg = c;
    store(localStorage, KEY, c);
  };

  DB.signedIn = () => !!cfg.refresh;
  DB.account = () => cfg.account || '';

  // ---- Sign-in ---------------------------------------------------------------------

  const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const random = (n) => b64url(crypto.getRandomValues(new Uint8Array(n)));

  /**
   * Go to Dropbox's sign-in / approval page; it sends the user back with a code.
   * after: what to do once back ('open' | 'save' | null). The open score waits in the autosave.
   */
  DB.login = async function (after) {
    if (!DB.allowed) return;
    if (TC.storage) TC.storage.autosave();
    const verifier = random(48);
    const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
    const state = random(16);
    store(sessionStorage, PKCE, { verifier, state, after: after || null });
    location.assign(AUTHORIZE + '?' + new URLSearchParams({
      client_id: DB.APP_KEY,
      response_type: 'code',
      redirect_uri: redirectUri(),
      code_challenge: challenge,
      code_challenge_method: 'S256',
      token_access_type: 'offline',
      state,
    }));
  };

  async function tokenRequest(fields) {
    let res;
    try {
      res = await fetch(API + '/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(Object.assign({ client_id: DB.APP_KEY }, fields)),
      });
    } catch (e) {
      throw offline();
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(body.error_description || body.error || 'HTTP ' + res.status);
      err.auth = res.status === 400 || res.status === 401; // code / refresh token no longer valid
      throw err;
    }
    return body;
  }

  const withAccess = (r) => ({ access: r.access_token, expires: Date.now() + (r.expires_in || 14400) * 1000 });

  /**
   * Back from Dropbox: ?code=… (or ?error=…) in the address - trade the code for the tokens.
   * Runs at once when this file loads; main.js waits for DB.ready.
   * Sets DB.justLoggedIn / DB.after / DB.loginError.
   */
  DB.ready = (async function takeCode() {
    if (!DB.allowed) return;
    const q = new URLSearchParams(location.search);
    if (!q.has('code') && !q.has('error')) return;
    history.replaceState(null, '', redirectUri() + location.hash); // the code must not stay in the address
    const pending = load(sessionStorage, PKCE);
    store(sessionStorage, PKCE, null);
    if (q.has('error')) {
      // "access_denied": the user said no - nothing to report
      if (q.get('error') !== 'access_denied') DB.loginError = q.get('error_description') || q.get('error');
      return;
    }
    if (!pending || pending.state !== q.get('state')) {
      DB.loginError = tr('the answer does not belong to this sign-in');
      return;
    }
    try {
      const r = await tokenRequest({
        grant_type: 'authorization_code', code: q.get('code'), code_verifier: pending.verifier, redirect_uri: redirectUri(),
      });
      save(Object.assign({}, cfg, { refresh: r.refresh_token }, withAccess(r)));
      DB.justLoggedIn = true;
      DB.after = pending.after;
      try {
        const acc = await rpc('users/get_current_account', null);
        save(Object.assign({}, cfg, { account: (acc.name && acc.name.display_name) || acc.email || '' }));
      } catch (e) { /* the name is only for the menu */ }
    } catch (err) {
      DB.loginError = err.message;
    }
  })();

  /** Sign out: Dropbox forgets the token, this browser the sign-in. */
  DB.disconnect = async function () {
    if (cfg.refresh) {
      try {
        await rpc('auth/token/revoke', null);
      } catch (e) { /* offline or already revoked: forget it here anyway */ }
    }
    save({});
  };

  // ---- API -------------------------------------------------------------------------

  function offline() {
    const err = new Error(tr('Dropbox cannot be reached (offline?)'));
    err.offline = true;
    return err;
  }
  function signedOut() {
    const err = new Error(tr('Dropbox: signed out - please connect again'));
    err.auth = true;
    return err;
  }

  let refreshing = null;
  /** A valid access token - renewed with the refresh token when (nearly) expired. */
  async function token(force) {
    if (!cfg.refresh) throw signedOut();
    if (!force && cfg.access && cfg.expires - Date.now() > 60000) return cfg.access;
    if (!refreshing) {
      refreshing = tokenRequest({ grant_type: 'refresh_token', refresh_token: cfg.refresh })
        .then((r) => save(Object.assign({}, cfg, withAccess(r))))
        .catch((err) => {
          // revoked (in Dropbox: Settings → Connected apps) or expired: sign in again
          if (err.auth) save(Object.assign({}, cfg, { refresh: null, access: null }));
          throw err.auth ? signedOut() : err;
        })
        .finally(() => { refreshing = null; });
    }
    await refreshing;
    return cfg.access;
  }

  /** Dropbox-API-Arg is an HTTP header: characters outside ASCII must be escaped. */
  const headerArg = (obj) => JSON.stringify(obj).replace(/[\u007f-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));

  /**
   * fetch with the token. A 401 renews the token once, "too many requests" waits and tries
   * again. Errors carry Dropbox's error_summary ("path/not_found/..", "path/conflict/file/..").
   */
  async function call(url, init) {
    let renewed = false;
    for (let attempt = 0; ; attempt++) {
      const auth = await token(renewed && attempt > 0);
      let res;
      try {
        res = await fetch(url, Object.assign({ cache: 'no-store', referrerPolicy: 'no-referrer' }, init, {
          headers: Object.assign({ Authorization: 'Bearer ' + auth }, init.headers),
        }));
      } catch (e) {
        throw offline();
      }
      if (res.ok) return res;
      if (res.status === 401 && !renewed) {
        renewed = true;
        continue;
      }
      if ((res.status === 429 || res.status >= 500) && attempt < 3) {
        const wait = Number(res.headers.get('Retry-After'));
        await pause(wait > 0 ? Math.min(wait, 30) * 1000 : 800 * 2 ** attempt);
        continue;
      }
      const text = await res.text().catch(() => '');
      let summary = text;
      try { summary = JSON.parse(text).error_summary || text; } catch (e) { /* plain text error */ }
      if (res.status === 401) {
        save(Object.assign({}, cfg, { refresh: null, access: null }));
        throw signedOut();
      }
      const err = new Error('Dropbox: ' + (summary || 'HTTP ' + res.status).trim());
      err.status = res.status;
      err.summary = String(summary || '');
      err.notFound = /not_found/.test(err.summary);
      err.conflict = res.status === 409 && /conflict/.test(err.summary);
      throw err;
    }
  }

  const rpc = async (endpoint, args) => (await call(API + '/2/' + endpoint, {
    method: 'POST',
    headers: args === null ? {} : { 'Content-Type': 'application/json' },
    body: args === null ? undefined : JSON.stringify(args),
  })).json();

  /** All entries of a folder (Dropbox answers in pages); a missing folder is empty. */
  async function listAll(folder) {
    let r;
    try {
      r = await rpc('files/list_folder', { path: folder, recursive: false, include_deleted: false, limit: 2000 });
    } catch (err) {
      if (err.notFound) return [];
      throw err;
    }
    const entries = r.entries.slice();
    while (r.has_more) {
      r = await rpc('files/list_folder/continue', { cursor: r.cursor });
      entries.push(...r.entries);
    }
    return entries;
  }

  /** Text and revision of a file (error.notFound if it is not there). */
  DB.read = async function (path) {
    const res = await call(CONTENT + '/2/files/download', { method: 'POST', headers: { 'Dropbox-API-Arg': headerArg({ path }) } });
    let rev = null;
    try { rev = JSON.parse(res.headers.get('Dropbox-API-Result')).rev; } catch (e) { /* header not readable */ }
    return { text: await res.text(), rev };
  };

  /**
   * Write a text file. how: 'add' (fails with error.conflict if a file is there), 'overwrite',
   * or a rev (fails with error.conflict if the file was changed since). Missing folders are created.
   */
  DB.write = async function (path, text, how) {
    const mode = how === 'add' || how === 'overwrite' ? how : { '.tag': 'update', update: String(how) };
    const res = await call(CONTENT + '/2/files/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': headerArg({ path, mode, autorename: false, mute: true, strict_conflict: true }),
      },
      body: new Blob([text], { type: 'application/octet-stream' }),
    });
    return res.json(); // { name, path_display, rev, server_modified, … }
  };

  DB.remove = async function (path) {
    try {
      await rpc('files/delete_v2', { path });
    } catch (err) {
      if (!err.notFound) throw err; // gone already
    }
  };

  /** The songs: [{ name, path, rev, modified }], newest first. */
  DB.listSongs = async function () {
    return (await listAll(DB.SONGS))
      .filter((e) => e['.tag'] === 'file' && /\.json$/i.test(e.name))
      .map((e) => ({ name: e.name, path: e.path_display, rev: e.rev, modified: Date.parse(e.server_modified) || 0 }))
      .sort((a, b) => b.modified - a.modified);
  };

  // ---- Kit profiles ---------------------------------------------------------------------

  /**
   * Profiles of both sides joined by id (pure, tested). preferLocal: a profile on both sides
   * comes from local (it was changed here and not uploaded yet).
   */
  DB.mergeKits = function (local, remote, preferLocal) {
    const out = [], at = new Map();
    const put = (p, replace) => {
      if (!p || typeof p.drm !== 'string' || !p.assign) return;
      if (at.has(p.id)) {
        if (replace) out[at.get(p.id)] = p;
      } else {
        at.set(p.id, out.length);
        out.push(p);
      }
    };
    remote.forEach((p) => put(p, false));
    local.forEach((p) => put(p, preferLocal));
    return out;
  };

  let kitTimer = 0;
  /** Called by kits.js after every change of the profiles: upload them shortly after. */
  DB.kitsChanged = function () {
    if (!DB.signedIn()) return;
    try { localStorage.setItem(KITS_PENDING, '1'); } catch (e) { /* uploaded anyway */ }
    clearTimeout(kitTimer);
    kitTimer = setTimeout(() => DB.pushKits().catch((err) => TC.ui.hint(err.message)), 1500);
  };
  DB.pushKits = async function () {
    if (!DB.signedIn()) return;
    await DB.write(DB.KITS_FILE, TC.kits.exportText(), 'overwrite');
    try { localStorage.removeItem(KITS_PENDING); } catch (e) { /* no flag */ }
  };

  /**
   * Bring the kit profiles of this browser and of Dropbox together (on start and after
   * connecting). first: the first connection - join both sides.
   */
  DB.syncKits = async function (first) {
    if (!DB.signedIn()) return;
    const K = TC.kits;
    let remote = null;
    try {
      const d = JSON.parse((await DB.read(DB.KITS_FILE)).text);
      if (d && Array.isArray(d.profiles)) remote = d.profiles;
    } catch (err) {
      if (!err.notFound && !(err instanceof SyntaxError)) throw err;
    }
    K.load();
    let pending = false;
    try { pending = !!localStorage.getItem(KITS_PENDING); } catch (e) { /* none */ }
    const before = JSON.stringify(K.list);
    if (remote) K.list = first || pending ? DB.mergeKits(K.list, remote, true) : DB.mergeKits([], remote, false);
    if (JSON.stringify(K.list) !== before) {
      K.save(true);
      if (K.isOpen()) K.open();
      TC.refresh();
    }
    if (!remote || first || pending) {
      if (K.list.length || remote) await DB.pushKits();
    }
  };

  // ---- Songs: dialog ----------------------------------------------------------------------

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  let root = null;

  DB.isOpen = () => !!root;
  DB.close = function () {
    if (root) root.remove();
    root = null;
  };

  /** List of the songs in Dropbox: click opens one. */
  DB.openDialog = function () {
    DB.close();
    root = document.createElement('div');
    root.className = 'dialog-backdrop';
    root.innerHTML = `<div class="dialog db-dialog" role="dialog" aria-modal="true">
      <header><h2>☁ ${esc(tr('Songs in Dropbox'))}</h2><button type="button" class="icon" data-d="close" title="${esc(tr('Close'))}">✕</button></header>
      <div class="kit-body db-list"><p class="hint">${esc(tr('Reading…'))}</p></div>
      <footer><span class="hint">${esc(tr('Folder: Dropbox / Apps / (app) / Songs'))}</span><span class="grow"></span>
        <button type="button" data-d="refresh">${esc(tr('Refresh'))}</button></footer></div>`;
    document.body.appendChild(root);
    root.addEventListener('pointerdown', (e) => { if (e.target === root) DB.close(); });
    root.addEventListener('keydown', (e) => { if (e.key === 'Escape') DB.close(); e.stopPropagation(); });
    root.addEventListener('click', onDialogClick);
    fill();
  };

  let songs = [];
  async function fill() {
    const list = root && root.querySelector('.db-list');
    if (!list) return;
    try {
      songs = await DB.listSongs();
    } catch (err) {
      list.innerHTML = `<p class="hint warn">${esc(err.message)}</p>`;
      return;
    }
    if (!root) return;
    const lang = TC.getLang() === 'de' ? 'de-DE' : 'en-GB';
    list.innerHTML = songs.length ? songs.map((s, i) => `<div class="db-row">
        <button type="button" class="db-song" data-i="${i}"><span class="db-name">${esc(s.name.replace(/\.tactus\.json$|\.json$/i, ''))}</span>
          <span class="muted">${esc(new Date(s.modified).toLocaleString(lang, { dateStyle: 'medium', timeStyle: 'short' }))}</span></button>
        <button type="button" class="icon" data-del="${i}" title="${esc(tr('Delete from Dropbox'))}">🗑</button></div>`).join('')
      : `<p class="hint">${esc(tr('No songs in Dropbox yet. Save one with File → Save to Dropbox.'))}</p>`;
  }

  async function onDialogClick(e) {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.d === 'close') return DB.close();
    if (b.dataset.d === 'refresh') return fill();
    if (b.dataset.del !== undefined) {
      const s = songs[+b.dataset.del];
      if (!s || !confirm(tr('Delete "{name}" from Dropbox?', { name: s.name }))) return;
      try {
        await DB.remove(s.path);
      } catch (err) {
        alert(err.message);
      }
      return fill();
    }
    if (b.dataset.i !== undefined) {
      const s = songs[+b.dataset.i];
      if (!s) return;
      if (TC.state.dirty && !confirm(tr('Discard the changes of the open score?'))) return;
      b.disabled = true;
      try {
        const r = await DB.read(s.path);
        const doc = TC.normalizeDoc(JSON.parse(r.text));
        DB.close();
        TC.storage.setDoc(doc, s.name, null, { path: s.path, rev: r.rev || s.rev });
        TC.ui.hint(tr('Opened from Dropbox: {name}', { name: s.name }));
      } catch (err) {
        b.disabled = false;
        alert(tr('This file cannot be opened: {msg}', { msg: err.message }));
      }
    }
  }

  // ---- Songs: save ----------------------------------------------------------------------------

  const fileName = (s) => String(s || '').replace(/[\\/:*?"<>|]+/g, '-').trim();

  /**
   * Save the open score to Dropbox. Again into the same file (checked against changes made
   * elsewhere) - or, with saveAs / a score not from Dropbox, under a name in /Songs.
   */
  DB.saveSong = async function (saveAs) {
    const S = TC.state;
    if (!DB.signedIn()) return DB.login('save');
    const text = JSON.stringify(S.doc, null, 1);
    let target = S.file.dropbox && !saveAs ? S.file.dropbox : null;
    let meta;
    try {
      if (target) {
        try {
          meta = await DB.write(target.path, text, target.rev || 'overwrite');
        } catch (err) {
          if (!err.conflict) throw err;
          const choice = confirm(tr('"{name}" was changed in Dropbox meanwhile (on another device?).\n\nOK: overwrite it with this version\nCancel: save this version under a new name', { name: S.file.name }));
          if (choice) meta = await DB.write(target.path, text, 'overwrite');
          else target = null;
        }
      }
      if (!target) {
        const base = fileName(S.file.dropbox && !saveAs ? '' : (S.doc.meta.title || S.file.name.replace(/\.tactus\.json$|\.json$/i, '')) || 'Untitled');
        const name = fileName(prompt(tr('Name of the song in Dropbox:'), base) || '');
        if (!name) return;
        const path = DB.SONGS + '/' + name.replace(/\.tactus\.json$|\.json$/i, '') + '.tactus.json';
        try {
          meta = await DB.write(path, text, 'add');
        } catch (err) {
          if (!err.conflict) throw err;
          if (!confirm(tr('"{name}" already exists in Dropbox. Overwrite it?', { name }))) return;
          meta = await DB.write(path, text, 'overwrite');
        }
      }
    } catch (err) {
      if (err.auth) {
        if (confirm(tr('Dropbox: signed out - please connect again') + '\n\n' + tr('Connect now?'))) DB.login('save');
        return;
      }
      alert(tr('Could not save: {msg}', { msg: err.message }));
      return;
    }
    S.file = { handle: null, name: meta.name, saved: true, dropbox: { path: meta.path_display, rev: meta.rev } };
    S.dirty = false;
    TC.storage.autosave();
    TC.refresh();
    TC.ui.hint(tr('Saved to Dropbox: {name}', { name: meta.name }));
  };

  DB.openSongs = function () {
    if (!DB.signedIn()) return DB.login('open');
    DB.openDialog();
  };

  /** Startup (main.js): finish a sign-in, sync the kit profiles, continue what the sign-in was for. */
  DB.start = async function () {
    if (!DB.allowed) return;
    await DB.ready;
    if (DB.loginError) TC.ui.hint(tr('Dropbox sign-in failed: {msg}', { msg: DB.loginError }));
    if (!DB.signedIn()) return;
    if (DB.justLoggedIn) TC.ui.hint(tr('Connected to Dropbox') + (DB.account() ? ' (' + DB.account() + ')' : ''));
    try {
      await DB.syncKits(!!DB.justLoggedIn);
    } catch (err) {
      TC.ui.hint(err.message);
    }
    if (DB.after === 'open') DB.openDialog();
    else if (DB.after === 'save') DB.saveSong(false);
    DB.after = null;
  };
})(window.TC);
