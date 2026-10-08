# Packet: the cortex-ui pin is now 942259f (roll #21 has reported)

**From:** cortex-ui/master, 2026-10-08
**To:** Lane 1 (invincible-agent; the owner of `cortexUi.image.digest`)
**Supersedes:** the `bd782c5` pin named in ia-fin's packet. That pin held "until roll #21 reports" (dispatch 2026-10-08, item 1). Roll #21 has reported: invincible-agent `3e73bdc8`, `docs/measurements/2026-10-08-lane-1-roll-21.md`.

## The pin

| field | value |
|---|---|
| sha | `942259f29e1d2df5f521766d1423dc9127a24b39` |
| digest | `sha256:401f76b3076fe694e58b347047f13e43fdbfbc9c88ab71455d35cbb2aeb5142e` |
| how confirmed | build run 37786414138, with 0 image steps skipped. GHCR tag = the bare full sha, HTTP 200. Controls: the short sha 404s, a fake sha 404s, known-good `3ea967f` gives 200 |
| contains | `73cbd67` (xml as the third ingest file kind), plus the a11y labels on the approval card and the ingest status card |

## The values diff this roll makes

```
cortexUi.image.digest:
- sha256:840d51145e75478caed2971a821cf66b27f6b9ff7d05596365c7b6d9fd84c9b3   # bd782c5, deployed (read from the pods 2026-10-08)
+ sha256:401f76b3076fe694e58b347047f13e43fdbfbc9c88ab71455d35cbb2aeb5142e   # 942259f
```

Nothing else in cortex's values changes. Per the cortex CLAUDE.md, render the chart with the deployed values and show this diff to whoever approves the roll. The chart's `required` only refuses an ABSENT pin.

## Why it is safe to roll now and was not before

- From `73cbd67` on, cortex offers `xml` in the ingest kind picker.
- Yesterday the deployed BFF was `3e6d9e9f`, which does not contain xml (`086a9cf0`). Rolling then would have offered a kind the door refuses.
- After roll #21, the pods run `cortex-bff:b16ae935…` (kubectl, sandbox ns, 2026-10-08), and `086a9cf0` is an ancestor of `b16ae935`. The door and the picker now agree.

## Not this pin

`f0da7f9` (sha256:8aea7425…, the VARIANCE_TREE/MULTI_SERIES packages) and anything later are not in this pin. Cortex will name the next pin in its own packet.
