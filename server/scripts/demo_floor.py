#!/usr/bin/env python3
"""Set the library 3rd floor up for the demo video (dev login only).

    python3 server/scripts/demo_floor.py            # fill the floor (13 lights)
    python3 server/scripts/demo_floor.py reset      # everyone leaves, lights off
    python3 server/scripts/demo_floor.py --api http://172.20.10.4:8787

TFDL floor 3 (16 tables, needs db/migrations/150_tfdl_floor3.sql): 13 students
seated, 4 green / 6 yellow / 3 red, 3 tables off. Priya is green at 354 · Window,
where the physical box sits. The demo account (Alex) stays free to walk in, tap
the tag and join.
"""
import json
import sys
import urllib.error
import urllib.request

API = 'http://localhost:8787'
if '--api' in sys.argv:
    API = sys.argv[sys.argv.index('--api') + 1].rstrip('/')

VENUE = 'c0ffee00-0000-4000-8000-0000000000f3'
T = 'f3f3f3f3-0000-4000-8000-0000000000'
SEATS = [  # (student, table, light). 4 green, 6 yellow, 3 red; 3 tables stay off.
    ('priya', T + '01', 'green'),   # 354 · Window: the physical box
    ('wei',   T + '02', 'yellow'),  # 354 · Centre
    ('jordan', T + '04', 'red'),    # 352 · Corner
    ('amara', T + '05', 'yellow'),  # 352 · Window
    ('ben',   T + '06', 'yellow'),  # 350 · North lounge
    ('chloe', T + '07', 'green'),   # 351 · North lounge
    ('dev',   T + '09', 'green'),   # 340 · Centre
    ('elena', T + '10', 'yellow'),  # 330A · Study
    ('farid', T + '11', 'red'),     # 330F · Study
    ('grace', T + '12', 'yellow'),  # 364 · Study
    ('hiro',  T + '13', 'green'),   # 368 · Study
    ('sam',   T + '14', 'yellow'),  # 310 · Study
    ('maya',  T + '16', 'red'),     # 320 · Study
]


def call(method, path, body=None, token=None):
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            return res.status, json.loads(res.read() or 'null')
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or 'null')


def login(name):
    status, body = call('POST', '/dev/login', {'email': f'{name}@thirdplace.test'})
    if status != 200:
        sys.exit(f'Dev login failed for {name}: {status} {body}')
    return body['token']


# Everyone (including Alex) leaves whatever they hold, so the floor starts clean.
for name in ['demo'] + [s[0] for s in SEATS]:
    call('POST', '/me/leave-now', token=login(name))

if 'reset' not in sys.argv:
    for name, table, light in SEATS:
        status, body = call('POST', f'/tables/{table}/claim', {'light': light}, token=login(name))
        print(f'{name:7} -> {light:6} {status} {"" if status == 200 else body}')

_, floor = call('GET', f'/venues/{VENUE}/floor')
for t in floor:
    print(f'  {t["label"]:20} {t["light"]}')
