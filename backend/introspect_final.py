from urllib.request import Request, urlopen
import json

url = "http://dagster-webserver:3000/graphql"

query = """
{
  __type(name: "MaterializationEvent") {
    name
    fields {
      name
    }
  }
}
"""

req = Request(url, data=json.dumps({"query": query}).encode("utf-8"), headers={"Content-Type": "application/json"})
with urlopen(req) as res:
    data = json.loads(res.read().decode("utf-8"))
    fields = [f["name"] for f in data["data"]["__type"]["fields"]]
    print(f"MaterializationEvent Fields: {', '.join(fields)}")
