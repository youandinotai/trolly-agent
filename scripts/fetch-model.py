"""Download a Civitai model file to D: with resume support.

Civitai serves a redirect to its CDN; a plain urlretrieve loses the redirect
on a retry, so this follows the chain explicitly and can resume a partial
download with an HTTP Range request.
"""
import os
import sys
import time
import urllib.request

UA = {'User-Agent': 'Mozilla/5.0', 'Accept': 'application/octet-stream'}


def download(url: str, dest: str, label: str = '') -> bool:
    total = 0
    for attempt in range(1, 41):
        have = os.path.getsize(dest) if os.path.exists(dest) else 0
        req = urllib.request.Request(url, headers=dict(UA))
        if have:
            req.add_header('Range', f'bytes={have}-')
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                if have and r.status != 206:
                    # Server ignored the range; start over.
                    have = 0
                    with open(dest, 'wb') as f:
                        pass
                size = int(r.headers.get('Content-Length') or 0)
                mode = 'ab' if have else 'wb'
                got = have
                last = time.time()
                with open(dest, mode) as f:
                    while True:
                        chunk = r.read(1024 * 1024)
                        if not chunk:
                            break
                        f.write(chunk)
                        got += len(chunk)
                        now = time.time()
                        if now - last > 10:
                            pct = (got / (have + size) * 100) if (have + size) else 0
                            print(f'  [{label}] {got/1048576:.0f} MB '
                                  f'({pct:.1f}%)', flush=True)
                            last = now
                total = got
                # A CDN error page is a 200 with a tiny body. Refuse to call
                # that a finished download.
                if size and got < size:
                    raise RuntimeError(f'short read: {got} of {size} bytes')
                if got < 1024 * 1024:
                    raise RuntimeError(f'suspiciously small payload: {got} bytes')
                print(f'  [{label}] complete: {got/1048576:.1f} MB', flush=True)
                return True
        except Exception as e:
            print(f'  [{label}] attempt {attempt} failed: {str(e)[:90]}', flush=True)
            # A partial file may hold an error page; restart clean.
            if os.path.exists(dest) and os.path.getsize(dest) < 1024 * 1024:
                try:
                    os.remove(dest)
                except OSError:
                    pass
            time.sleep(min(5 + attempt, 20))
    return False


if __name__ == '__main__':
    url, dest = sys.argv[1], sys.argv[2]
    label = sys.argv[3] if len(sys.argv) > 3 else os.path.basename(dest)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    ok = download(url, dest, label)
    print(('OK ' if ok else 'FAILED ') + dest, flush=True)
    sys.exit(0 if ok else 1)
