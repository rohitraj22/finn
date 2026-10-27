"""Optional deployment-wide daily request cap, including automatic filing analysis."""
from datetime import datetime
from zoneinfo import ZoneInfo
from pathlib import Path
from threading import Lock
import json
import os
_lock = Lock()


def reserve():
    limit = int(os.getenv('FINN_GEMINI_DAILY_LIMIT', '0'))
    if limit <= 0:
        return True
    path = Path(os.getenv('FINN_STATE_DIR', Path(__file__).parent / '.state')) / 'gemini-budget.json'
    day = datetime.now(ZoneInfo('Asia/Kolkata')).date().isoformat()
    with _lock:
        state = json.loads(path.read_text()) if path.exists() else {}
        count = state.get('count', 0) if state.get('day') == day else 0
        if count >= limit:
            return False
        path.parent.mkdir(parents=True, exist_ok=True)
        temp = path.with_suffix('.tmp')
        temp.write_text(json.dumps({'day': day, 'count': count + 1}))
        temp.replace(path)
        return True
