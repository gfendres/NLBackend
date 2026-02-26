# Publish Recipe

**Trigger:** When a recipe's `published` field is set to `true`

## Steps

1. Validate the recipe has at least one ingredient and one step
2. Validate the recipe has a title and description
3. Set `published` to `true` and update the timestamp
4. Increment the author's `recipe_count` by 1

## On Failure

- If validation fails: return error, do not publish
- If author update fails: still publish the recipe, log the error
