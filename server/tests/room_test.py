# Entrance tag: venue check-in ("I'm here"), the room summary (counts only),
# and green tables showing shared interests (by consent, never who).
# Run against a fresh seed: python3 server/tests/room_test.py http://localhost:8787
# Seed: Sam, Priya and Wei hold yellow tables at Kensington Coffee Co.

import json, urllib.request as u, sys
B=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:8787'
def req(m,p,body=None,tok=None):
    h={'Content-Type':'application/json'}
    if tok: h['Authorization']='Bearer '+tok
    r=u.Request(B+p,data=json.dumps(body).encode() if body is not None else None,headers=h,method=m)
    try:
        with u.urlopen(r,timeout=60) as res: return res.status,json.loads(res.read() or 'null')
    except u.HTTPError as e: return e.code,json.loads(e.read() or 'null')
fails=0
def ok(c,m):
    global fails
    fails+=0 if c else 1
    print(('PASS ' if c else 'FAIL ')+m)
T={n:req('POST','/dev/login',{'email':f'{n}@thirdplace.test'})[1]['token'] for n in ['demo','sam','wei','priya']}
v1='c0ffee00-0000-4000-8000-000000000001'  # Kensington: Sam, Priya, Wei seated
v2='c0ffee00-0000-4000-8000-000000000002'
room=lambda v,tok=None: req('GET',f'/venues/{v}/room',tok=tok)[1]
req('POST','/me/leave-now',tok=T['demo'])

# ------------------------------------------------------------ check in -----
r=room(v1); ok(r['people_here']==3 and r['open_to_talk']==3 and not r['here'] and r['like_you'] is None, f'signed out: counts only {r}')
s,_=req('POST',f'/venues/{v1}/enter'); ok(s==401,'entering needs a login')
s,r=req('POST',f'/venues/{v1}/enter',tok=T['demo']); ok(s==200 and r['new'] and r['table_id'] is None, f'demo taps the entrance: checked in, no table {r}')
s,r=req('POST',f'/venues/{v1}/enter',tok=T['demo']); ok(s==200 and not r['new'],'tapping again changes nothing')
r=room(v1,T['demo']); ok(r['people_here']==4 and r['here'] and r['open_to_talk']==3, f'room counts demo, not as open to talk {r}')
# Demo shares hiking with Sam, Priya and Wei; board games with Sam and Wei.
ok(r['like_you']=={'interest':'hiking','people':3}, f"most shared interest: {r['like_you']}")
ok('name' not in json.dumps(r) and 'user' not in json.dumps(r),'room never names anyone')

# ------------------------------------------------ green: by consent only --
ok(room(v1,T['demo'])['green']==[],'all yellow: no table shows anything')
sam_table=req('GET','/me/checkins/open',tok=T['sam'])[1]['table_id']
req('POST','/me/light',{'light':'green'},tok=T['sam'])
g=room(v1,T['demo'])['green']
ok(len(g)==1 and g[0]['table_id']==sam_table and set(g[0]['interests'])=={'hiking','board games'}, f'Sam on green: his table and what we share {g}')
ok(set(g[0])=={'table_id','interests'},'green entry carries no name or profile')
ok(room(v1)['green']==[],'signed out: no shared interests')
ok(room(v1,T['sam'])['green']==[],'never your own table')
g=room(v1,T['priya'])['green']; ok(len(g)==1 and g[0]['interests']==['hiking'], f'each person sees only their own overlap {g}')
req('PATCH','/me',{'share_overlap':False},tok=T['sam'])
ok(room(v1,T['demo'])['green']==[],'Sam turns off "Show what we have in common": nothing shown')
req('PATCH','/me',{'share_overlap':True},tok=T['sam'])
req('POST','/me/light',{'light':'red'},tok=T['sam'])
ok(room(v1,T['demo'])['green']==[],'red: invisible beyond the counts')
req('POST','/me/light',{'light':'green'},tok=T['sam'])

# ------------------------------------------ table claims and other venues --
tables=req('GET',f'/venues/{v1}/tables')[1]; free=[x for x in tables if x['status']=='open'][0]['id']
s,_=req('POST',f'/tables/{free}/claim',{'light':'green'},tok=T['demo']); ok(s==200,'demo claims a table from the floor')
s,r=req('POST',f'/venues/{v1}/enter',tok=T['demo']); ok(not r['new'] and r['table_id']==free,'entrance tap keeps the table claim')
ok(room(v1)['people_here']==4 and room(v1)['open_to_talk']==4,'still one person, now open to talk')
s,r=req('POST',f'/venues/{v2}/enter',tok=T['demo']); ok(r['new'],'entering another venue moves you there')
ok(room(v1)['people_here']==3 and req('GET',f'/tables/{free}/view')[1]['light']=='off','old venue drops you and frees your table')
ok(room(v1,T['demo'])['green']==[],'not in the room: green tables show nothing')

# --------------------------------------------- "like you" never singles out --
req('POST','/me/leave-now',tok=T['sam'])
t2=[x for x in req('GET',f'/venues/{v2}/tables')[1] if x['status']=='open'][0]['id']
req('POST',f'/tables/{t2}/claim',{},tok=T['sam'])
r=room(v2,T['demo']); ok(r['people_here']==2 and r['like_you'] is None, f'one person sharing an interest is not shown {r}')

# ---------------------------------------------------------------- inputs ---
s,_=req('GET','/venues/not-a-uuid/room'); ok(s==400,'malformed venue id -> 400')
s,r=req('POST','/venues/00000000-0000-4000-8000-000000000000/enter',tok=T['demo']); ok(s==400 and r.get('hint')=='venue_not_found','unknown venue -> venue_not_found')

for n in T: req('POST','/me/leave-now',tok=T[n])
sys.exit(1 if fails else 0)
