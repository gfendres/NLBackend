# Get My Profile

**Auth:** Authenticated
**Tier:** 1

## What it does

Returns the profile of the currently authenticated user,
including their recipe count and favorites count.

## Input

No input parameters required. The user is identified from the
authentication token.

## Output

Returns the full user object with all profile fields.

## Errors

- **not_authenticated**: No valid auth token provided
- **not_found**: User record not found
