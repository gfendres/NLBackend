# Config — Server and runtime configuration

The `config/` folder holds configuration files that control how the NLBackend server behaves at runtime.

## server.md (required)

This is the only required config file. It tells the framework which LLM provider to use for compiling actions, rules, and workflows, and for runtime Tier 3 operations.

### Template

```markdown
# Server Configuration

## LLM Provider

- **Provider:** Anthropic
- **Model for compilation:** claude-sonnet-4-6-20250929
- **Model for runtime (Tier 3):** claude-sonnet-4-6-20250929
- **API key:** Environment variable ANTHROPIC_API_KEY
- **Temperature:** 0
```

### Recognized fields

| Field | Description | Example |
|-------|------------|---------|
| Provider | LLM service (currently only Anthropic) | `Anthropic` |
| Model for compilation | Model used to compile actions/rules/workflows | `claude-sonnet-4-6-20250929` |
| Model for runtime | Model used for Tier 3 per-request reasoning | `claude-sonnet-4-6-20250929` |
| API key | Environment variable name holding the API key | `Environment variable ANTHROPIC_API_KEY` |
| Temperature | LLM temperature (0 = deterministic) | `0` |
| Max tokens | Max tokens per LLM call (optional, default 4096) | `4096` |

### Important

- **Never put actual API keys in config files.** Always reference an environment variable.
- Temperature `0` is recommended for compilation (deterministic output)
- You can use different models for compilation and runtime — a smaller model for compilation is fine since the output is structured JSON
