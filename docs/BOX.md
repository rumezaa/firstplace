# Connecting the First Place box

Aaron's firmware ([AArellano101/first-place-embedded](https://github.com/AArellano101/first-place-embedded)) already speaks this API. This page is the checklist for wiring it to our server.

## The contract

```
GET {base_url}/hw/tables/{table_id}/state
X-Device-Key: {device_key}

200 → { "light": "off" | "green" | "yellow" | "red", "at": "<ISO time>", "pollMs": 2000 }
401 → unknown device key        404 → no such table
```

- The server decides the colour (`public.table_light()`), and it fails closed: off when nobody has claimed the table, the box is switched off, or it's after 10pm. Red while a conversation runs.
- The box polls every `pollMs` and shows exactly what it gets. No answer for about 10 seconds means the no-signal pattern, never an old green or yellow.
- The response never contains names or who is sitting there.

## Setup for the demo

1. **Config.** `server/box.local.json` (gitignored) holds the box's `base_url`, `table_id` and `device_key`. Send it to Aaron privately, not in the group chat. Fill in the Wi-Fi name and password on his laptop only.
2. **Key.** The same key is listed in `HW_DEVICE_KEYS` in `server/.env`. To revoke a box, remove its key and restart the server.
3. **Network.** Put the box and the laptop running the API on the same phone hotspot (2.4 GHz). Venue Wi-Fi often blocks devices from reaching each other. `base_url` is the laptop's address on that network, port 8787: get it with `ipconfig getifaddr en0` and update the file if it changes.
4. **Table.** The config points at the chat table at Seventeenth Social. Open `/box/<table_id>` in the app's web version to see the same light on screen.

## Quick test

```bash
curl -H "X-Device-Key: <key>" http://<laptop-ip>:8787/hw/tables/<table_id>/state
```

Claim that table in the app, switch between green, yellow and red, and the box should follow within about 2 seconds.

## Before judging

Turn the 10pm rule back on (`app_private.settings` → `box_hours` = `enforce`) unless the demo runs after 10pm.
