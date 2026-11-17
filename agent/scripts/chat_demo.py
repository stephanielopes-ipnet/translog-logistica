"""Cliente do endpoint real ADK. Requer servidor e chave/modelo disponíveis."""

import argparse
import json
import sys
import uuid

import httpx

from translog.client import extract_final_text


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("message")
    parser.add_argument("--base-url", default="http://127.0.0.1:8001")
    parser.add_argument("--user-id")
    parser.add_argument("--session-id")
    parser.add_argument("--reuse-session", action="store_true")
    args = parser.parse_args()
    if args.reuse_session and not (args.user_id and args.session_id):
        parser.error("--reuse-session exige --user-id e --session-id.")
    user_id = args.user_id or "demo-" + uuid.uuid4().hex
    session_id = args.session_id or uuid.uuid4().hex
    # Identificadores entram em segmentos de URL: aceitar apenas a forma simples de demo.
    import re
    if not all(re.fullmatch(r"[A-Za-z0-9_-]{1,100}", value) for value in (user_id, session_id)):
        parser.error("Identificadores devem usar letras, números, _ ou -.")
    try:
        with httpx.Client(base_url=args.base_url, timeout=60) as client:
            if not args.reuse_session:
                response = client.post(f"/apps/translog_agent/users/{user_id}/sessions/{session_id}", json={})
                response.raise_for_status()
            response = client.post("/run", json={"appName": "translog_agent", "userId": user_id,
                                   "sessionId": session_id, "newMessage": {"role": "user", "parts": [{"text": args.message}]}})
            response.raise_for_status()
            print(json.dumps({"user_id": user_id, "session_id": session_id, "answer": extract_final_text(response.json())}, ensure_ascii=False, indent=2))
        return 0
    except (httpx.HTTPError, ValueError):
        print("Chat indisponível ou sem resposta final. Conferir servidor, acesso ao modelo e logs locais.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
