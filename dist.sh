#!/usr/bin/env bash
set -euo pipefail

num=$1
DIR="$(pwd)"

echo "=== Building TypeScript app ==="
( cd "$DIR/ts" && npm run build )

rm -rf site
mkdir site
cp -r "$DIR/ts/dist/." site

( cd site
  mv circuitjs "circuitjs$num"

  # circuitjs.html (and any other top-level page) hardcodes references like
  # "circuitjs/font/fontello.css" and script src="./circuitjs/...js" pointing
  # at the assets directory by name, since it's a plain static file — fix
  # those up to match the renamed directory. The app's own runtime data
  # fetches (setuplist.txt, circuits/, locale/) don't need this: they're
  # resolved from the actual running script's URL at runtime (see
  # ts/ModuleBase.ts), so they find the renamed directory automatically.
  for f in *.html "circuitjs$num"/*.html; do
    [ -f "$f" ] || continue
    sed -i.bak "s#circuitjs/#circuitjs$num/#g" "$f"
    rm -f "$f.bak"
  done

  # AboutBox.ts's compiled chunk also hardcodes "circuitjs/about.html" as a
  # plain string literal (survives minification), for the same reason.
  for f in "circuitjs$num"/*.js; do
    [ -f "$f" ] || continue
    if grep -q "circuitjs/about.html" "$f"; then
      sed -i.bak "s#circuitjs/about\.html#circuitjs$num/about.html#g" "$f"
      rm -f "$f.bak"
    fi
  done

  # Generate service-worker.js, giving this version its own cache name (old
  # caches are cleaned up in the 'activate' handler) so updates take effect
  # instead of serving a stale cached copy.  It gets two file lists:
  #
  # - the app shell, precached on install: the JS/CSS that circuitjs.html
  #   loads directly (script, modulepreload and stylesheet links), the icon
  #   font, and setuplist.txt.  The font is listed with the exact URL
  #   fontello.css requests, query string and all, so the cache key matches.
  # - every file in the versioned directory, downloaded in the background
  #   for installed apps.  Skip dotfiles (.DS_Store) and stray scripts the
  #   web server won't serve.
  { grep -o "\(src\|href\)=\"\(\./\)\{0,1\}circuitjs$num/[^\"]*\"" circuitjs.html |
      sed -e 's/^[a-z]*="//' -e 's#^\./##' -e 's/"$//'
    grep -o "fontello\.woff2[^')]*" "circuitjs$num/font/fontello.css" | head -1 |
      sed "s#^#circuitjs$num/font/#"
    echo "circuitjs$num/setuplist.txt"
  } | sed "s/.*/  '&',/" > shelllist.$$
  find "circuitjs$num" -type f ! -name '.*' ! -name '*.py' -print | sed "s/.*/  '&',/" > filelist.$$
  sed -e "/^SHELL_FILES_GO_HERE$/{
    r shelllist.$$
    d
}" -e "/^FILE_LIST_GOES_HERE$/{
    r filelist.$$
    d
}" "$DIR/ts/service-worker.template.js" | sed "s/VERSION_PLACEHOLDER/$num/" > service-worker.js
  rm -f shelllist.$$ filelist.$$

  # circuitjs.html is the versioned entry point too, so it gets the same
  # per-version name as its assets directory. Fix up
  # service-worker.js's own cached file list. (JS
  # chunks are deliberately NOT touched here: ExportAsUrlDialog hardcodes
  # the canonical https://www.falstad.com/circuit/circuitjs.html for
  # Electron's share-URL fallback, which should always point at "latest",
  # not this specific version.)
  for f in service-worker.js; do
    [ -f "$f" ] || continue
    sed -i.bak "s#circuitjs\.html#circuitjs$num.html#g" "$f"
    rm -f "$f.bak"
  done
  cp circuitjs.html "circuitjs$num.html"
)

echo "=== Done: site/circuitjs$num (entry: site/circuitjs$num.html) ==="
