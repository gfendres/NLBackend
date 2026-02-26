# Email Integration

## Provider

Resend (https://api.resend.com)

## Authentication

API key stored in environment variable RESEND_API_KEY

## Available Actions

### Send Email
- **to**: email address (required)
- **subject**: text (required)
- **body**: text or html (required)
- **from**: defaults to noreply@recipes.example.com

### Send Template
- **to**: email address (required)
- **template**: one of "welcome", "recipe-published", "new-review" (required)
- **variables**: key-value pairs for template rendering

## Error Handling

- If the API returns 429 (rate limited): wait 2 seconds and retry once
- If the API returns 5xx: log the error, return failure to caller
- If the API times out after 10 seconds: treat as failure
