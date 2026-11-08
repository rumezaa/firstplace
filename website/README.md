# Chatterbox website

Static landing page for Chatterbox. Plain HTML, CSS and a little classic JavaScript. No build step.

## View it

Open `website/index.html` in a browser, or serve it:

```
python3 -m http.server -d website
```

Then visit http://localhost:8000.

## Tests

```
node --test 'website/tests/*.test.cjs'
```

## Screenshots

`bash website/tests/shoot.sh` takes headless Chrome screenshots of every section at 375 and 1440 px wide into `website/tests/shots/` (gitignored) and prints a sideways-overflow check for each. It looks for Chrome at `~/.cache/ms-playwright/chromium_headless_shell-1243/...`; set `CHROME=/path/to/chrome-headless-shell` to use another binary.

The shots approximate scroll states (earlier sections are hidden so each anchor can be shot at scroll 0), so a blank strip or shifted header in a 1440 tab shot is a harness artifact, not a site bug.

## Deploy

Point Caddy at the folder on the root domain:

```
example.com {
	root * /path/to/website
	file_server
}
```
