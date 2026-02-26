# Favorite

A favorite marks that a user has saved a recipe for later.
Each user can only favorite a recipe once.

## Fields

- **id**: auto uuid, immutable
- **user_id**: required reference to User, indexed
- **recipe_id**: required reference to Recipe, indexed
- **created_at**: auto timestamp, immutable

## Relationships

- Belongs to a User (via user_id)
- Belongs to a Recipe (via recipe_id)
