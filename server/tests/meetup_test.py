# End-to-end test of the meetup planner: open, both sides pick times, the
# overlap stays private until both have answered, a weather-aware plan is
# built, and it only confirms on a mutual yes.
# Run against a fresh seed (python3 server/tests/meetup_test.py http://localhost:8787).

import json, urllib.request as u, sys, datetime as dt
B = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8787'

def req(m, p, body=None, tok=None):
    h = {'Content-Type': 'application/json'}
    if tok: h['Authorization'] = 'Bearer ' + tok
    r = u.Request(B + p, data=json.dumps(body).encode() if body is not None else None, headers=h, method=m)
    try:
        with u.urlopen(r, timeout=60) as res: return res.status, json.loads(res.read() or 'null')
    except u.HTTPError as e: return e.code, json.loads(e.read() or 'null')

fails = []
def ok(cond, msg):
    print(('PASS ' if cond else 'FAIL ') + msg)
    if not cond: fails.append(msg)

T = {n: req('POST', '/dev/login', {'email': f'{n}@thirdplace.test'})[1]['token']
     for n in ['demo', 'wei', 'sam']}
ALEX, WEI, SAM = T['demo'], T['wei'], T['sam']

# Days are relative so the test keeps working next week.
today = dt.date.fromisoformat(req('GET', '/forecast?days=2', tok=ALEX)[1]['windows'][0]['day'])
d = lambda n: (today + dt.timedelta(days=n)).isoformat()
slot = lambda n, part: {'day': d(n), 'part': part}

# ----------------------------------------------------------------- forecast --
s, fc = req('GET', '/forecast?days=8', tok=ALEX)
ok(s == 200 and len(fc['windows']) >= 20, f"forecast: {len(fc.get('windows', []))} windows over 8 days")
w0 = fc['windows'][0]
ok(all(k in w0 for k in ('outdoorScore', 'headline', 'feelsLikeC', 'precipProb')),
   f"window shape: {w0['day']} {w0['part']} -> {w0['headline']!r} outdoor={w0['outdoorScore']}")
ok(all(0 <= w['outdoorScore'] <= 1 for w in fc['windows']), 'every outdoorScore in 0..1')

# --------------------------------------------------------------- connection --
cons = req('GET', '/me/connections', tok=ALEX)[1]
ok(any(c['first_name'] == 'Wei' for c in cons), f"alex is connected to wei: {[c['first_name'] for c in cons]}")
conn = next(c for c in cons if c['first_name'] == 'Wei')

s, m = req('POST', f"/connections/{conn['id']}/meetup", tok=ALEX)
ok(s == 200 and m.get('meetup_id'), f'alex opens a plan: {m}')
MID = m['meetup_id']
ok(req('POST', f"/connections/{conn['id']}/meetup", tok=WEI)[1]['meetup_id'] == MID,
   'wei opening the same connection resumes the same plan')

s, r = req('POST', f"/connections/{conn['id']}/meetup", tok=SAM)
ok(s == 400 and r.get('hint') == 'meetup_not_your_connection', f"a stranger cannot open it: {r}")
ok(req('GET', f'/meetups/{MID}', tok=SAM)[0] == 400, 'a stranger cannot read the plan')

# -------------------------------------------------------- the handshake -----
s, v = req('GET', f'/meetups/{MID}', tok=ALEX)
ok(s == 200 and v['overlap']['waiting_on'] == 'you', f"nothing picked yet -> waiting on you: {v['overlap']}")
ok(v['their_first_name'] == 'Wei' and v['met_at']['name'] == 'Ninth & Ink',
   f"context: with {v['their_first_name']} who you met at {v['met_at']['name']}")
ok(sorted(v['shared']['interests']) == ['board games', 'hiking'],
   f"shared interests are the intersection only: {v['shared']['interests']}")
ok(len(v['forecast']) >= 20, f"the picker gets the forecast too: {len(v['forecast'])} windows")

s, r = req('POST', f'/meetups/{MID}/plan', tok=ALEX)
ok(s == 409, f'cannot plan before anyone has picked times: {r}')

# Alex includes one day beyond the 14-day horizon: it must be dropped, not fatal.
s, r = req('POST', f'/meetups/{MID}/availability',
           {'slots': [slot(2, 'morning'), slot(2, 'afternoon'), slot(4, 'afternoon'),
                      slot(5, 'evening'), slot(40, 'morning')]}, tok=ALEX)
ok(s == 200 and r['saved'] == 4, f'alex saves 4 of 5 windows (one past the horizon): {r}')

s, r = req('POST', f'/meetups/{MID}/availability', {'slots': [{'day': 'next tuesday', 'part': 'morning'}]}, tok=ALEX)
ok(s == 400, f'a malformed day is rejected: {r}')
s, r = req('POST', f'/meetups/{MID}/availability', {'slots': [slot(2, 'lunchtime')]}, tok=ALEX)
ok(s == 400, f'an unknown part of day is rejected: {r}')

ov = req('GET', f'/meetups/{MID}/overlap', tok=ALEX)[1]
ok(ov['waiting_on'] == 'them' and ov['windows'] == [] and ov['mine'] == 4,
   f"PRIVACY: alex learns nothing about wei's week, only that he has not answered: {ov}")
ov_w = req('GET', f'/meetups/{MID}/overlap', tok=WEI)[1]
ok(ov_w['waiting_on'] == 'you' and ov_w['windows'] == [] and ov_w['mine'] == 0,
   f"PRIVACY: and wei cannot see alex's four windows either: {ov_w}")

s, r = req('POST', f'/meetups/{MID}/plan', tok=ALEX)
ok(s == 409 and 'them' in r['error'], f'still cannot plan with one side missing: {r}')

s, r = req('POST', f'/meetups/{MID}/availability',
           {'slots': [slot(2, 'afternoon'), slot(4, 'afternoon'), slot(6, 'morning')]}, tok=WEI)
ok(s == 200 and r['saved'] == 3, f'wei saves 3 windows: {r}')

ov = req('GET', f'/meetups/{MID}/overlap', tok=ALEX)[1]
want = [{'day': d(2), 'part': 'afternoon'}, {'day': d(4), 'part': 'afternoon'}]
ok(ov['ready'] and ov['windows'] == want, f'the overlap is the INTERSECTION, not the union: {ov["windows"]}')
ok(req('GET', f'/meetups/{MID}/overlap', tok=WEI)[1]['windows'] == want, 'both sides see the same overlap')

# ---------------------------------------------------------------- the plan --
s, res = req('POST', f'/meetups/{MID}/plan', tok=ALEX)
ok(s == 200 and res['status'] == 'proposed', f'plan built: {s}')
P = res['plan']
print(f"\n  --> {P['idea']['title']}  ({P['when']}, {P['idea']['exposure']}, {P['idea']['cost']})")
print(f"      {P['idea']['blurb']}")
print(f"      weather: {P['weather']['headline'] if P['weather'] else 'n/a'} (outdoor {P['weather']['outdoorScore'] if P['weather'] else '-'})")
for line in P['why']: print(f"      why: {line}")
if P['backup']: print(f"      backup: {P['backup']['title']} — {P['backup']['reason']}")
print(f"      alternatives: {[a['title'] for a in P['alternatives']]}")
print(f"      invitation: {P['invitation']!r}\n")

ok({'day': P['day'], 'part': P['part']} in want, f"the plan is inside the overlap: {P['day']} {P['part']}")
ok(P['sharedInterests'] and set(P['sharedInterests']) <= {'board games', 'hiking'},
   f"justified only by shared interests: {P['sharedInterests']}")
ok(P['weatherSource'] == 'open-meteo' and P['weather'], 'the plan carries the real forecast')
ok(len(P['why']) >= 2, f"it explains itself: {len(P['why'])} reasons")
ok(len(P['alternatives']) == 2, 'two alternatives offered')
ok((P['idea']['exposure'] == 'indoor') == (P['backup'] is None),
   f"a backup exists exactly when the plan is weather-exposed ({P['idea']['exposure']})")
ok(P['venue'] is not None or P['area'] is not None, 'the plan names somewhere to go')

s, r = req('POST', f'/meetups/{MID}/availability', {'slots': [slot(3, 'morning')]}, tok=WEI)
ok(s == 400 and r.get('hint') == 'meetup_not_collecting', f'times are locked once a plan is on the table: {r}')

# ----------------------------------------------------------------- the yes --
s, r = req('POST', f'/meetups/{MID}/respond', {'accept': True}, tok=ALEX)
ok(s == 200 and r['status'] == 'proposed' and r['waiting_on'] == 'them', f'one yes is not enough: {r}')
mine = next(m for m in req('GET', '/me/meetups', tok=WEI)[1] if m['id'] == MID)
ok(mine['status'] == 'proposed' and mine['they_accepted'] and not mine['i_accepted'],
   f"wei sees alex has said yes and he has not: {mine['status']}")
s, r = req('POST', f'/meetups/{MID}/respond', {'accept': True}, tok=WEI)
ok(s == 200 and r['status'] == 'confirmed', f'both yes -> confirmed: {r}')
for who, tok in (('alex', ALEX), ('wei', WEI)):
    row = next(m for m in req('GET', '/me/meetups', tok=tok)[1] if m['id'] == MID)
    ok(row['status'] == 'confirmed' and row['plan']['idea']['title'] == P['idea']['title'],
       f"{who} has the confirmed plan: {row['plan']['idea']['title']}")

# -------------------------------------------------------------- the no -----
s, m2 = req('POST', f"/connections/{conn['id']}/meetup", tok=WEI)
ok(s == 200 and m2['meetup_id'] != MID, 'a confirmed plan does not block arranging another')
M2 = m2['meetup_id']
req('POST', f'/meetups/{M2}/availability', {'slots': [slot(3, 'evening'), slot(5, 'afternoon')]}, tok=WEI)
req('POST', f'/meetups/{M2}/availability', {'slots': [slot(3, 'evening')]}, tok=ALEX)
s, res2 = req('POST', f'/meetups/{M2}/plan', tok=WEI)
ok(s == 200 and res2['plan']['part'] == 'evening' and res2['plan']['day'] == d(3),
   f"second plan lands on the one shared window: {res2['plan']['when']}")
s, r = req('POST', f'/meetups/{M2}/respond', {'accept': False}, tok=ALEX)
ok(s == 200 and r['status'] == 'declined', f'a no settles it: {r}')
s, r = req('POST', f'/meetups/{M2}/respond', {'accept': True}, tok=WEI)
ok(s == 400 and r.get('hint') == 'meetup_not_proposed', f'and cannot be reopened by the other side: {r}')

# --------------------------------------------------------------- no overlap --
s, m3 = req('POST', f"/connections/{conn['id']}/meetup", tok=ALEX)
M3 = m3['meetup_id']
req('POST', f'/meetups/{M3}/availability', {'slots': [slot(2, 'morning')]}, tok=ALEX)
req('POST', f'/meetups/{M3}/availability', {'slots': [slot(6, 'evening')]}, tok=WEI)
ov = req('GET', f'/meetups/{M3}/overlap', tok=ALEX)[1]
ok(not ov['ready'] and ov['waiting_on'] == 'no_overlap', f'no shared window is its own state: {ov}')
s, r = req('POST', f'/meetups/{M3}/plan', tok=ALEX)
ok(s == 409 and 'line up' in r['error'], f'and it asks for more times rather than guessing: {r}')
req('POST', f'/meetups/{M3}/cancel', tok=ALEX)
ok(next(m for m in req('GET', '/me/meetups', tok=ALEX)[1] if m['id'] == M3)['status'] == 'declined',
   'cancel clears it out of the way')

print(f"\n{'ALL PASS' if not fails else str(len(fails)) + ' FAILED: ' + '; '.join(fails)}")
sys.exit(1 if fails else 0)
