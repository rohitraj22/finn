from concurrent.futures import ThreadPoolExecutor
from backend.ai_budget import reserve

def test_budget_is_persistent_atomic_and_bounded(tmp_path,monkeypatch):
    monkeypatch.setenv('FINN_STATE_DIR',str(tmp_path))
    monkeypatch.setenv('FINN_GEMINI_DAILY_LIMIT','3')
    with ThreadPoolExecutor(max_workers=5) as pool:
        assert sum(pool.map(lambda _:reserve(), range(10))) == 3
    assert not reserve()

def test_budget_disabled_locally(monkeypatch):
    monkeypatch.delenv('FINN_GEMINI_DAILY_LIMIT',raising=False)
    assert reserve()
