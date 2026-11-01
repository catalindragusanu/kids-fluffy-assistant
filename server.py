#!/usr/bin/env python3
"""Static file server with a same-origin proxy for Ollama Cloud.

ollama.com does not send CORS headers, so browsers cannot call it directly.
POST /api/chat is forwarded to Ollama Cloud. The API key comes from the
OLLAMA_API_KEY environment variable if set, otherwise from the request's
Authorization header.
"""
import os
import sys
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

UPSTREAM = "https://ollama.com/v1/chat/completions"
TIMEOUT_SECONDS = 120
MAX_BODY_BYTES = 1_000_000


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def do_POST(self):
        if self.path.split("?")[0] != "/api/chat":
            self.send_error(404)
            return

        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY_BYTES:
            self.send_error(400, "Invalid body size")
            return
        body = self.rfile.read(length)

        auth = self.headers.get("Authorization", "")
        env_key = os.environ.get("OLLAMA_API_KEY", "").strip()
        if env_key:
            auth = f"Bearer {env_key}"

        headers = {"Content-Type": "application/json"}
        if auth:
            headers["Authorization"] = auth
        request = urllib.request.Request(UPSTREAM, data=body, headers=headers, method="POST")

        try:
            with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
                status, payload = response.status, response.read()
        except urllib.error.HTTPError as error:
            status, payload = error.code, error.read()
        except Exception as error:  # network failure, timeout, DNS
            status = 502
            payload = ('{"error":{"message":"Proxy could not reach Ollama Cloud: %s"}}' % str(error).replace('"', "'")).encode()

        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


def main():
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", sys.argv[1] if len(sys.argv) > 1 else "8000"))
    ThreadingHTTPServer((host, port), Handler).serve_forever()


if __name__ == "__main__":
    main()
