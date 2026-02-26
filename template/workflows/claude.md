# Workflows — How to define multi-step processes

Workflows coordinate multiple actions and data changes into a single logical process. Use them when an operation involves more than one entity or has side effects.

## File naming

Name workflow files after the process: `publish-recipe.md`, `user-registration.md`, `checkout.md`.

## Required sections

### 1. Title (H1 heading)
The workflow name.

### 2. Trigger
When this workflow runs. Use `**Trigger:**` followed by one of:
- An action completing: `When recipes_create succeeds`
- A field changing: `When a recipe's published field is set to true`
- Manual: omit the trigger (run via `run_workflow` tool)

### 3. Steps
A numbered list of steps in execution order. Each step is a plain-English instruction.

### 4. On Failure
What to do when a step fails. This is the **saga compensation** — each step commits independently, and on failure the workflow runs undo actions.

## Step types

The compiler recognizes these patterns in step descriptions:

| Pattern | Step type | Example |
|---------|-----------|---------|
| Create/Update/Delete/Set... | Database write | "Set published to true" |
| Validate/Verify/Ensure... | Check (fails workflow if false) | "Validate the recipe has a title" |
| If.../Based on.../Depending on... | Decision branch | "If user has admin role, skip review" |
| Do these in parallel: | Parallel execution | List of sub-steps |
| Wait for.../After... | Wait | "Wait for email confirmation" |
| Send/Call/Notify... | Integration call | "Send welcome email" |

## Example

```markdown
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
```

## Example with parallel steps

```markdown
# User Registration

**Trigger:** auth_register succeeds

## Steps

1. Create the user record in the database
2. Generate a verification token
3. Do these in parallel:
   - Send welcome email via email integration
   - Create default user preferences record
   - Log the registration event
4. Return the user object (without token)

## On Failure

- If email sending fails: complete registration, flag as "email_unverified"
- If any database write fails: mark user as "registration_incomplete"
```

## Tips

- Keep workflows short — 3–7 steps is ideal
- Each step should do one thing
- Design steps to be **idempotent** (safe to retry)
- Always include an On Failure section for workflows that modify data
- Only create workflows for processes that span multiple entities or have side effects
- Basic single-entity CRUD doesn't need a workflow
