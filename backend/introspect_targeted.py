from urllib.request import Request, urlopen
import json

url = "http://dagster-webserver:3000/graphql"

def query_type(type_name):
    query = """
    {
      __type(name: "%s") {
        name
        fields {
          name
          type {
            name
            kind
            ofType {
                name
                kind
            }
          }
        }
      }
    }
    """ % type_name
    req = Request(url, data=json.dumps({"query": query}).encode("utf-8"), headers={"Content-Type": "application/json"})
    with urlopen(req) as res:
        return json.loads(res.read().decode("utf-8"))

# Introspect both the event and the nested materialization type if it exists
m_event = query_type("MaterializationEvent")
print("--- MaterializationEvent Fields ---")
for field in m_event.get("data", {}).get("__type", {}).get("fields", []):
    print(f"- {field['name']} ({field['type'].get('name') or field['type'].get('ofType', {}).get('name')})")

a_mat = query_type("AssetMaterialization")
print("\n--- AssetMaterialization Fields ---")
for field in a_mat.get("data", {}).get("__type", {}).get("fields", []):
    print(f"- {field['name']} ({field['type'].get('name') or field['type'].get('ofType', {}).get('name')})")
