#!/usr/bin/env bash
# Builds the drum samples of Tactus (samples/*.flac) from two free libraries:
#
#   MuldjordKit (FreePats version) by Lars Muldjord - CC BY 4.0
#     https://freepats.zenvoid.org/Percussion/acoustic-drum-kit.html
#     download: MuldjordKit-SFZ+FLAC-20201018.7z, unpacked into samples-src/muldjord/
#   Virtuosity Drums by Versilian Studios - CC0 1.0
#     https://github.com/sfzinstruments/virtuosity_drums  (single files into samples-src/virtuosity/)
#
# samples-src/ is not in the repository (large). Every sound: 3 strengths (soft / middle / loud),
# mono, 32 kHz, 16 bit FLAC (no silence at the start, unlike MP3 / AAC), the decay shortened and
# faded out, all strengths of a sound with one gain (loudest peak at -1 dB).
#
#   bash tools/build_samples.sh        (needs ffmpeg; FF=path/to/ffmpeg/bin if it is not on PATH)
set -euo pipefail
cd "$(dirname "$0")/.."
FF=${FF:-$(dirname "$(command -v ffmpeg || ls -d "$(cygpath -u "${LOCALAPPDATA:-.}")"/Microsoft/WinGet/Packages/Gyan.FFmpeg*/ffmpeg-*/bin/ffmpeg.exe 2>/dev/null | head -1)")}
M="samples-src/muldjord/MuldjordKit SFZ+FLAC-20201018/samples"
V="samples-src/virtuosity"
OUT=samples
mkdir -p "$OUT"
rm -f "$OUT"/*.flac

# loudest peak (dB) of a file after trimming
peak() { "$FF/ffmpeg" -hide_banner -i "$1" -t "$2" -af volumedetect -f null - 2>&1 | grep -o 'max_volume: [-0-9.]*' | awk '{print $2}'; }

# sound NAME DURATION FILE1 FILE2 FILE3   (soft, middle, loud)
sound() {
  local name=$1 dur=$2; shift 2
  local p g k=1 fade
  p=$(peak "$3" "$dur")
  g=$(awk -v p="$p" 'BEGIN { printf "%.2f", -1 - p }')
  fade=$(awk -v d="$dur" 'BEGIN { f = d * 0.35; if (f > 0.6) f = 0.6; printf "%.3f", f }')
  for f in "$@"; do
    "$FF/ffmpeg" -hide_banner -loglevel error -y -i "$f" \
      -af "silenceremove=start_periods=1:start_threshold=-60dB:start_silence=0.002,atrim=0:$dur,afade=t=out:st=$(awk -v d="$dur" -v f="$fade" 'BEGIN{printf "%.3f", d-f}'):d=$fade,volume=${g}dB" \
      -ac 1 -ar 32000 -sample_fmt s16 -c:a flac -compression_level 12 "$OUT/$name-$k.flac"
    k=$((k + 1))
  done
}

# three strengths of a MuldjordKit folder: the files are numbered from soft to loud
mul() {
  local dir=$1 files n
  mapfile -t files < <(ls "$M/$dir" | sort -n)
  n=${#files[@]}
  printf '%s\n' "$M/$dir/${files[$((n * 30 / 100))]}" "$M/$dir/${files[$((n * 65 / 100))]}" "$M/$dir/${files[$((n - 1))]}"
}
msound() { local name=$1 dur=$2 dir=$3; mapfile -t L < <(mul "$dir"); sound "$name" "$dur" "${L[@]}"; }

msound kick 0.8 KdrumL
msound snare 1.0 Snare1
msound hhClosed 0.5 HihatClosed
msound hhOpen 2.2 HihatOpen
msound tom1 1.4 Tom1
msound tom2 1.5 Tom2
msound tom3 1.6 Tom3
msound tom4 1.8 Tom4
msound crash1 3.2 CrashL
msound crash2 3.2 CrashR
msound china 2.8 China
msound ride1 2.6 RideL
msound bell1 2.6 RideLBell
msound ride2 2.6 RideR
msound bell2 2.6 RideRBell

sound rimshot 1.0 "$V/mid_snare_rimshot_vl1.flac" "$V/mid_snare_rimshot_vl8.flac" "$V/mid_snare_rimshot_vl12.flac"
sound sidestick 0.5 "$V/mid_snare_crossstick_vl2.flac" "$V/mid_snare_crossstick_vl8.flac" "$V/mid_snare_crossstick_vl16.flac"
sound hhPedal 0.6 "$V/mid_hh_pedal_vl1_rr1.flac" "$V/mid_hh_pedal_vl2_rr1.flac" "$V/mid_hh_pedal_vl3_rr1.flac"
sound hhHalf 1.3 "$V/mid_hh_half_vl1_rr1.flac" "$V/mid_hh_half_vl2_rr1.flac" "$V/mid_hh_half_vl4_rr1.flac"
sound hhSplash 1.5 "$V/mid_hh_splash_rr1.flac" "$V/mid_hh_splash_rr1.flac" "$V/mid_hh_splash_rr1.flac"
sound cowbell 0.8 "$V/Cowbell1_Normal_v1_rr1_Mid.wav" "$V/Cowbell1_Normal_v2_rr1_Mid.wav" "$V/Cowbell1_Normal_v3_rr1_Mid.wav"
sound claves 0.4 "$V/Claves1_Hit_v1_rr1_Mid.wav" "$V/Claves1_Hit_v2_rr1_Mid.wav" "$V/Claves1_Hit_v3_rr1_Mid.wav"
sound tambourine 0.8 "$V/Tamb1_Shake_rr1_Mid.wav" "$V/Tamb1_Shake_rr1_Mid.wav" "$V/Tamb1_Shake_rr1_Mid.wav"
sound shaker 0.5 "$V/LShaker_Shake1D_rr1_Mid.wav" "$V/LShaker_Shake1D_rr1_Mid.wav" "$V/LShaker_Shake1D_rr1_Mid.wav"

# a single-strength sound needs only one file
for s in hhSplash tambourine shaker; do mv "$OUT/$s-1.flac" "$OUT/$s.flac"; rm "$OUT/$s-2.flac" "$OUT/$s-3.flac"; done

ls "$OUT"/*.flac | wc -l
du -ch "$OUT"/*.flac | tail -1
