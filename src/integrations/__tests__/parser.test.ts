import { describe, test, expect } from "bun:test";
import { parseIntegration } from "../parser.ts";

const EMAIL_MD = `# Email Integration

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

### Send Template
- **to**: email address (required)
- **template**: one of "welcome", "reset-password" (required)

## Error Handling

- If the API returns 429 (rate limited): wait 2 seconds and retry once
- If the API returns 5xx: log the error, return failure to caller
- If the API times out after 10 seconds: treat as failure
`;

describe("parseIntegration", () => {
  test("extracts provider name and base URL", () => {
    const result = parseIntegration(EMAIL_MD, "email");
    expect(result.provider).toBe("Resend");
    expect(result.baseUrl).toBe("https://api.resend.com");
  });

  test("extracts authentication config", () => {
    const result = parseIntegration(EMAIL_MD, "email");
    expect(result.auth.method).toBe("api_key");
    expect(result.auth.envVar).toBe("RESEND_API_KEY");
    expect(result.auth.location).toBe("header");
  });

  test("extracts available actions", () => {
    const result = parseIntegration(EMAIL_MD, "email");
    expect(result.actions).toHaveLength(2);
    expect(result.actions[0]!.name).toBe("Send Email");
    expect(result.actions[0]!.method).toBe("POST");
    expect(result.actions[0]!.inputs).toHaveLength(4);
  });

  test("marks required inputs correctly", () => {
    const result = parseIntegration(EMAIL_MD, "email");
    const sendEmail = result.actions[0]!;
    const toInput = sendEmail.inputs.find((i) => i.name === "to");
    const fromInput = sendEmail.inputs.find((i) => i.name === "from");
    expect(toInput?.required).toBe(true);
    expect(fromInput?.required).toBe(false);
  });

  test("extracts error handling policies", () => {
    const result = parseIntegration(EMAIL_MD, "email");
    expect(result.errorHandling.length).toBeGreaterThanOrEqual(2);

    const retryPolicy = result.errorHandling.find((p) => p.condition === "429");
    expect(retryPolicy?.action).toBe("retry");
    expect(retryPolicy?.retryDelayMs).toBe(2000);

    const failPolicy = result.errorHandling.find((p) => p.condition === "5xx");
    expect(failPolicy?.action).toBe("ignore"); // "log the error" maps to ignore
  });
});
