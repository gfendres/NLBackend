# User CRUD Tests

## Create user with defaults
- Given an authenticated user with role "admin"
- When calling users_create with:
    - username: "testuser"
    - email: "test@example.com"
- Then response contains field "id"
- And response field "username" equals "testuser"

## Create user with explicit role
- Given an authenticated user with role "admin"
- When calling users_create with:
    - username: "adminuser"
    - email: "admin@example.com"
    - role: "admin"
- Then response contains field "id"
- And response field "role" equals "admin"
