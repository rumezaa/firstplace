#!/usr/bin/env python3
"""Onboarding fields (migration 220): validation, the onboarded flag, and that
gender NEVER leaves GET /me for its owner.

Run on a freshly seeded DISPOSABLE database:
    python3 server/tests/onboarding_test.py http://localhost:8788

Wei records a gender with a unique self-description (a marker word). Priya then
sits next to Wei, talks with Wei, connects, and reads every endpoint she can, and
so does a signed-out visitor. The marker and the word "gender" must never appear.
"""
import json
import sys
import urllib.error
import urllib.request

B = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8788'
FLOOR = 'c0ffee00-0000-4000-8000-0000000000f3'
VENUE = 'c0ffee00-0000-4000-8000-000000000001'
WIN = 'f3f3f3f3-0000-4000-8000-000000000001'
MARKER = 'zqxmarker'
fails = 0


def req(m, p, body=None, tok=None, key=None):
    h = {'Content-Type': 'application/json'}
    if tok:
        h['Authorization'] = 'Bearer ' + tok
    if key:
        h['X-Device-Key'] = key
    r = urllib.request.Request(B + p, data=json.dumps(body).encode() if body is not None else None, headers=h, method=m)
    try:
        with urllib.request.urlopen(r, timeout=30) as res:
            return res.status, res.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def ok(cond, label):
    global fails
    fails += not cond
    print(('PASS ' if cond else 'FAIL ') + label)


T = {n: json.loads(req('POST', '/dev/login', {'email': f'{n}@thirdplace.test'})[1])['token'] for n in ['wei', 'priya']}
for t in T.values():
    req('POST', '/me/leave-now', tok=t)

# ------------------------------------------------------------ validation --
ok(req('PATCH', '/me', {'gender': 'robot'}, T['wei'])[0] == 400, 'unknown gender is rejected')
ok(req('PATCH', '/me', {'gender': 'man', 'gender_self_describe': 'x'}, T['wei'])[0] == 400, 'self-description only with "self-describe"')
ok(req('PATCH', '/me', {'gender': 'self_describe', 'gender_self_describe': 'x' * 41}, T['wei'])[0] == 400, 'self-description max 40 characters')
ok(req('PATCH', '/me', {'onboarded': False}, T['wei'])[0] == 400, 'onboarded can only be set to true')

s, body = req('PATCH', '/me', {'gender': 'self_describe', 'gender_self_describe': MARKER}, T['wei'])
ok(s == 200 and MARKER in body, 'Wei saves a self-description')
me = json.loads(req('GET', '/me', tok=T['wei'])[1])
ok(me.get('gender') == 'self_describe' and me.get('gender_self_describe') == MARKER, 'GET /me returns it to Wei (the owner)')

s, body = req('PATCH', '/me', {'gender': 'woman'}, T['wei'])
ok(json.loads(body).get('gender_self_describe') is None, 'switching away from self-describe clears the text')
req('PATCH', '/me', {'gender': 'self_describe', 'gender_self_describe': MARKER}, T['wei'])

s, body = req('PATCH', '/me', {'onboarded': True}, T['priya'])
ok(s == 200 and json.loads(body).get('onboarded_at'), 'onboarded: true sets onboarded_at')

# ------------------------------------------- crawl as Priya and signed out --
req('POST', f'/tables/{WIN}/claim', {'light': 'green'}, T['wei'])
req('POST', f'/venues/{FLOOR}/enter', tok=T['priya'])
seen = []


def crawl(label, tok=None):
    paths = [
        f'/venues', f'/venues/live', f'/venues/{FLOOR}', f'/venues/{FLOOR}/floor', f'/venues/{FLOOR}/room',
        f'/venues/{FLOOR}/tables', f'/venues/{VENUE}/crowd', f'/venues/{VENUE}/busy-hours', f'/venues/{FLOOR}/vibe',
        f'/tables/{WIN}/view', f'/dashboard/{VENUE}',
    ]
    if tok:
        paths += ['/me/requests', '/me/conversation', '/me/conversation/topics', '/me/connections',
                  '/me/familiar-faces', '/me/meetups', '/me/checkins']
    for p in paths:
        s, body = req('GET', p, tok=tok)
        seen.append((label, p, s))
        if MARKER in body or '"gender' in body:
            ok(False, f'{label} {p} leaked gender')
    hw = req('GET', f'/hw/tables/{WIN}/state', key='local-test-device')[1]
    if MARKER in hw or 'gender' in hw:
        ok(False, f'{label} box endpoint leaked gender')


crawl('signed out')
crawl('Priya in the room', T['priya'])
s, j = req('POST', f'/tables/{WIN}/join', tok=T['priya'])
crawl('Priya mid-conversation', T['priya'])
conv = json.loads(req('GET', '/me/conversation', tok=T['priya'])[1])
for t in T.values():
    req('POST', f"/conversations/{conv['id']}/vote", {'vote': 'good'}, t)
crawl('Priya after connecting', T['priya'])
ok(fails == 0, f'gender never appeared in {len(seen)} responses to anyone but Wei')

for t in T.values():
    req('POST', '/me/leave-now', tok=t)
print('\nALL PASS' if not fails else f'\n{fails} FAILED')
sys.exit(1 if fails else 0)
