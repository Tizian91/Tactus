'use strict';
/*
 * Keyboard shortcuts and gestures: one list for the settings window (js/panel.js) and the manual
 * (hilfe.html). English texts, translated where shown (TC.tr).
 */
(function (TC) {
  TC.SHORTCUTS = [
    ['1 … 7', 'Whole … 64th note'], ['.', 'Dotted'], ['T', 'Triplet'],
    ['L / Shift', 'Lock instrument (switch / while held)'],
    ['H O S K', 'Hi-hat closed / open, snare, kick'], ['R C F P', 'Ride, crash, floor tom, pedal hi-hat'],
    ['A / G', 'Accent / ghost note'], ['↑ ↓', 'Selected notes to the next instrument'],
    ['Press, drag, release', 'A new note follows; release writes it'],
    ['Drag a note', 'Move it (sideways: time, up / down: instrument)'],
    ['Hold a note, drag', 'Row of notes (mouse: Ctrl + drag)'],
    ['Hold a note, up / down', 'Strength: ghost · soft · normal · strong · accent'],
    ['Hold a note, release', 'Menu: instruments of the line (hi-hat closed / open …), ghost / accent'],
    ['W / V / E', 'Write / select / erase'], ['Ctrl+A', 'Select all notes (or those of the selected bars)'],
    ['← →', 'Selected notes one grid step earlier / later'],
    ['Beside the lines', 'Tap: select the bar · drag: scroll'],
    ['Two fingers', 'Scroll and zoom'],
    ['Shift + click beside the lines', 'Select bars up to there'],
    ['Ctrl+click', 'Select several notes'],
    ['Space', 'Play / stop'], ['Ctrl+C / V / D', 'Copy / paste / duplicate the bar'],
    ['Del', 'Delete selected notes'], ['Ctrl+Z / Y', 'Undo / redo'],
    ['Wheel', 'Scroll (Ctrl: zoom, Shift: up/down)'], ['Space+drag', 'Move the view'],
  ];
})(window.TC);
