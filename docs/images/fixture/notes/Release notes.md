# Release notes

The build metadata for `2.4.0` ships as a JSON block, so it stays readable in the
note and machine-readable for the release script:

```json
{
  "version": "2.4.0",
  "released": "2026-04-18",
  "artifacts": [
    { "platform": "darwin-arm64", "sizeKb": 2140 },
    { "platform": "linux-x64", "sizeKb": 2286 }
  ],
  "notes": {
    "added": ["offline maps", "elevation profiles"]
  }
}
```

Code blocks render read-only — the file view is where editing happens.
