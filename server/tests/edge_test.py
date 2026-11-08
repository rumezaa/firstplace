#!/usr/bin/env python3
"""Edge cases from docs/REVIEW_BRIEF.md not covered by flow/meetup/review tests.

Run on a freshly seeded DISPOSABLE database (it flips box_hours):
    python3 server/tests/edge_test.py http://localhost:8788
Needs `docker exec firstplace-db psql` for the 10pm check; skipped otherwise.
"""
import json
import subprocess
import sys
import urllib.error
import urllib.request

B = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8788'
DB = sys.argv[2] if len(sys.argv) > 2 else 'firstplace_test'
FLOOR = 'c0ffee00-0000-4000-8000-0000000000f3'
WIN, CEN, STK = (f'f3f3f3f3-0000-4000-8000-00000000000{i}' for i in (1, 2, 3))
KEY = 'local-test-device'
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
            return res.status, json.loads(res.read() or 'null')
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or 'null')


def ok(cond, label):
    global fails
    fails += not cond
    print(('PASS ' if cond else 'FAIL ') + label)


def sql(q):
    return subprocess.run(['docker', 'exec', 'firstplace-db', 'psql', '-U', 'postgres', '-d', DB, '-qtAc', q],
                          capture_output=True, text=True)


T = {n: req('POST', '/dev/login', {'email': f'{n}@thirdplace.test'})[1]['token'] for n in ['demo', 'priya', 'wei', 'jordan']}
for t in T.values():
    req('POST', '/me/leave-now', tok=t)
light = lambda t: req('GET', f'/hw/tables/{t}/state', key=KEY)[1]['light']

# ---------------------------------------------------------------- floor ---
s, fl = req('GET', f'/venues/{FLOOR}/floor')
ok(s == 200 and len(fl) == 16 and all(t['light'] == 'off' for t in fl), 'signed-out floor: all 16 tables, all off')
ok(all(set(t) == {'id', 'label', 'seats', 'is_chat_table', 'box_enabled', 'light', 'mine', 'pos_x', 'pos_y'} for t in fl),
   'floor never exposes who sits where (only colour fields)')
s, fl = req('GET', '/venues/00000000-0000-4000-8000-000000000000/floor')
ok(s == 200 and fl == [], 'unknown floor is an empty list, not an error')

req('POST', f'/tables/{WIN}/claim', {'light': 'green'}, T['priya'])
mine = {t['label']: t['mine'] for t in req('GET', f'/venues/{FLOOR}/floor', tok=T['priya'])[1]}
other = {t['label']: t['mine'] for t in req('GET', f'/venues/{FLOOR}/floor', tok=T['wei'])[1]}
ok(mine['354 · Window'] and not other['354 · Window'], '"mine" is true only for the person holding the table')
ok(light(WIN) == 'green', 'floor claim shows on the box')

# ------------------------------------------------------- signed out ------
ok(req('POST', f'/tables/{CEN}/claim', {'light': 'green'})[0] == 401, 'claim while signed out is 401')
ok(req('POST', '/me/light', {'light': 'green'})[0] == 401, 'changing light while signed out is 401')
ok(req('POST', f'/tables/{WIN}/request')[0] == 401, 'request while signed out is 401')

# ---------------------------------------------------- own / two tables ---
s, r = req('POST', f'/tables/{WIN}/request', tok=T['priya'])
ok(s == 400, f'cannot request a chat at your own table ({s} {r})')
s, r = req('POST', f'/tables/{WIN}/join', tok=T['priya'])
ok(s == 400, f'cannot join your own green table ({s} {r})')
s, r = req('POST', f'/tables/{CEN}/claim', {'light': 'yellow'}, T['priya'])
held = [t['label'] for t in req('GET', f'/venues/{FLOOR}/floor', tok=T['priya'])[1] if t['mine']]
ok(len(held) == 1, f'claiming a second table never leaves you holding two ({s}, holding {held})')
req('POST', '/me/leave-now', tok=T['priya'])
req('POST', f'/tables/{WIN}/claim', {'light': 'green'}, T['priya'])

s, r = req('POST', f'/tables/{WIN}/claim', {'light': 'red'}, T['wei'])
ok(s == 400 and light(WIN) == 'green', 'someone else cannot take a held table')
ok(req('POST', '/me/light', {'light': 'purple'}, T['priya'])[0] == 400 and light(WIN) == 'green',
   'invalid colour is rejected and the light is unchanged')

# ----------------------------------------------------------- blocking ----
# Blocking happens from inside a conversation: Alex joins Priya on green, blocks.
s, r = req('POST', f'/tables/{WIN}/join', tok=T['demo'])
conv = r.get('conversation_id') if isinstance(r, dict) else None
s, r = req('POST', f'/conversations/{conv}/block', tok=T['demo'])
ok(s == 200, f'block from inside a conversation ({s} {r})')
for n in ('demo', 'priya'):
    req('POST', '/me/leave-now', tok=T[n])
req('POST', f'/tables/{WIN}/claim', {'light': 'green'}, T['priya'])
s, r = req('POST', f'/tables/{WIN}/join', tok=T['demo'])
ok(s == 400 and r.get('hint') == 'not_available', 'blocked pair: joining on green looks like "not available"')
req('POST', '/me/light', {'light': 'yellow'}, T['priya'])
s, r = req('POST', f'/tables/{WIN}/request', tok=T['demo'])
ok(s == 400 and r.get('hint') == 'not_available', 'blocked pair: request looks exactly like "not available"')
req('POST', '/me/light', {'light': 'green'}, T['priya'])

# ------------------------------------------------------------ 10pm rule --
if sql("select 1").returncode == 0:
    sql("update app_private.settings set value='enforce' where key='box_hours'")
    at_night = sql("select extract(hour from now() at time zone 'America/Edmonton') not between 6 and 21").stdout.strip()
    ok(light(WIN) == ('off' if at_night == 't' else 'green'), f'box_hours=enforce: after 10pm the box is off (night={at_night})')
    sql("update app_private.settings set value='ignore' where key='box_hours'")
else:
    print('SKIP 10pm rule (no docker access to the test database)')

# ------------------------------------------------------------- profile ---
ok(req('PATCH', '/me', {'age_range': '16-17'}, T['wei'])[0] == 400, 'under-18 age range is rejected')
ok(req('PATCH', '/me', {'name': ''}, T['wei'])[0] == 400, 'empty name is rejected')
ok(req('PATCH', '/me', {'interests': ['x'] * 31}, T['wei'])[0] == 400, 'more than 30 interests is rejected')

# ------------------------------------------------ "Show what we have in common"
for t in T.values():
    req('POST', '/me/leave-now', tok=t)
req('POST', f'/tables/{CEN}/claim', {'light': 'green'}, T['wei'])
req('POST', f'/tables/{CEN}/join', tok=T['priya'])
on = req('GET', '/me/conversation/topics', tok=T['priya'])[1]
ok(any(on['shared'].values()), f"sharing on: the pair sees their overlap ({on['shared']})")
for t in (T['wei'], T['priya']):
    req('POST', '/me/leave-now', tok=t)
ok(req('PATCH', '/me', {'share_overlap': 'no'}, T['wei'])[0] == 400, 'share_overlap must be true/false')
ok(req('PATCH', '/me', {'share_overlap': False}, T['wei'])[0] == 200, 'Wei switches sharing off')
req('POST', f'/tables/{CEN}/claim', {'light': 'green'}, T['wei'])
req('POST', f'/tables/{CEN}/join', tok=T['priya'])
off = req('GET', '/me/conversation/topics', tok=T['priya'])[1]
ok(not any(off['shared'].values()), "one person off: the OTHER person sees nothing shared either")
ok(off['generated'] is False and off['prompts'], 'one person off: nothing goes to Gemini, generic prompts instead')
req('PATCH', '/me', {'share_overlap': True}, T['wei'])

for t in T.values():
    req('POST', '/me/leave-now', tok=t)
ok(all(light(t) == 'off' for t in (WIN, CEN, STK)), 'everyone left: the whole floor is off')
print('\nALL PASS' if not fails else f'\n{fails} FAILED')
sys.exit(1 if fails else 0)
