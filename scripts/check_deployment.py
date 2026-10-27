"""Read-only live production checks. No AI generation or preference mutation."""
import json
import sys
from urllib.request import urlopen
from urllib.error import HTTPError

base = sys.argv[1].rstrip('/')
if not base.startswith(('https://', 'http://127.0.0.1:', 'http://localhost:')):
    raise SystemExit('Use the HTTPS deployment URL (or a local test server).')
failed = False
for path in ['/api/health', '/api/market', '/api/announcements', '/api/price-alerts']:
    try:
        with urlopen(base + path, timeout=180) as response:
            value = json.load(response)
        if path == '/api/health':
            assert value['status'] == 'ok'
        elif path == '/api/market':
            assert value['available_count'] == 18 and value['performance'], 'Incomplete real market data'
        elif path == '/api/announcements':
            assert value['status'] == 'ok', 'Incomplete exchange coverage'
        else:
            assert value['checked_companies'] == 18, 'Incomplete EOD coverage'
        print('PASS', path)
    except (OSError, HTTPError, ValueError, KeyError, AssertionError) as exc:
        failed = True
        print('FAIL', path, type(exc).__name__, str(exc)[:180])
print('AI generation and desktop/mobile browser checks still require the acceptance steps in docs/deployment.md.')
raise SystemExit(1 if failed else 0)
