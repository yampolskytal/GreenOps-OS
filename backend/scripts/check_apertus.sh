#!/bin/sh
# Start the Python backend, then check the dashboard chat endpoint.
python3 - <<'PY'
import json
import sys
from urllib.request import Request, urlopen

request = Request("http://127.0.0.1:8765/api/v2/chat",
                  data=json.dumps({"messages": [{"role": "user", "content": "Wie viel geben wir pro Tool aus?"}]}).encode(),
                  headers={"Content-Type": "application/json"})
try:
    with urlopen(request, timeout=30) as response:
        answer = json.load(response)
except OSError as exc:
    sys.exit(f"Could not reach the local chat service ({exc}).")
print(answer.get("content", "No answer returned."))
print("Answered by", answer.get("assistant", "an older version of GreenOps"))
sys.exit(0 if answer.get("assistant") == "Apertus + GreenOps" else 1)
PY
