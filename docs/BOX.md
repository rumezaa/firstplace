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
4. **Table.** The config points at the chat table at Seventeenth Social (`e6fae905-bf12-2dfc-e5fe-8a96a63a8955`). Seeded table IDs are stable across `db:setup` resets. Open `/box/<table_id>` in the app's web version to see the same light on screen.

## Quick test

```bash
curl -H "X-Device-Key: <key>" http://<laptop-ip>:8787/hw/tables/<table_id>/state
```

Claim that table in the app, switch between green, yellow and red, and the box should follow within about 2 seconds.

## Before judging

Turn the 10pm rule back on (`app_private.settings` → `box_hours` = `enforce`) unless the demo runs after 10pm.

## Flashing with Aaron's tool

On the laptop the box is plugged into (close any serial monitor first):

```bash
cp server/box.local.json <first-place-embedded>/provisioning.local.json   # then edit ssid + password there
python tools/provision.py provision --port <PORT> --config provisioning.local.json
python tools/provision.py info --port <PORT>                              # shows the stored table id
python tools/provision.py qr --port <PORT> --output artifacts/table-qr.svg
```

On macOS the port looks like `/dev/cu.usbserial-XXXX` (`ls /dev/cu.*`); on Windows it's a `COM` port (Device Manager → Ports). Delete `provisioning.local.json` afterwards.

## If the box doesn't light up

Watch it boot with `idf.py -p <PORT> monitor`. A connected box prints `Wi-Fi ready; polling configured table`, then `Valid state received: <colour>`, and the API log shows `GET /hw/tables/…/state` every 2 seconds.

- **No `Wi-Fi ready` line:** the box can't join the hotspot. iPhone hotspots are named like "Name’s iPhone" with a curly `’`, which is easy to mistype. Rename the phone to something plain (Settings → General → About → Name), turn on **Maximize Compatibility** (the ESP32 only sees 2.4 GHz), keep the Personal Hotspot screen open while the box boots, and re-provision.
- **`Wi-Fi ready` but no requests reach the API:** `base_url` is wrong. The laptop's address can change every time it rejoins the hotspot (`.2` → `.4`), so check `ipconfig getifaddr en0` and re-provision with the new address.
- **`HTTP 401/404/400`:** the device key isn't in `HW_DEVICE_KEYS`, or the table id is wrong.

Responses the box can get: `200` with a colour, `401` wrong device key, `404` unknown table id, `400` malformed id. The last three show as a configuration fault on the box.
