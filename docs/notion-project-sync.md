# Notion Project Sync

Use `scripts/import-notion-project.cjs` to import any Notion project board into the dashboard once the Notion connector has produced a normalized payload.

The importer is project-agnostic. It expects:

```json
{
  "project": {
    "id": "flight-eye",
    "name": "Flight Eye",
    "url": "https://app.notion.com/p/...",
    "owner": "Flight Eye Team",
    "initialPhaseComplete": true,
    "replaceTickets": true,
    "startDate": "2026-06-01",
    "targetDate": "2026-06-15",
    "priority": "high"
  },
  "tickets": [
    {
      "number": 894,
      "title": "[Audit][P1] Add robots.txt and rebuild sitemap.xml",
      "status": "In review",
      "priority": "Critical",
      "team": "Dev",
      "type": "Bug fix",
      "text": "Fix missing robots.txt and broken mixed-host/mixed-protocol sitemap.",
      "url": "https://app.notion.com/p/...",
      "startDate": "2026-06-01",
      "statusHistory": [
        { "at": "2026-06-01T09:00:00Z", "status": "In progress" },
        { "at": "2026-06-02T13:00:00Z", "status": "In review" }
      ]
    }
  ]
}
```

Run:

```bash
node scripts/import-notion-project.cjs /path/to/notion-project-payload.json
```

By default, the importer replaces the project's ticket rows. Set `"replaceTickets": false` on `project` to append/update Notion tickets without deleting existing dashboard work items.

Status mapping:

- `Not started` -> dashboard `not_started`, review `pending`
- `In progress` -> dashboard `in_progress`, review `pending`
- `In review` / `Testing` -> dashboard `in_progress`, review `in_progress`
- `Done` / `Live` / `Archived` -> dashboard `completed`, review `passed`
- `Blocked` -> dashboard `blocked`, review `failed`

Risk rules:

- Adds an open-ticket risk while any tickets are not complete.
- Adds a high review-regression risk when tickets move from `In review` or `Testing` back to `In progress`, `Not started`, or `Blocked` at least 3 times, or for at least 15% of the ticket count.
- Adds a high failed-review risk when at least 3 tickets and at least 15% of tickets are currently failed review.
