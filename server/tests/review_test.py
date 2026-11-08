"""Regression checks. Use only a disposable, seeded local API; mutates demo users.
Run: python3 server/tests/review_test.py http://localhost:8790
"""
import concurrent.futures
import json
import sys
import urllib.request
import urllib.error

BASE = sys.argv[1]
assert BASE.startswith(('http://localhost:', 'http://127.0.0.1:')), 'Local test API required'

def req(method, path, body=None, token=None, key=None):
    headers = {'Content-Type': 'application/json'}
    if token: headers['Authorization'] = 'Bearer ' + token
    if key: headers['X-Device-Key'] = key
    request = urllib.request.Request(BASE + path, method=method, headers=headers,
        data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, json.load(error)

def check(condition, label):
    assert condition, label
    print('PASS', label)

tokens = {name: req('POST', '/dev/login', {'email': name + '@thirdplace.test'})[1]['token']
          for name in ('sam', 'wei', 'maya', 'jordan')}
for token in tokens.values(): req('POST', '/me/leave-now', token=token)
tables = req('GET', '/venues/c0ffee00-0000-4000-8000-000000000002/tables')[1]
table = next(t['id'] for t in tables if t['status'] == 'open')
path = '/tables/' + table
check(req('GET', '/hw/tables/bad/state', key='wrong')[0] == 401, 'wrong device key')
check(req('GET', '/hw/tables/bad/state', key='local-test-device')[0] == 400, 'malformed hardware id')
check(req('GET', '/hw/tables/00000000-0000-0000-0000-000000000000/state', key='local-test-device')[0] == 404, 'unknown hardware id')
check(req('POST', path + '/claim', {'light': 'yellow'}, tokens['sam'])[0] == 200, 'claim')
with concurrent.futures.ThreadPoolExecutor() as pool:
    answers = list(pool.map(lambda _: req('POST', path + '/request', token=tokens['maya']), range(2)))
check(all(s == 200 for s, _ in answers) and answers[0][1]['request_id'] == answers[1][1]['request_id'], 'concurrent duplicate requests reuse one request')
rid = answers[0][1]['request_id']
check(req('POST', '/requests/' + rid + '/respond', {'accept': 'false'}, tokens['sam'])[0] == 400, 'string false cannot accept')
req('POST', '/me/light', {'light': 'green'}, tokens['sam'])
with concurrent.futures.ThreadPoolExecutor() as pool:
    answers = list(pool.map(lambda name: req('POST', path + '/join', token=tokens[name]), ('maya', 'jordan')))
check(sorted(s for s, _ in answers) == [200, 400], 'simultaneous joins produce one conversation and one unavailable')
check(req('POST', '/requests/' + rid + '/respond', {'accept': True}, tokens['sam'])[0] == 400, 'old request cannot start a second conversation')
check(req('GET', '/hw/tables/' + table + '/state', key='local-test-device')[1]['light'] == 'red', 'live conversation stays red')
for token in tokens.values(): req('POST', '/me/leave-now', token=token)
check(req('GET', '/hw/tables/' + table + '/state', key='local-test-device')[1]['light'] == 'off', 'leave fails closed')
print('ALL PASS')
