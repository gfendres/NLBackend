# Create Recipe

**Auth:** Authenticated
**Tier:** 1

## What it does

Creates a new recipe. The authenticated user is automatically set
as the author. Validates all fields against the Recipe schema.
The recipe starts as a draft (published = false) unless explicitly set.

## Input

- **title** (required): The recipe name
- **description** (optional): A short summary of the dish
- **ingredients** (required): Array of {name, quantity} objects
- **steps** (required): Array of instruction strings
- **difficulty** (optional): "easy", "medium", or "hard"
- **cook_time_minutes** (optional): Cooking time in minutes
- **servings** (optional): Number of servings
- **tags** (optional): Array of tag strings

## Output

Returns the full recipe object with generated id, author_id,
and timestamps.

## Errors

- **invalid_input**: Missing required fields or validation failures
- **not_authenticated**: No valid auth token provided
- **conflict**: A recipe with the same title by this author exists
