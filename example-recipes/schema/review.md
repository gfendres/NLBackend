# Review

A review is a rating and optional comment left by a user on a recipe.
Each user can only leave one review per recipe.

## Fields

- **id**: auto uuid, immutable
- **recipe_id**: required reference to Recipe, indexed
- **author_id**: required reference to User, indexed
- **rating**: required number, min 1, max 5
- **comment**: optional string, max 1000
- **created_at**: auto timestamp, immutable
- **updated_at**: auto timestamp on change

## Relationships

- Belongs to a Recipe (via recipe_id)
- Belongs to a User (via author_id)
