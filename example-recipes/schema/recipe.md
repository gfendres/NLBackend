# Recipe

A recipe is a set of instructions for preparing a dish, submitted
by a registered user.

## Fields

- **id**: auto uuid, immutable
- **title**: required string, min 3, max 200
- **description**: optional string, max 2000
- **ingredients**: required array of objects, each with:
    - name (required string)
    - quantity (required string)
- **steps**: required array of strings, min 1 item
- **difficulty**: optional enum ("easy", "medium", "hard"), default "medium"
- **cook_time_minutes**: optional number, min 1
- **servings**: optional number, min 1
- **author_id**: required reference to User, indexed
- **tags**: optional array of strings
- **published**: optional boolean, default false
- **rating_average**: optional number, default 0
- **review_count**: optional number, default 0
- **created_at**: auto timestamp, immutable
- **updated_at**: auto timestamp on change

## Relationships

- Belongs to a User (via author_id)
- Has many Reviews
- Has many Favorites
