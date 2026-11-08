# End-to-end test of group conversations and the three outcomes (090):
# groups on green and yellow, "half the table ends it", full table reset,
# per-person votes, connections, one-time socials swap, anonymous reports
# that flag a profile, leaving, timer expiry and chatting history.
#
# Run against a fresh seed with the API on :8787, HW_DEVICE_KEYS=local-test-device
# and app_private.settings box_hours = 'ignore' if it's after 10pm in Calgary:
#   python server/tests/group_flow_test.py http://localhost:8787
# DATABASE_URL (server/.env) is used for the two checks the API can't show.

import http.client, json, os, subprocess, sys, time
from urllib.parse import urlparse

B = urlparse(sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8787')
SERVER = os.path.join(os.path.dirname(__file__), '..')
fails = 0
conn = None

def req(m, p, body=None, tok=None, hdr=None):
    """One keep-alive connection for the whole run (cheap on sockets)."""
    global conn
    h = {'Content-Type': 'application/json'}
    if tok: h['Authorization'] = 'Bearer ' + tok
    h.update(hdr or {})
    data = json.dumps(body).encode() if body is not None else None
    for attempt in range(30):
        try:
            if conn is None: conn = http.client.HTTPConnection(B.hostname, B.port or 80, timeout=60)
            conn.request(m, p, body=data, headers=h)
            res = conn.getresponse()
            return res.status, json.loads(res.read() or 'null')
        except (http.client.HTTPException, OSError):
            # Reconnect; on Windows wait out a busy port pool (WinError 10048).
            conn = None
            if attempt == 29: raise
            time.sleep(2)

def ok(cond, msg):
    global fails
    print(('PASS ' if cond else 'FAIL ') + msg)
    if not cond: fails += 1

def sql(q):
    """One query as the database owner (for checks the API deliberately can't do)."""
    js = ("const pg=require('pg');const c=new pg.Client(process.env.DATABASE_URL);"
          "c.connect().then(()=>c.query(process.argv[1])).then(r=>{console.log(JSON.stringify(r.rows));return c.end()})")
    env = dict(os.environ)
    if 'DATABASE_URL' not in env:
        for line in open(os.path.join(SERVER, '.env'), encoding='utf8'):
            if line.startswith('DATABASE_URL='): env['DATABASE_URL'] = line.split('=', 1)[1].strip()
    out = subprocess.run(['node', '-e', js, q], cwd=SERVER, env=env, capture_output=True, text=True, shell=False)
    return json.loads(out.stdout.strip() or '[]')

names = ['sam', 'wei', 'jordan', 'priya', 'maya']
T = {n: req('POST', '/dev/login', {'email': f'{n}@thirdplace.test'})[1]['token'] for n in names}
H = {'X-Device-Key': 'local-test-device'}
light = lambda t: req('GET', f'/hw/tables/{t}/state', hdr=H)[1]['light']
conv = lambda n, cid=None: req('GET', '/me/conversation' + (f'?id={cid}' if cid else ''), tok=T[n])[1]
def member(view, first):
    return next(m for m in view['members'] if m['first_name'] == first)

for n in names: req('POST', '/me/leave-now', tok=T[n])
v2 = 'c0ffee00-0000-4000-8000-000000000002'
t = [x for x in req('GET', f'/venues/{v2}/tables')[1] if x['status'] == 'open'][0]['id']

print('--- A. group on green, half the table ends it, full reset')
ok(light(t) == 'off', 'empty table is off')
req('POST', f'/tables/{t}/claim', {'light': 'green'}, tok=T['sam'])
ok(light(t) == 'green', 'sam claims green')
s, j = req('POST', f'/tables/{t}/join', tok=T['wei']); cid = j.get('conversation_id')
ok(s == 200 and cid, 'wei joins: conversation starts')
ok(light(t) == 'green', 'box stays green so the group can grow')
s, j2 = req('POST', f'/tables/{t}/join', tok=T['priya']); ok(s == 200 and j2['conversation_id'] == cid, 'priya joins the same conversation')
s, j3 = req('POST', f'/tables/{t}/join', tok=T['jordan']); ok(s == 200 and j3['conversation_id'] == cid, 'jordan joins (4 people)')
s, r = req('POST', f'/tables/{t}/join', tok=T['jordan']); ok(s == 400, 'cannot join twice')
c = conv('sam')
ok(len(c['members']) == 4 and c['i_am_host'], f"sam sees 4 members as host: {[m['first_name'] for m in c['members']]}")
ok(all('user_id' not in m for m in c['members']), 'members carry member ids, never user ids')
ok(c['end_votes']['needed'] == 2, 'needs 2 of 4 to end')
s, e = req('POST', '/me/conversation/end', tok=T['sam']); ok(s == 200 and not e['ended'] and e['wanting'] == 1, 'sam taps End: 1 of 2, still going')
s, e = req('POST', '/me/conversation/end', tok=T['wei']); ok(e['ended'], 'wei taps End: half reached, conversation ends')
ok(light(t) == 'off', 'table fully reset: box off')
ok(req('GET', '/me/checkins/open', tok=T['sam'])[1] is None, 'host checked out of the table')

print('--- B. outcomes: hit it off, one-sided, socials swap')
req('PATCH', '/me', {'socials': {'instagram': '@wei.calgary'}}, tok=T['wei'])
s, r = req('PATCH', '/me', {'socials': {'myspace': 'x'}}, tok=T['wei']); ok(s == 400, 'unknown social rejected')
cs, cw, cp = conv('sam', cid), conv('wei', cid), conv('priya', cid)
s, r = req('POST', f"/conversations/{cid}/members/{member(cs, 'Wei')['member_id']}/vote", {'vote': 'good'}, tok=T['sam'])
ok(s == 200 and not r['connected'], 'sam votes good on wei: nothing revealed yet')
s, r = req('POST', f"/conversations/{cid}/members/{member(cw, 'Sam')['member_id']}/vote", {'vote': 'good'}, tok=T['wei'])
ok(r['connected'], 'wei votes good on sam: they hit it off (connection)')
req('POST', f"/conversations/{cid}/members/{member(cs, 'Priya')['member_id']}/vote", {'vote': 'good'}, tok=T['sam'])
s, r = req('POST', f"/conversations/{cid}/members/{member(cp, 'Sam')['member_id']}/vote", {'vote': 'not_for_me'}, tok=T['priya'])
ok(not r['connected'], 'priya says not for me: no connection')
pv = member(conv('sam', cid), 'Priya')
ok(pv['connected'] is False and pv['swap'] == 'can_ask' and 'their_vote' not in pv, "sam can't see priya's vote, can still ask to swap")
ok(member(conv('priya', cid), 'Sam')['swap'] == 'none', 'priya (said no) has no swap option')
s, r = req('POST', f"/conversations/{cid}/members/{pv['member_id']}/swap", tok=T['sam']); ok(r['status'] == 'asked', 'sam asks priya to swap socials')
reqs = req('GET', '/me/swap-requests', tok=T['priya'])[1]; ok(len(reqs) == 1 and reqs[0]['first_name'] == 'Sam', 'priya sees the request')
s, r = req('POST', f"/swaps/{reqs[0]['id']}/respond", {'accept': False}, tok=T['priya']); ok(r['swapped'] is False, 'priya declines')
ok(member(conv('sam', cid), 'Priya')['swap'] == 'asked', 'decline is invisible to sam (still just "asked")')
req('POST', f"/conversations/{cid}/members/{pv['member_id']}/swap", tok=T['sam'])
ok(len(req('GET', '/me/swap-requests', tok=T['priya'])[1]) == 0, 'no second request after a decline')
s, r = req('POST', f"/conversations/{cid}/members/{member(cs, 'Wei')['member_id']}/swap", tok=T['sam']); ok(r['status'] == 'asked', 'sam asks wei to swap')
s, r = req('POST', f"/conversations/{cid}/members/{member(cw, 'Sam')['member_id']}/swap", tok=T['wei']); ok(r['status'] == 'swapped', 'wei asks back: swapped')
contacts = req('GET', '/me/contacts', tok=T['sam'])[1]
ok(any(x['first_name'] == 'Wei' and x['socials'].get('instagram') == '@wei.calgary' for x in contacts), 'sam now sees wei\'s instagram')
ok(not any(x['first_name'] == 'Priya' for x in contacts), "priya's socials stay private")
cj = conv('jordan', cid)
s, r = req('POST', f"/conversations/{cid}/members/{member(cj, 'Sam')['member_id']}/swap", tok=T['jordan']); ok(s == 400 and r['hint'] == 'vote_first', 'must vote good before asking')
hist = req('GET', '/me/history', tok=T['sam'])[1]
ok(len(hist) == 1 and hist[0]['people'] == 4 and hist[0]['end_reason'] == 'ended' and hist[0]['connected_with'] == ['Wei'] and hist[0]['swapped'] == 1,
   f"logged in sam's history: {hist[0] if hist else None}")

print('--- C. leaving, and reports in a group')
req('POST', f'/tables/{t}/claim', {'light': 'green'}, tok=T['maya'])
req('POST', f'/tables/{t}/join', tok=T['jordan'])
s, r = req('POST', '/me/conversation/leave', tok=T['jordan']); ok(r['left'], 'jordan leaves')
ok(light(t) == 'off', 'only one left: conversation over, table reset')
ok(req('GET', '/me/history', tok=T['maya'])[1][0]['end_reason'] == 'everyone_left', 'logged as everyone_left')

req('POST', f'/tables/{t}/claim', {'light': 'green'}, tok=T['sam'])
cid2 = req('POST', f'/tables/{t}/join', tok=T['wei'])[1]['conversation_id']
req('POST', f'/tables/{t}/join', tok=T['priya'])
cp = conv('priya')
s, r = req('POST', f"/conversations/{cid2}/members/{member(cp, 'Wei')['member_id']}/report", {'reason': 'uncomfortable'}, tok=T['priya'])
ok(r.get('reported'), 'priya anonymously reports wei')
ok(conv('priya') is None or conv('priya')['id'] != cid2 or not member(conv('priya', cid2), 'Priya')['here'], 'priya is out of the conversation')
ok(len(conv('sam')['members']) == 3 and light(t) == 'green', 'sam and wei carry on')
flag = sql("select flagged_at is not null as f from public.users where auth0_sub = 'seed|wei@thirdplace.test'")
ok(flag and flag[0]['f'], "wei's profile is flagged for review")
ok(all('reporter' not in json.dumps(x) for x in [conv('wei')]), 'wei is not told who reported')
req('POST', '/me/conversation/end', tok=T['sam'])
ok(light(t) == 'off', 'one of two taps End: over, reset')
req('POST', f'/tables/{t}/claim', {'light': 'green'}, tok=T['sam'])
req('POST', f'/tables/{t}/join', tok=T['wei'])
s, r = req('POST', f'/tables/{t}/join', tok=T['priya']); ok(s == 400 and r['hint'] == 'not_available', 'priya cannot join a group wei is in (silent)')
req('POST', '/me/conversation/end', tok=T['sam'])

print('--- D. yellow: the host lets people into the group, timer, extend')
req('POST', f'/tables/{t}/claim', {'light': 'yellow'}, tok=T['jordan'])
s, rq = req('POST', f'/tables/{t}/request', tok=T['maya'])
s, acc = req('POST', f"/requests/{rq['request_id']}/respond", {'accept': True, 'minutes': 30}, tok=T['jordan']); cid3 = acc['conversation_id']
ok(acc['accepted'] and acc['ends_at'], 'jordan accepts maya: 30 min timer')
ok(light(t) == 'yellow', 'still yellow: more people can ask')
s, rq2 = req('POST', f'/tables/{t}/request', tok=T['sam'])
s, acc2 = req('POST', f"/requests/{rq2['request_id']}/respond", {'accept': True}, tok=T['jordan'])
ok(acc2['conversation_id'] == cid3, 'jordan accepts sam into the same conversation')
st = req('GET', f"/requests/{rq2['request_id']}", tok=T['sam'])[1]; ok(st['status'] == 'accepted' and st['conversation_id'] == cid3, 'sam sees accepted')
ok(len(conv('maya')['members']) == 3, 'three people now')
for n in ['jordan', 'maya']: req('POST', '/me/conversation/extend', {'extend': True}, tok=T[n])
s, r = req('POST', '/me/conversation/extend', {'extend': True}, tok=T['sam']); ok(r['status'] == 'extended', 'everyone extends: +15 min')

print('--- E. timer runs out')
sql(f"update public.conversations set ends_at = now() - interval '5 minutes' where id = '{cid3}'")
n = sql('select app_private.end_expired_conversations() as n')[0]['n']
ok(n == 1 and light(t) == 'off', 'expired conversation ended by the job, table reset')
ok(req('GET', '/me/history', tok=T['maya'])[1][0]['end_reason'] == 'timer', 'logged as timer')

print(f'\n{"ALL PASSED" if fails == 0 else f"{fails} FAILED"}')
sys.exit(1 if fails else 0)
