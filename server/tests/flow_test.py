# End-to-end test of the PRD loop: claim, light, request, accept/decline,
# conversation, topics, private vote, connection, report/block, leave now.
# Run against a fresh seed (python3 server/tests/flow_test.py http://localhost:8787).
# Not idempotent: the 24h decline cooldown persists, so re-seed before re-running.

import json, urllib.request as u, sys
B=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:8788'
def req(m,p,body=None,tok=None,hdr=None):
    h={'Content-Type':'application/json'}; 
    if tok: h['Authorization']='Bearer '+tok
    h.update(hdr or {})
    r=u.Request(B+p,data=json.dumps(body).encode() if body is not None else None,headers=h,method=m)
    try:
        with u.urlopen(r,timeout=60) as res: return res.status,json.loads(res.read() or 'null')
    except u.HTTPError as e: return e.code,json.loads(e.read() or 'null')
ok=lambda c,m: print(('PASS ' if c else 'FAIL ')+m)
T={n:req('POST','/dev/login',{'email':f'{n}@thirdplace.test'})[1]['token'] for n in ['sam','wei','jordan','priya','maya']}
H={'X-Device-Key':'local-test-device'}
light=lambda t: req('GET',f'/hw/tables/{t}/state',hdr=H)[1]['light']
for n in T: req('POST','/me/leave-now',tok=T[n])
v2='c0ffee00-0000-4000-8000-000000000002'
tables=req('GET',f'/venues/{v2}/tables')[1]; t=[x for x in tables if x['status']=='open'][0]['id']
ok(light(t)=='off','unclaimed box is off')
s,r=req('POST',f'/tables/{t}/claim',{},tok=T['sam']); ok(s==200 and r['light']=='yellow', f'claim defaults to yellow {r}')
ok(light(t)=='yellow','box shows yellow')
s,r=req('POST',f'/tables/{t}/claim',{},tok=T['wei']); ok(s==400 and r['hint']=='table_taken','second person cannot claim a taken table')
s,r=req('POST',f'/tables/{t}/join',tok=T['wei']); ok(s==400 and r['hint']=='not_available','cannot join yellow directly')
s,rq=req('POST',f'/tables/{t}/request',tok=T['wei']); ok(s==200,'wei requests to chat')
s,cards=req('GET','/me/requests',tok=T['sam']); ok(len(cards)==1 and cards[0]['first_name']=='Wei', f"sam sees card: {cards[0]['first_name']} shared={cards[0]['shared']}")
ok(req('GET',f"/requests/{rq['request_id']}",tok=T['wei'])[1]['status']=='pending','wei sees pending')
s,acc=req('POST',f"/requests/{rq['request_id']}/respond",{'accept':True,'minutes':30},tok=T['sam']); ok(acc.get('accepted'),'sam accepts, 30 min')
st=req('GET',f"/requests/{rq['request_id']}",tok=T['wei'])[1]; ok(st['status']=='accepted' and st['conversation_id'],'wei sees accepted + conversation')
ok(light(t)=='red','box red during conversation')
c1=req('GET','/me/conversation',tok=T['sam'])[1]; c2=req('GET','/me/conversation',tok=T['wei'])[1]
ok(c1['their_first_name']=='Wei' and c2['their_first_name']=='Sam' and c1['ends_at'], 'both see each other first name + timer')
s,tp=req('GET','/me/conversation/topics',tok=T['wei']); ok(s==200, f"topics (gemini={tp.get('generated')}): {tp.get('prompts',[])[:2]}")
req('POST',f"/conversations/{c1['id']}/vote",{'vote':'good'},tok=T['sam'])
mid=req('GET',f"/me/conversation?id={c1['id']}",tok=T['sam'])[1]; ok(not mid['connected'],'one good vote: no connection, nothing revealed')
req('POST',f"/conversations/{c1['id']}/vote",{'vote':'good'},tok=T['wei'])
ok(req('GET',f"/me/conversation?id={c1['id']}",tok=T['wei'])[1]['connected'],'both good -> connected')
cons=req('GET','/me/connections',tok=T['wei'])[1]; ok(any(x['first_name']=='Sam' for x in cons),'connection listed')
ok(light(t)=='yellow','after conversation box back to yellow')
s,rq2=req('POST',f'/tables/{t}/request',tok=T['jordan']); req('POST',f"/requests/{rq2['request_id']}/respond",{'accept':False},tok=T['sam'])
ok(req('GET',f"/requests/{rq2['request_id']}",tok=T['jordan'])[1]['status']=='not_available','decline looks like not_available')
s,r=req('POST',f'/tables/{t}/request',tok=T['jordan']); ok(s==400 and r['hint']=='not_available','24h cooldown after decline (silent)')
req('POST','/me/light',{'light':'green'},tok=T['sam']); ok(light(t)=='green','sam switches to green')
s,j=req('POST',f'/tables/{t}/join',tok=T['priya']); ok(s==200,'priya joins on green')
cid=j['conversation_id']; ok(light(t)=='red','red while talking')
s,r=req('POST',f'/conversations/{cid}/report',{'reason':'uncomfortable'},tok=T['sam']); ok(r.get('reported'),'sam reports priya')
ok(light(t)=='red','reporter light forced red')
req('POST','/me/light',{'light':'green'},tok=T['sam'])
s,r=req('POST',f'/tables/{t}/join',tok=T['priya']); ok(s==400,'blocked person cannot join again')
req('POST','/me/light',{'light':'yellow'},tok=T['sam'])
s,r=req('POST',f'/tables/{t}/request',tok=T['priya']); ok(s==400,'blocked person cannot request')
req('POST','/me/leave-now',tok=T['sam']); ok(light(t)=='off','leave now -> box off')
