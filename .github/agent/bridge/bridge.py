"""Project board -> GitHub Actions bridge.

Nothing GitHub emits can start an Action when a card moves on a USER-owned project:
the `projects_v2_item` webhook exists for organization projects only. So this
watches the board instead: every POLL_SECONDS it reads each card's Status and, when
a card has newly arrived in Analysis or Build, sends a `repository_dispatch`
(pipeline-stage, {stage, issue}) to the issue's repository.

Only humans move cards INTO Analysis or Build -- the agent only ever moves them to
Plan review, Acceptation or Idle -- so any arrival there is a human decision.

What it remembers is in memory. On start it records the board as it is and
dispatches nothing, so a restart never re-runs a stage; a card dragged while it was
down is simply dragged again. An idle board costs one GraphQL call per poll: no
Actions minutes, no Claude credits.

Environment:
  GITHUB_TOKEN   classic PAT: `repo` + `read:project` (the AGENT_PAT works)
  PROJECT_ID     node id of the pipeline project
  POLL_SECONDS   default 30
Standard library only, so the image is python:slim and nothing else.
"""
import json, os, sys, time, urllib.request

TOKEN = os.environ["GITHUB_TOKEN"]
PROJECT_ID = os.environ["PROJECT_ID"]
POLL = int(os.environ.get("POLL_SECONDS", "30"))
STAGES = {"Analysis": "analysis", "Build": "build"}

QUERY = """query($p: ID!, $after: String) { node(id: $p) { ... on ProjectV2 {
  items(first: 100, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes { id
      status: fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { name } }
      content { ... on Issue { number repository { nameWithOwner } } } } } } } }"""


def log(msg):
    print(time.strftime("%Y-%m-%d %H:%M:%S"), msg, file=sys.stderr, flush=True)


def github(path, body):
    req = urllib.request.Request(
        "https://api.github.com" + path, method="POST", data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {TOKEN}", "Accept": "application/vnd.github+json"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read() or b"null")


def board():
    """{item id: (status, repo, issue number)} for every issue on the board."""
    cards, after = {}, None
    while True:
        res = github("/graphql", {"query": QUERY, "variables": {"p": PROJECT_ID, "after": after}})
        if res.get("errors"):
            raise RuntimeError(res["errors"])
        items = res["data"]["node"]["items"]
        for n in items["nodes"]:
            c = n.get("content") or {}
            if "number" in c:
                cards[n["id"]] = ((n.get("status") or {}).get("name"),
                                  c["repository"]["nameWithOwner"], c["number"])
        if not items["pageInfo"]["hasNextPage"]:
            return cards
        after = items["pageInfo"]["endCursor"]


def main():
    seen = board()
    log(f"watching {len(seen)} cards every {POLL}s")
    while True:
        time.sleep(POLL)
        try:
            now = board()
        except Exception as e:  # a network blip: keep the old view, try again
            log(f"poll failed: {e}")
            continue
        for item, (status, repo, number) in now.items():
            before = seen.get(item, (None,))[0]
            if status in STAGES and status != before:
                try:
                    github(f"/repos/{repo}/dispatches", {"event_type": "pipeline-stage",
                           "client_payload": {"stage": STAGES[status], "issue": number}})
                    log(f"{repo}#{number}: {before} -> {status}, dispatched {STAGES[status]}")
                except Exception as e:  # remember the old status, so the next poll retries
                    log(f"{repo}#{number}: dispatch failed: {e}")
                    now[item] = seen.get(item, (None, repo, number))
        seen = now


main()
