# Search Recipes

**Auth:** Public
**Tier:** 2

## What it does

Searches for recipes matching a query string. Searches across
title, description, tags, and ingredients. Returns results
sorted by relevance. Supports pagination.

## Input

- **query** (required): The search string
- **difficulty** (optional): Filter by difficulty level
- **tags** (optional): Array of tags to filter by
- **limit** (optional): Max results (default 20)
- **offset** (optional): Skip results for pagination

## Output

Returns a list of matching recipes with pagination metadata.

## Errors

- **invalid_input**: Query is empty or too short
