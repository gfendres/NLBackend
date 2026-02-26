# Database — File-based data storage

The `db/` folder is **auto-managed by the framework**. You should never manually edit files here.

## How it works

Each schema becomes a folder under `db/`:

```
db/
├── user/
│   ├── data.json           # All records for this collection
│   └── wal.json            # Write-ahead log
├── recipe/
│   ├── data.json
│   └── wal.json
└── ...
```

- **data.json** — Array of all records in the collection
- **wal.json** — Write-ahead log for crash recovery

## Important

- **Do not edit files in db/ directly.** Use the CRUD tools or `mutate_db` system tool.
- **To reset the database**, delete the `db/` folder. The framework will recreate it on next startup.
- **Indexes are in-memory.** Fields marked with `indexed` or `reference to` get automatic lookup indexes built at startup.
- **File locking** prevents concurrent writes to the same collection.

## Querying data

Use the auto-generated tools or the `query_db` system tool:

- `{entity}_list` — List records with optional filters
- `{entity}_get` — Get a single record by ID
- `query_db` — Raw query with filters, sort, pagination, and field selection
