"""Download and index configured official PDFs (run from the repository root)."""
import argparse
import json
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.main import app

parser = argparse.ArgumentParser()
parser.add_argument("symbol", nargs="?", default="TCS")
args = parser.parse_args()
status = app.state.research.status(args.symbol.upper())
print(json.dumps(status, indent=2))
raise SystemExit(0 if status["documents_ready"] else 1)
