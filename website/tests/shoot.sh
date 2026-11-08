#!/usr/bin/env bash
# Screenshots every anchor at phone and desktop widths into website/tests/shots/ (gitignored).
# Shots are taken from a copy of index.html with lazy loading turned off (headless does not
# load lazy images when opened at a #hash). Also prints scrollWidth vs innerWidth per shot.
set -u
cd "$(dirname "$0")/../.."
CHROME="${CHROME:-$HOME/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell}"
OUT=website/tests/shots
mkdir -p "$OUT"
for d in css img js; do [ -e "$OUT/$d" ] || ln -s "../../$d" "$OUT/$d"; done
CHECK='<script>addEventListener("load",function(){setTimeout(function(){document.documentElement.setAttribute("data-ov",document.documentElement.scrollWidth+"\/"+innerWidth)},3000)})<\/script>'
sed -e 's/loading="lazy"/loading="eager"/g' -e "s|</body>|$CHECK</body>|" website/index.html > "$OUT/page.html"
# Headless Chrome paints a blank frame when the page is scrolled before the screenshot, so each
# anchor is shot at scroll 0 with everything before it hidden (and the fixed header's room kept).
hide_for() {
  case "$1" in
    p[1-6]) echo ".story .panel:not(#$1){display:none}" ;;
    legend) echo ".story{display:none}" ;;
    venues|built) echo ".story,#legend{display:none}" ;;
    contact) echo ".story,#legend,#how{display:none}" ;;
  esac
}
for size in 375x812 1440x900; do
  w=${size%x*}; h=${size#*x}
  for a in p1 p2 p3 p4 p5 p6 legend venues built contact; do
    sed "s|</head>|<style>html{scroll-snap-type:none!important}main{padding-top:var(--header-h)}.panel:first-child{margin-top:calc(var(--header-h) * -1)}$(hide_for $a)</style></head>|" "$OUT/page.html" > "$OUT/cur.html"
    hh=$h
    case "$a" in
      venues|built)
        # click the tab after load (a #hash would make tabs.js scroll, which paints blank)
        sed -i "s|</body>|<script>addEventListener('DOMContentLoaded',function(){document.getElementById('tab-$a').click()})</script></body>|" "$OUT/cur.html"
        [ "$w" -lt 800 ] && hh=2000 || hh=1400 ;;
    esac
    url="file://$PWD/$OUT/cur.html"
    "$CHROME" --headless --hide-scrollbars --virtual-time-budget=6000 \
      --screenshot="$OUT/$w-$a.png" --window-size="$w,$hh" "$url" >/dev/null 2>&1
    ov=$("$CHROME" --headless --virtual-time-budget=6000 --dump-dom --window-size="$w,$hh" "$url" 2>/dev/null | grep -o 'data-ov="[0-9/]*"' | head -1)
    echo "$w-$a $ov"
  done
done
rm -f "$OUT/cur.html"
