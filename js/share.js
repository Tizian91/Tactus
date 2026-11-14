'use strict';
/*
 * Share a score as a link: the whole score travels in the address after "#" - no server, no
 * account. The part after "#" is never sent to a server (not even to GitHub Pages); whoever
 * opens the link gets the score in their browser.
 *
 *   https://tizian91.github.io/Tactus/#s=z<data>
 *     z  the score as compact JSON, compressed (deflate, the browser's CompressionStream), base64url
 *     j  the same without compression (browsers without CompressionStream)
 *
 * Compact: ids, the view and default values are left out; TC.normalizeDoc fills them in again.
 */
(function (TC) {
  const S = TC.state;
  const SH = (TC.share = {});
  const tr = (s, v) => TC.tr(s, v);
  SH.BASE = 'https://tizian91.github.io/Tactus/';

  /** The address the link starts with: this page online, otherwise the GitHub Pages version. */
  SH.base = () => (typeof location !== 'undefined' && location.protocol === 'https:' ? location.origin + location.pathname : SH.BASE);

  // ---- Compact JSON (pure, tested) ----------------------------------------------------------

  const TRACK_DEFAULTS = { kit: null, oneLine: false, hidden: false };
  const NOTE_DEFAULTS = { accent: 0, ghost: false, head: 'auto', vel: null, orn: null, trem: 0, stick: '' };
  const BAR_DEFAULTS = { tempo: null, repeatStart: false, repeatEnd: 0, volta: null, marker: '', beam: null, lineBreak: false,
    mark: '', end: '', jump: '', jumpRep: false };

  /** The score as short JSON text (what the link carries). */
  SH.pack = function (doc) {
    const d = JSON.parse(JSON.stringify(doc));
    delete d.view;
    const strip = (o, defs) => Object.keys(defs).forEach((k) => { if (JSON.stringify(o[k]) === JSON.stringify(defs[k])) delete o[k]; });
    d.bars.forEach((h) => strip(h, BAR_DEFAULTS));
    d.tracks.forEach((t) => {
      delete t.id;
      strip(t, TRACK_DEFAULTS);
      t.bars.forEach((b) => { if (!b.simile) delete b.simile; });
      t.bars.forEach((b) => b.voices.forEach((v) => v.forEach((e) => {
        delete e.id;
        e.notes.forEach((n) => {
          delete n.id;
          strip(n, NOTE_DEFAULTS);
        });
      })));
    });
    Object.keys(d.meta).forEach((k) => { if (d.meta[k] === '') delete d.meta[k]; });
    return JSON.stringify(d);
  };

  // ---- Encoding --------------------------------------------------------------------------------

  const b64url = (bytes) => {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  const unb64url = (s) => {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };
  const pipe = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());

  /** The code after "#s=" for a score. */
  SH.encode = async function (doc) {
    const bytes = new TextEncoder().encode(SH.pack(doc));
    if (typeof CompressionStream !== 'undefined') return 'z' + b64url(await pipe(bytes, new CompressionStream('deflate-raw')));
    return 'j' + b64url(bytes);
  };
  /** The score of a code (throws if it is broken). */
  SH.decode = async function (code) {
    const kind = code[0];
    let bytes = unb64url(code.slice(1));
    if (kind === 'z') bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
    else if (kind !== 'j') throw new Error('unknown link format');
    return TC.normalizeDoc(JSON.parse(new TextDecoder().decode(bytes)));
  };

  SH.link = async (doc) => SH.base() + '#s=' + (await SH.encode(doc));

  // ---- Share / open ---------------------------------------------------------------------------

  /** File menu: link of the open score - shared (phones / tablets) or copied. */
  SH.copyLink = async function () {
    let url;
    try {
      url = await SH.link(S.doc);
    } catch (e) {
      return alert(tr('The link could not be made: {msg}', { msg: e && e.message }));
    }
    const title = S.doc.meta.title || 'Tactus';
    const long = url.length > 8000 ? ' ' + tr('(very long - some messengers cut such links)') : '';
    if (navigator.share && window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
      try {
        await navigator.share({ title, url });
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      TC.ui.hint(tr('Link copied ({n} characters) – paste it into a message or e-mail', { n: url.length }) + long);
    } catch (e) {
      prompt(tr('Copy this link:') + long, url);
    }
  };

  /** A link was opened (#s=…): show its score (after asking, if the open one has unsaved changes). */
  SH.openFromHash = async function () {
    const m = typeof location !== 'undefined' && location.hash.match(/^#s=([zj][A-Za-z0-9_-]+)$/);
    if (!m) return false;
    history.replaceState(null, '', location.pathname + location.search); // the score is not kept in the address
    let doc;
    try {
      doc = await SH.decode(m[1]);
    } catch (e) {
      alert(tr('This link does not contain a readable score.'));
      return false;
    }
    const title = doc.meta.title || tr('Shared score');
    if (S.dirty && !confirm(tr('Open the shared score "{t}"? The changes of the open score are not saved.', { t: title }))) return false;
    TC.storage.setDoc(doc, title.replace(/[\\/:*?"<>|]+/g, '-') + '.tactus.json');
    S.dirty = true; // only in this browser so far: asked before it is replaced
    TC.actions.home();
    TC.ui.hint(tr('Opened from a link: {t}', { t: title }));
    return true;
  };

  if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('hashchange', () => SH.openFromHash());
})(window.TC);
