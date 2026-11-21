#!/bin/sh
# Checks the Apertus setup in 3 steps. Usage: ./check_apertus.sh   (reads ./apertus.env)
cd "$(dirname "$0")" && . ./apertus.env || exit 1
case "$GREENOPS_LLM_API_KEY" in ""|PASTE_KEY_HERE) echo "Put your key into apertus.env first."; exit 1;; esac
AUTH="Authorization: Bearer $GREENOPS_LLM_API_KEY"

echo "1) Models offered by $GREENOPS_LLM_BASE_URL:"
curl -s -m 15 "$GREENOPS_LLM_BASE_URL/models" -H "$AUTH" | python3 -c '
import json,sys
try: d=json.load(sys.stdin); print("\n".join("   "+m["id"] for m in d.get("data",[])) or d)
except Exception as e: print("   could not read reply:", e)'

echo "2) Model reply (should contain {\"query\": ...}):"
curl -s -m 60 "$GREENOPS_LLM_BASE_URL/chat/completions" -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"model\":\"$GREENOPS_LLM_MODEL\",\"temperature\":0,\"messages\":[{\"role\":\"system\",\"content\":\"Reply with JSON only: {\\\"query\\\": \\\"<supported query>\\\"}. Supported: top N tools/departments by CHF, energy, carbon.\"},{\"role\":\"user\",\"content\":\"Which tools pollute the most?\"}]}" \
  | python3 -c '
import json,sys
try: print("  ", json.load(sys.stdin)["choices"][0]["message"]["content"])
except Exception as e: print("   failed:", e)'

echo "3) Through the app (start it with: . ./apertus.env && python app.py serve):"
curl -s -m 90 http://127.0.0.1:8765/api/ask -H "Content-Type: application/json" \
  -d '{"question":"How heavy is our footprint?"}' | python3 -c '
import json,sys
try: print("   assistant =", json.load(sys.stdin).get("assistant"))
except Exception as e: print("   app not reachable or error:", e)'
echo "   'LLM intent routing (...)' = Apertus works. 'local' = env not loaded in the server terminal. 'local fallback' = see steps 1-2."
