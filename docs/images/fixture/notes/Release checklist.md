# Release checklist

The checklist for `2.5.0` was pasted from a chat, and one comma went missing on the way:

```json
{
  "version": "2.5.0",
  "channel": "beta",
  "checks": [
    { "name": "build", "status": "passed", "durationSec": 41 },
    { "name": "unit tests", "status": "passed", "durationSec": 118 },
    { "name": "smoke test", "status": "passed", "durationSec": 67 }
  ],
  "platforms": ["darwin-arm64", "linux-x64" "win32-x64"],
  "owner": {
    "team": "release",
    "contact": "release@example.com"
  }
}
```

The repair button sits in the error card.
