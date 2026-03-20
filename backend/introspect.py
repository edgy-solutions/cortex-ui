import requests
import json
import os

url = "http://dagster-webserver:3000/graphql"

# Introspect the MaterializationEvent type and its fields
query = """
{
  __type(name: "MaterializationEvent") {
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
"""

try:
    response = requests.post(url, json={"query": query})
    if response.status_code == 200:
        print(json.dumps(response.json(), indent=2))
    else:
        print(f"Error {response.status_code}: {response.text}")
except Exception as e:
    print(f"Exception: {e}")
