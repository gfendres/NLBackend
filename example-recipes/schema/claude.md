# Schema — How to define data models

Each file in this folder defines **one entity** (like a database table). The filename is the entity name in singular form: `user.md`, `recipe.md`, `order.md`.

## Required sections

Every schema file must have these three sections:

### 1. Title (H1 heading)
The entity name. Must match the filename.

### 2. Description
A plain-English paragraph explaining what this entity represents.

### 3. Fields
A list of fields. Each field is a bullet point starting with the field name in bold.

### 4. Relationships (if any)
How this entity relates to others. Use "has many", "belongs to", or "has one".

## Recognized keywords

The schema compiler matches these keywords literally. Use them exactly as shown:

| Keyword | What it means | Example |
|---------|--------------|---------|
| `required` | Must be present on create | `required string` |
| `optional` | Can be omitted | `optional string` |
| `default <value>` | Used when field is omitted | `default "medium"` |
| `enum ("a", "b")` | Only these values allowed | `enum ("easy", "medium", "hard")` |
| `min <n>` / `max <n>` | Numeric or length bounds | `min 1, max 200` |
| `unique` | No duplicates in collection | `unique` |
| `indexed` | Builds a query index | `indexed` |
| `reference to <Entity>` | Foreign key | `reference to User` |
| `auto uuid` | Auto-generated ID | `auto uuid, immutable` |
| `auto timestamp` | Auto-generated timestamp | `auto timestamp` |
| `immutable` | Cannot change after creation | `immutable` |

## Field types

`string`, `number`, `boolean`, `date`, `enum`, `array`, `object`, `reference`, `uuid`

## Example

```markdown
# User

A registered user of the platform.

## Fields

- **id**: auto uuid, immutable
- **username**: required string, min 3, max 30, unique
- **email**: required string, unique
- **role**: required enum ("viewer", "editor", "admin"), default "editor"
- **bio**: optional string, max 500
- **created_at**: auto timestamp, immutable
- **updated_at**: auto timestamp on change

## Relationships

- Has many Recipes
- Has many Reviews
```

## Tips

- Always include `id` as `auto uuid, immutable`
- Always include `created_at` and `updated_at` as `auto timestamp`
- Add `indexed` to fields used in filters and lookups
- `reference to` fields are auto-indexed
- Array fields can have sub-items described with indented bullets
- Keep descriptions short — one paragraph is enough
