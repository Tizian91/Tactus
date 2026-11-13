'use strict';
// Dropbox (js/dropbox.js): joining the kit profiles of this browser and of Dropbox. The network part is not tested here.
module.exports = function (T) {
  const TC = T.load(['state.js', 'i18n.js', 'dropbox.js']);
  const DB = TC.dropbox;
  const p = (id, name) => ({ id, name, drm: '<drm/>', assign: {} });
  const names = (list) => list.map((x) => x.id + ':' + x.name);

  T.ok('not allowed outside a secure page (file://, tests)', DB.allowed === false && DB.signedIn() === false);
  T.eq('start: Dropbox replaces this browser', names(DB.mergeKits([], [p('a', 'EZ'), p('b', 'SD3')], false)), ['a:EZ', 'b:SD3']);
  T.eq('first connection: both sides joined, local wins on the same id',
    names(DB.mergeKits([p('a', 'EZ new'), p('c', 'UJAM')], [p('a', 'EZ'), p('b', 'SD3')], true)), ['a:EZ new', 'b:SD3', 'c:UJAM']);
  T.eq('without preferLocal: Dropbox wins on the same id', names(DB.mergeKits([p('a', 'EZ new')], [p('a', 'EZ')], false)), ['a:EZ']);
  T.eq('broken profiles are left out', names(DB.mergeKits([{ id: 'x' }, null], [p('a', 'EZ'), { id: 'y', drm: 1 }], true)), ['a:EZ']);
  T.eq('folders in the app folder', [DB.SONGS, DB.KITS_FILE], ['/Songs', '/Kit-Profile/Kits.tactus-kits.json']);
};
