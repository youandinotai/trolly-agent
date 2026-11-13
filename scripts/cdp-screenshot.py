"""Capture the live Trolly renderer through CDP without Playwright's frame wait."""
import base64
import sys

from cdp import cdp, find_page

out = sys.argv[1] if len(sys.argv) > 1 else 'D:/Trolly/data/verification/cdp-current.png'
page = find_page()
result = cdp(page['webSocketDebuggerUrl'], 'Page.captureScreenshot', {
    'format': 'png',
    'captureBeyondViewport': False,
}, timeout=90)
data = result.get('result', {}).get('result', {}).get('data')
if not data:
    raise SystemExit(f'No screenshot data: {result}')
with open(out, 'wb') as handle:
    handle.write(base64.b64decode(data))
print(out)
