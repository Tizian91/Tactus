'use strict';
/*
 * Keep the screen on (Screen Wake Lock API: Chrome / Edge on Android and Windows, Safari from iOS 16.4; only over
 * https, not from a file). S.settings.wake:
 *   'play'    while playing and in the stage view (default)
 *   'always'  as long as Tactus is open and in front
 *   'off'     as the device does it
 * The browser lets go of the lock when the tab is hidden; it is taken again when Tactus comes back.
 */
(function (TC) {
  const W = (TC.wake = {});
  let lock = null, asking = false;

  W.supported = () => !!(navigator.wakeLock && navigator.wakeLock.request);

  /** Should the screen stay on now? */
  const wanted = () => {
    const m = TC.state.settings.wake || 'play';
    if (m === 'off' || document.visibilityState !== 'visible') return false;
    return m === 'always' || (TC.player && TC.player.playing) || document.body.classList.contains('perform');
  };

  /** Take or release the lock as needed (called on every refresh; cheap when nothing changes). */
  W.update = function () {
    if (!W.supported()) return;
    const want = wanted();
    if (want && !lock && !asking) {
      asking = true;
      navigator.wakeLock.request('screen').then((l) => {
        asking = false;
        lock = l;
        l.addEventListener('release', () => { if (lock === l) lock = null; });
        if (!wanted()) W.update(); // (stopped in the meantime)
      }, () => { asking = false; }); // (not allowed here, e.g. low battery: the device decides)
    } else if (!want && lock) {
      const l = lock;
      lock = null;
      l.release().catch(() => {});
    }
  };

  document.addEventListener('visibilitychange', () => W.update());
})(window.TC);
