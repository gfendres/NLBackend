# User

A registered user of the recipe platform. Users can create recipes,
leave reviews, and save favorites.

## Fields

- **id**: auto uuid, immutable
- **username**: required string, min 3, max 30, unique
- **email**: required string, unique
- **display_name**: optional string, max 100
- **role**: required enum ("viewer", "editor", "admin"), default "editor"
- **bio**: optional string, max 500
- **recipe_count**: optional number, default 0
- **created_at**: auto timestamp, immutable
- **updated_at**: auto timestamp on change

## Relationships

- Has many Recipes
- Has many Reviews
- Has many Favorites
