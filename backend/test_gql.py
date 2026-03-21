import httpx, json

# Get last run
r = httpx.post('http://dagster-webserver:3000/graphql', json={'query': '{ runsOrError { ... on Runs { results { runId } } } }'})
run_id = r.json()['data']['runsOrError']['results'][0]['runId']
print(f"Checking run {run_id}")

# Query outputs
query = """
query GetRunOutputs($runId: ID!) {
  runOrError(runId: $runId) {
    __typename
    ... on Run {
      eventConnection {
        events {
          __typename
          ... on HandledOutputEvent {
            stepKey
            metadataEntries {
              label
              ... on JsonMetadataEntry { jsonString }
              ... on TextMetadataEntry { text }
            }
          }
          ... on ExecutionStepOutputEvent {
            stepKey
            outputName
            metadataEntries {
              label
              ... on JsonMetadataEntry { jsonString }
              ... on TextMetadataEntry { text }
            }
          }
        }
      }
    }
  }
}
"""
r2 = httpx.post('http://dagster-webserver:3000/graphql', json={'query': query, 'variables': {'runId': run_id}})

# Filter out empty events
data = r2.json()
events = data['data']['runOrError']['eventConnection']['events']
filtered = [e for e in events if e.get('__typename') in ['HandledOutputEvent', 'ExecutionStepOutputEvent']]

print(json.dumps(filtered, indent=2))
