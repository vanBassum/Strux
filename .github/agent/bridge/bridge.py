"""Project board -> GitHub Actions bridge.

GitHub sends `projects_v2_item` webhooks only for ORGANIZATION projects, and only to
an org webhook; nothing can start an Action from a board change directly. This is the
missing hop: it receives that webhook and, when a human moves a card into Analysis or
Build, sends a `repository_dispatch` to the issue's repository. Everything else
(other columns, the agent's own moves, other projects) is ignored.

Environment:
  WEBHOOK_SECRET   the org webhook's secret (HMAC-SHA256 is verified on every call)
  GITHUB_TOKEN     classic PAT: `repo` + `read:project` (the same AGENT_PAT works)
  PROJECT_ID       node id of the pipeline project; other projects are ignored
  HUMANS           comma-separated logins whose moves start work (default: vanBassum)
  PORT             default 8080
Standard library only, so the image is python:slim and nothing else.
"""
import hashlib, hmac, json, os, sys, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SECRET = os.environ["WEBHOOK_SECRET"].encode()
TOKEN = os.environ["GITHUB_TOKEN"]
PROJECT_ID = os.environ["PROJECT_ID"]
HUMANS = {h.strip() for h in os.environ.get("HUMANS", "vanBassum").split(",")}
STAGES = {"Analysis": "analysis", "Build": "build"}

QUERY = """query($id: ID!) { node(id: $id) { ... on ProjectV2Item {
  project { id }
  status: fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
  content { ... on Issue { number repository { nameWithOwner } } } } } }"""


def github(method, path, body):
    req = urllib.request.Request(
        "https://api.github.com" + path, method=method, data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {TOKEN}", "Accept": "application/vnd.github+json"})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read() or b"null")


def handle(event, p):
    if event != "projects_v2_item" or p.get("action") != "edited":
        return "ignored: not an item edit"
    if p.get("sender", {}).get("login") not in HUMANS:
        return "ignored: not moved by a human on the list"
    item = p["projects_v2_item"]
    if item.get("project_node_id") != PROJECT_ID:
        return "ignored: another project"
    # Ask for the item's state now rather than trusting the payload's shape: the
    # webhook says something changed, GraphQL says what it is.
    node = github("POST", "/graphql", {"query": QUERY, "variables": {"id": item["node_id"]}})["data"]["node"]
    stage = STAGES.get((node.get("status") or {}).get("name"))
    issue = node.get("content") or {}
    if not stage or "number" not in issue:
        return "ignored: not an issue moved into Analysis or Build"
    repo = issue["repository"]["nameWithOwner"]
    github("POST", f"/repos/{repo}/dispatches",
           {"event_type": "pipeline-stage", "client_payload": {"stage": stage, "issue": issue["number"]}})
    return f"dispatched {stage} for {repo}#{issue['number']}"


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):  # health check
        self.send_response(200); self.end_headers(); self.wfile.write(b"ok\n")

    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        sig = "sha256=" + hmac.new(SECRET, body, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, self.headers.get("X-Hub-Signature-256", "")):
            self.send_response(401); self.end_headers(); return
        try:
            msg, code = handle(self.headers.get("X-GitHub-Event"), json.loads(body)), 200
        except Exception as e:  # GitHub shows this in the webhook's delivery log
            msg, code = f"error: {e}", 500
        print(msg, file=sys.stderr, flush=True)
        self.send_response(code); self.end_headers(); self.wfile.write(msg.encode() + b"\n")


ThreadingHTTPServer(("", int(os.environ.get("PORT", "8080"))), Handler).serve_forever()
