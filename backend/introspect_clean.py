from urllib.request import Request, urlopen
import json

url = "http://dagster-webserver:3000/graphql"
query = """
{
  __type(name: "MaterializationEvent") {
    name
    fields {
      name
      type {
        name
        kind
      }
    }
  }
}
"""

req = Request(url, data=json.dumps({"query": query}).encode("utf-8"), headers={"Content-Type": "application/json"})
with urlopen(req) as res:
    print(json.dumps(json.loads(res.read().decode("utf-8")), indent=2))
