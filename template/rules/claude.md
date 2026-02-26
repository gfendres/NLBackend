# Rules — How to define business rules

Rules define policies that apply across multiple actions: who can do what, what data is valid, rate limits, and custom business logic. Rules are enforced automatically before any action runs.

## File naming

Name rule files after their domain:

| File | Purpose |
|------|---------|
| `permissions.md` | Role-based and ownership access control |
| `validation.md` | Cross-field and cross-entity validation |
| `rate-limits.md` | Request throttling |
| `pricing.md` | Cost calculations, discounts |
| `notifications.md` | When to send notifications |
| `{domain}.md` | Any custom business rules |

## Writing rules

Rules are written as **declarative statements** organized under headings. Each rule should be a single, unambiguous statement that can be evaluated as true or false.

### Good rules (clear, unambiguous)

```markdown
- Users can only edit their own recipes, unless they are an admin
- The rating field must be between 1 and 5
- Viewers: 60 requests per minute
```

### Bad rules (vague, ambiguous)

```markdown
- Users should have appropriate access        ← what's "appropriate"?
- Recipes should be validated                  ← validated how?
- Don't allow too many requests                ← how many is too many?
```

## Example: permissions.md

```markdown
# Permissions

## Roles

- **Viewer**: Can read recipes, reviews, and user profiles. Can save favorites.
- **Editor**: Everything a viewer can do, plus create and edit their own recipes.
- **Admin**: Everything an editor can do, plus manage users and delete anything.

## Ownership Rules

- Users can only edit their own recipes, unless they are an admin
- Users can only delete their own reviews, unless they are an admin
- Users can only update their own profile
```

## Example: validation.md

```markdown
# Validation Rules

## Recipe Validation

- A recipe must have at least one ingredient and one step to be published
- Recipe titles must be unique per author
- The difficulty field only accepts "easy", "medium", or "hard"

## Review Validation

- Users cannot review their own recipes
- Each user can only leave one review per recipe
- Rating must be between 1 and 5
```

## How rules are compiled

Rules are compiled using the LLM (not rule-based like schemas). The LLM converts each rule into a condition that the runtime evaluates. This means you can write rules in natural English — you don't need exact keywords. But be specific.

## Tips

- Start with `permissions.md` — it's the most important rule file
- Add `validation.md` when you have cross-field or cross-entity constraints
- Only add rate limits if the user asks for them
- Every rule should be testable: given a specific request, does the rule pass or fail?
