#!/usr/bin/env python3
"""Set the library 3rd floor up for the demo video (dev login only).

    python3 server/scripts/demo_floor.py            # seat 7 students; empty seats show yellow
    python3 server/scripts/demo_floor.py reset      # everyone leaves, lights off
    python3 server/scripts/demo_floor.py --api http://172.20.10.4:8787

TFDL floor 3 (16 tables, needs migrations 150 and 190): 7 students seated,
4 green and 3 red; the other 9 seats are free and show yellow. 354 · Window, the
table with the physical box, is never seated by this script: it's for a real
person on their own phone, so the demo conversation is with someone real.
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
SEATS = [  # (student, table, light). Seated people are green or red; every empty seat shows yellow (free).
    ('priya', T + '03', 'green'),   # 354 · South
    # 354 · Window (T + '01', the physical box) is left free for REAL people:
    # someone sits there from their own phone and you connect with them.
    ('jordan', T + '04', 'red'),    # 352 · Corner
    ('chloe', T + '07', 'green'),   # 351 · North lounge
    ('dev',   T + '09', 'green'),   # 340 · Centre
    ('farid', T + '11', 'red'),     # 330F · Study
    ('hiro',  T + '13', 'green'),   # 368 · Study
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
# Everyone who has ever been seated by this script, so old runs never linger.
ALL_STUDENTS = ['priya', 'wei', 'jordan', 'amara', 'ben', 'chloe', 'dev', 'elena', 'farid', 'grace', 'hiro', 'sam', 'maya']
for name in ['demo'] + ALL_STUDENTS:
    call('POST', '/me/leave-now', token=login(name))

if 'reset' not in sys.argv:
    for name, table, light in SEATS:
        status, body = call('POST', f'/tables/{table}/claim', {'light': light}, token=login(name))
        print(f'{name:7} -> {light:6} {status} {"" if status == 200 else body}')

_, floor = call('GET', f'/venues/{VENUE}/floor')
for t in floor:
    print(f'  {t["label"]:20} {t["light"]}')
