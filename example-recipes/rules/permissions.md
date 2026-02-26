# Permissions

## Roles

- **Viewer**: Can read recipes, reviews, and user profiles. Can save favorites.
- **Editor**: Everything a viewer can do, plus create and edit their own recipes and reviews.
- **Admin**: Everything an editor can do, plus manage users, edit any recipe, and delete anything.

## Ownership Rules

- Users can only edit their own recipes, unless they are an admin
- Users can only delete their own reviews, unless they are an admin
- Users can only update their own profile

## Rate Limits by Role

- Viewer: 60 requests per minute
- Editor: 120 requests per minute
- Admin: no rate limit
