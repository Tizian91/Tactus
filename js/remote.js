'use strict';
/*
 * Turning pages by MIDI (Web MIDI: Chrome / Edge, also on Android with a USB MIDI interface).
 * E.g. a player of backing tracks (Cymatic …) plays a MIDI track along with the song that turns the
 * pages - Tactus writes that track itself (File → "Export page turning MIDI…", js/midi.js pageTurns).
 *
 *   settings.remoteIn    name of the MIDI input ('' = off)
 *   settings.remoteMode  'page'  note n = page n (note 1 = page 1); a program change n = page n + 1
 *                                (a lost message does not matter: the next one says the page again)
 *                        'step'  two learnt messages: next page / page before
 *   settings.remoteCh    'all' or a channel 0 … 15 the messages must come on
 *   settings.remoteNext, settings.remotePrev   learnt messages: { type: 0x90 | 0xB0 | 0xC0, ch, d1 }
 *
 *   TC.remote.decode(bytes, settings) -> { page } | { step: 1 | -1 } | null     (pure, tested)
 */
(function (TC) {
  const R = (TC.remote = {});
  const tr = (s, v) => (TC.tr ? TC.tr(s, v) : s.replace(/\{(\w+)\}/g, (m, k) => v[k])); // (the tests run without i18n.js)
  const S = TC.state;
  let access = null, asking = null, input = null, learning = null;

  R.supported = () => typeof navigator !== 'undefined' && !!navigator.requestMIDIAccess;

  /** What a MIDI message means for the pages (null: nothing). */
  R.decode = function (data, st) {
    if (!data || data.length < 2) return null;
    const type = data[0] & 0xf0, ch = data[0] & 15, d1 = data[1], d2 = data.length > 2 ? data[2] : 0;
    if (type === 0xf0) return null; // clock, start / stop …
    if (st.remoteCh !== undefined && st.remoteCh !== 'all' && st.remoteCh !== '' && ch !== Number(st.remoteCh)) return null;
    const on = type === 0x90 ? d2 > 0 : type === 0xb0 ? d2 >= 64 : type === 0xc0; // (a pedal: pressed, not released)
    if (!on) return null;
    if (st.remoteMode !== 'step') {
      if (type === 0x90 && d1 >= 1) return { page: d1 - 1 };
      if (type === 0xc0) return { page: d1 };
      return null;
    }
    const is = (m) => m && m.type === type && m.ch === ch && (type === 0xc0 || m.d1 === d1);
    if (is(st.remoteNext)) return { step: 1 };
    if (is(st.remotePrev)) return { step: -1 };
    return null;
  };
  /** A learnt message as text ("Note 60, channel 1"). */
  R.describe = function (m) {
    if (!m) return tr('not learnt yet');
    const ch = tr('channel {n}', { n: m.ch + 1 });
    if (m.type === 0x90) return `${tr('Note')} ${m.d1}, ${ch}`;
    if (m.type === 0xb0) return `CC ${m.d1}, ${ch}`;
    return `${tr('Program change')}, ${ch}`;
  };

  /** Asks the browser for MIDI (once). Resolves to true / false. */
  R.init = function () {
    if (access) return Promise.resolve(true);
    if (!R.supported()) return Promise.resolve(false);
    if (!asking) {
      asking = navigator.requestMIDIAccess({ sysex: false }).then((a) => {
        access = a;
        a.addEventListener('statechange', () => {
          R.connect();
          if (TC.refresh) TC.refresh();
        });
        R.connect();
        return true;
      }).catch(() => {
        asking = null;
        return false;
      });
    }
    return asking;
  };
  /** Names of the MIDI inputs (empty until R.init has been answered). */
  R.inputs = () => (access ? [...access.inputs.values()].map((i) => i.name) : []);
  /** The chosen input is connected and listened to. */
  R.active = () => !!input;
  R.missing = () => !!S.settings.remoteIn && !!access && !input;

  /** Listen to the chosen input (and to nothing else). */
  R.connect = function () {
    if (input) input.onmidimessage = null;
    input = null;
    if (!access || !S.settings.remoteIn) return;
    input = [...access.inputs.values()].find((i) => i.name === S.settings.remoteIn) || null;
    if (input) input.onmidimessage = (e) => receive(e.data);
  };

  /** The next message is learnt as 'next' or 'prev' (step mode). */
  R.learn = function (which) {
    learning = which === 'prev' ? 'prev' : 'next';
    TC.ui.hint(tr('Now send the MIDI message for "{what}" …', { what: tr(learning === 'next' ? 'next page' : 'page before') }));
  };
  R.isLearning = () => learning;

  function receive(data) {
    const type = data[0] & 0xf0;
    if (learning && (type === 0x90 || type === 0xb0 || type === 0xc0) && (type === 0xc0 || data[2] > 0)) {
      const m = { type, ch: data[0] & 15, d1: data[1] };
      S.settings[learning === 'next' ? 'remoteNext' : 'remotePrev'] = m;
      TC.saveSettings();
      TC.ui.hint(tr('Learnt: {what}', { what: R.describe(m) }));
      learning = null;
      if (TC.refresh) TC.refresh();
      return;
    }
    const d = R.decode(data, S.settings);
    if (!d) return;
    if (d.page !== undefined) TC.actions.gotoPage(d.page);
    else TC.actions.turnPage(d.step);
  }
})(window.TC);
