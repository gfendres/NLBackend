# Integrations — How to configure external services

Integration files define connections to external APIs. The framework reads these files and makes real HTTP calls when a workflow step says "Send email" or "Call webhook."

## File naming

Name files after the service: `email.md`, `stripe.md`, `slack.md`, `webhook.md`.

## Required sections

### 1. Provider
Service name and base URL.

### 2. Authentication
How to authenticate. Always reference an environment variable — never put actual secrets in markdown.

### 3. Available Actions
List of operations (each as an H3 sub-heading) with input parameters.

### 4. Error Handling
How to handle HTTP errors (retry, fail, ignore).

## Example: Email via Resend

```markdown
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
- **from**: defaults to noreply@mydomain.com

## Error Handling

- If the API returns 429 (rate limited): wait 2 seconds and retry once
- If the API returns 5xx: log the error, return failure to caller
- If the API times out after 10 seconds: treat as failure
```

## Example: Generic Webhook

```markdown
# Webhook Integration

## Provider

Custom (https://hooks.example.com)

## Authentication

API key stored in environment variable WEBHOOK_SECRET

## Available Actions

### Send Event
- **event**: event type string (required)
- **payload**: JSON object (required)

## Error Handling

- If the API returns 5xx: wait 1 second and retry once
- If the API returns 4xx: log the error, do not retry
```

## How integrations are used

Workflows reference integrations by name in `call_integration` steps:

```markdown
## Steps
1. Create the user record
2. Send welcome email via email integration
```

The runtime resolves "email integration" to the `email.md` file and calls the matching action.
