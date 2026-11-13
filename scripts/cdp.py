"""Drive Trolly Agent's UI through the Electron DevTools protocol.

Used to verify the real UI end-to-end: navigate to a view, read what is on
screen, and click real buttons.
"""
import json
import urllib.request

PORT = 48702


def targets():
    with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/json", timeout=10) as r:
        return json.loads(r.read().decode())


def find_page():
    for t in targets():
        if t.get('type') == 'page' and ('Trolly/app' in t.get('url', '') or t.get('url', '').startswith('file://')):
            return t
    for t in targets():
        if t.get('type') == 'page':
            return t
    raise SystemExit('no page target')


def cdp(ws_url, method, params=None, timeout=90):
    """Minimal CDP client over a raw websocket (stdlib only)."""
    import base64
    import os
    import socket
    import struct

    url = ws_url.replace('ws://', '')
    hostport, path = url.split('/', 1)
    host, port = hostport.split(':')
    sock = socket.create_connection((host, int(port)), timeout=timeout)
    key = base64.b64encode(os.urandom(16)).decode()

    handshake = (
        f"GET /{path} HTTP/1.1\r\n"
        f"Host: {hostport}\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        f"Sec-WebSocket-Key: {key}\r\n"
        "Sec-WebSocket-Version: 13\r\n\r\n"
    )
    sock.sendall(handshake.encode())
    buf = b''
    while b'\r\n\r\n' not in buf:
        buf += sock.recv(4096)

    def send(obj):
        payload = json.dumps(obj).encode()
        header = b'\x81'
        mask = os.urandom(4)
        n = len(payload)
        if n < 126:
            header += bytes([0x80 | n])
        elif n < 65536:
            header += bytes([0x80 | 126]) + struct.pack('>H', n)
        else:
            header += bytes([0x80 | 127]) + struct.pack('>Q', n)
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
        sock.sendall(header + mask + masked)

    def recv():
        head = sock.recv(2)
        if not head:
            raise RuntimeError('socket closed')
        length = head[1] & 0x7F
        if length == 126:
            length = struct.unpack('>H', sock.recv(2))[0]
        elif length == 127:
            length = struct.unpack('>Q', sock.recv(8))[0]
        data = b''
        while len(data) < length:
            data += sock.recv(length - len(data))
        return json.loads(data.decode('utf8', 'ignore'))

    msg_id = 1
    send({'id': msg_id, 'method': method, 'params': params or {}})
    while True:
        msg = recv()
        if msg.get('id') == msg_id:
            sock.close()
            return msg
        msg_id += 1


def evaluate(ws_url, expression, await_promise=False, timeout=600):
    res = cdp(ws_url, 'Runtime.evaluate', {
        'expression': expression,
        'returnByValue': True,
        'awaitPromise': await_promise,
    }, timeout=timeout)
    result = res.get('result', {}).get('result', {})
    if 'exceptionDetails' in res.get('result', {}):
        return {'error': str(res['result']['exceptionDetails'])[:400]}
    return result.get('value', result)


if __name__ == '__main__':
    import sys
    page = find_page()
    ws = page['webSocketDebuggerUrl']
    expr = sys.argv[1] if len(sys.argv) > 1 else "document.body.innerText.slice(0,800)"
    print(json.dumps(evaluate(ws, expr, await_promise=True), indent=1)[:3000])
