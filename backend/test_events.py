import httpx, json

r = httpx.post("http://dagster-webserver:3000/graphql", json={"query": "{ runsOrError { ... on Runs { results { runId } } } }"})
run_id = r.json()["data"]["runsOrError"]["results"][0]["runId"]

query = """
query GetEvents($runId: ID!) {
  runOrError(runId: $runId) {
    ... on Run {
      eventConnection {
        events { __typename }
      }
    }
  }
}
"""
r2 = httpx.post("http://dagster-webserver:3000/graphql", json={"query": query, "variables": {"runId": run_id}})
data = r2.json()["data"]["runOrError"]["eventConnection"]["events"]
print(f"Total events: {len(data)}")
from collections import Counter
print(Counter([e["__typename"] for e in data]))
