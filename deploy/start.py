"""Run one private FastAPI worker and one public Next.js server; fail as a unit."""
import os
import signal
import subprocess
import sys
import time
from urllib.request import urlopen


def main():
    children = []
    def stop(*_):
        for process in children:
            if process.poll() is None:
                process.terminate()
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    try:
        children.append(subprocess.Popen([sys.executable, '-m', 'uvicorn', 'backend.main:app',
                                          '--host', '127.0.0.1', '--port', '8000', '--workers', '1']))
        ready = False
        for _ in range(60):
            if children[0].poll() is not None:
                raise RuntimeError('Backend exited during startup')
            try:
                with urlopen('http://127.0.0.1:8000/health', timeout=1) as r:
                    ready = r.status == 200
            except OSError:
                time.sleep(1)
            if ready:
                break
        if not ready:
            raise RuntimeError('Backend did not become healthy')
        frontend_env = {k:v for k,v in os.environ.items() if k not in ('GEMINI_API_KEY','GOOGLE_API_KEY')}
        frontend_env.update(HOSTNAME='0.0.0.0', FINN_BACKEND_URL='http://127.0.0.1:8000')
        children.append(subprocess.Popen(['node', 'server.js'], env=frontend_env))
        while all(p.poll() is None for p in children):
            time.sleep(1)
        return 1
    finally:
        stop()
        for process in children:
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()

if __name__ == '__main__':
    raise SystemExit(main())
