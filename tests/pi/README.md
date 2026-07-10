# pi tests

These cover the pi harness extension (`extensions/pi/snowball.ts`) and the
session-tree serializer (`skills/decision-logging/scripts/pi-session-reader.ts`).

Run with `bun test tests/pi/`. The extension tests stub `ExtensionAPI` from
`@earendil-works/pi-coding-agent` (no real pi process is spawned) and use a
synthetic transcript fixture copied into a temp git repo.
