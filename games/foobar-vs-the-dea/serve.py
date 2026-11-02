#!/usr/bin/env python3
"""Dev server that refuses to let the browser cache anything.

    python3 serve.py            # http://localhost:8080

Plain `python3 -m http.server` sends no Cache-Control, so browsers heuristically
cache js, json and png files and you end up testing an old build.
"""
import http.server, socketserver, sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

with socketserver.TCPServer(('', PORT), NoCache) as httpd:
    print(f'Foobar dev server -> http://localhost:{PORT}  (caching disabled)')
    httpd.serve_forever()
