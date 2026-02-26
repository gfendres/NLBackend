# NLBackend — Design Document & Specification

**Natural Language Backend Framework**

Version 1.1 · February 2026 · Draft for internal review

-----

## Table of Contents

1. [Executive Summary](#1-executive-summary)
1. [Architecture Overview](#2-architecture-overview)
1. [Project Structure Specification](#3-project-structure-specification)
1. [Schema Specification](#4-schema-specification)
1. [Action Specification](#5-action-specification)
1. [Rules Specification](#6-rules-specification)
1. [Workflow Specification](#7-workflow-specification)
1. [Database Specification](#8-database-specification)
1. [Integrations Specification](#9-integrations-specification)
1. [Testing Specification](#10-testing-specification)
1. [MCP Server Specification](#11-mcp-server-specification)
1. [Creation & Development Flow](#12-creation--development-flow)
1. [Agents (Optional, Future)](#13-agents-optional-future)
1. [Scalability & Evolution Path](#14-scalability--evolution-path)
1. [Security Considerations](#15-security-considerations)
1. [Implementation Plan](#16-implementation-plan)
1. [Appendix A: Glossary](#appendix-a-glossary)
1. [Appendix B: File Extension Reference](#appendix-b-file-extension-reference)

-----

## 1. Executive Summary

NLBackend is an open-source framework that allows anyone to define, build, and run a fully functional backend using nothing but natural language. Instead of writing code in traditional programming languages, developers describe their data models, actions, business rules, and workflows in Markdown and JSON files organized in a conventional folder structure.

A single, generic MCP (Model Context Protocol) server reads this folder structure and exposes it as a set of MCP tools that any LLM can call directly. The LLM interprets the natural language definitions at compile time (when files change) and, for complex operations, at runtime. The file-based database uses JSON documents organized in folders, making the entire backend git-native, human-readable, and trivially hostable on GitHub or locally.

The framework is designed for a world moving toward no-code and natural language programming. It targets personal projects, prototypes, internal tools, and small-team applications where the priority is speed of creation, ease of understanding, and zero friction deployment. The primary consumers of the backend are LLMs — the interface is MCP, not HTTP.

### 1.1 Design Principles

- **Human-readable above all.** Every file in the project should be understandable by a non-technical person.
- **Git-native.** The entire backend, including its data, lives in files that work with version control, pull requests, branching, and diffs.
- **Convention over configuration.** The folder structure IS the configuration. Drop a file in the right place and it works.
- **Progressive complexity.** Start simple, add sophistication only when needed. The framework should never force complexity on small projects.
- **LLM-first interface.** The backend is consumed by LLMs via MCP tools. The action definitions are optimized for LLM comprehension, not human REST conventions.
- **LLM-assisted, not LLM-dependent.** The compile step reduces runtime LLM calls to near zero for standard operations, keeping costs low and responses fast.
- **Single-artifact deployment.** One folder, one MCP server process. That is the entire deployment.

### 1.2 Target Users & Scope

The initial target is individual developers and small teams (1–5 people) building personal tools, prototypes, MVPs, and internal applications. The framework explicitly does not target high-traffic production systems in v1. Expected scale is up to roughly 100 requests per minute, a few thousand database records, and a handful of concurrent users.

-----

## 2. Architecture Overview

The system consists of three layers, each with a clearly defined responsibility. Understanding these layers is essential to understanding how natural language becomes a running backend.

### 2.1 The Three Layers

|Layer                |Responsibility                                                      |When It Runs                            |
|---------------------|--------------------------------------------------------------------|----------------------------------------|
|**Definition Layer** |Markdown and JSON files that describe the backend                   |Written by human or LLM at design time  |
|**Compilation Layer**|Parses natural language into deterministic execution plans using LLM |On file change (watch mode) or on-demand|
|**Runtime Layer**    |MCP server that handles tool calls using compiled plans + optional LLM|Continuously while server is running   |

### 2.2 Request Flow

When an LLM calls an MCP tool exposed by the server, it follows this path:

1. The **tool router** matches the tool name against compiled action definitions.
1. **Input validation** runs against the compiled schema rules. Invalid inputs are rejected immediately with no LLM involvement.
1. **Permission checks** run against compiled authorization rules. Unauthorized calls are rejected.
1. For **Tier 1** (deterministic) operations, the compiled execution plan runs directly: read/write JSON files, apply transformations, return response.
1. For **Tier 2** (templated) operations, a cached LLM-generated recipe is applied. If no cache exists, the LLM generates one and caches it.
1. For **Tier 3** (dynamic) operations, the relevant markdown context is assembled and sent to the LLM for interpretation. The response is returned to the caller.
1. If the action references a **workflow**, the workflow engine executes the steps (potentially including integration calls) in the defined order.

### 2.3 The Compilation Model

The compilation step is the key innovation that makes this framework practical. Without it, every request would require an LLM call, making the system slow and expensive. With it, the vast majority of requests execute deterministically with zero LLM involvement.

Compilation happens automatically when the MCP server detects file changes (via filesystem watching) or can be triggered manually. The compiled output is stored in a `.compiled/` directory that is gitignored. It can always be regenerated from the source markdown files.

#### 2.3.1 Compilation Pipeline

The compiler has two modes depending on the source material:

**Rule-based compilation (schemas):** Schema files use a structured-enough format (with recognized keywords like `required`, `optional`, `default`, `enum`, `min`, `max`, `unique`, `indexed`, `reference to`) that they can be parsed deterministically without an LLM. The schema compiler is a conventional TypeScript parser that matches these keywords and produces JSON validation definitions.

**LLM-powered compilation (actions, rules, workflows):** Action files, rule files, and workflow files contain natural language descriptions that require LLM interpretation to convert into deterministic execution plans. The compiler sends each file (along with its referenced schemas and rules as context) to the LLM with a structured compilation prompt. The LLM returns a JSON execution plan that the runtime can execute without further LLM involvement.

The compilation prompt follows this structure:

1. **System context:** The NLBackend compilation instructions (what format the output must follow).
2. **Referenced schemas:** The compiled JSON schemas for all entities mentioned in the file.
3. **Referenced rules:** Any rule files that apply to this action.
4. **Source file:** The markdown definition being compiled.
5. **Output schema:** A strict JSON schema the LLM must conform its response to.

The compilation output for each action is a JSON execution plan containing: the tool name, input schema, validation rules, a sequence of database operations and transformations, error conditions, and response format.

#### 2.3.2 Tier Classification

|Tier                 |Description                                                   |LLM Usage        |Examples                                                              |
|---------------------|--------------------------------------------------------------|-----------------|----------------------------------------------------------------------|
|**Tier 1: Static**   |Operations fully describable as deterministic rules           |Compile-time only|CRUD, validation, auth checks, simple queries                         |
|**Tier 2: Templated**|Operations needing one-time LLM interpretation, then cacheable|Once, then cached|Complex search, data transformation, report generation                |
|**Tier 3: Dynamic**  |Operations requiring per-request LLM reasoning                |Every request    |Natural language queries, complex decisions, freeform input processing|

The compiler analyzes each action definition and classifies it. Most CRUD actions compile to Tier 1 automatically. Actions that reference phrases like "interpret", "understand", "decide based on context", or "natural language" are classified as Tier 3. Everything in between defaults to Tier 2.

Developers can override the classification with an explicit directive in the action file: `Tier: 1` forces deterministic execution, `Tier: 3` forces per-request LLM involvement.

#### 2.3.3 Tier 2 Cache Invalidation

Tier 2 cached plans are keyed by a hash of the action file content plus all referenced schema and rule files. Any change to any dependency automatically invalidates the cache, triggering a fresh LLM-generated plan on the next call. This ensures cached plans always reflect the current definitions.

-----

## 3. Project Structure Specification

Every NLBackend project follows a mandatory folder structure. The framework enforces these conventions, and the MCP server expects them. Files outside the recognized structure are ignored.

### 3.1 Root Structure

```
my-backend/
├── project.md              # Project identity & overview
├── claude.md               # LLM instructions for working on this project
├── schema/                 # Data model definitions
├── actions/                # Action (MCP tool) definitions
├── rules/                  # Business rules & policies
├── workflows/              # Multi-step process definitions
├── integrations/           # External service configurations
├── db/                     # File-based data store
├── tests/                  # Natural language test definitions
├── config/                 # Runtime configuration
├── agents/                 # (Optional) Sub-agent role definitions
└── .compiled/              # Auto-generated, gitignored
```

### 3.2 The claude.md Convention

Every folder may contain a `claude.md` file. This file serves as a context document that tells the LLM how to interpret the files in that folder. It is analogous to a README but specifically targeted at LLM consumption. These files are critical for avoiding context overload: the MCP server only loads the `claude.md` files relevant to the current operation, never the entire project.

**Root `claude.md`** is special: it contains instructions for Claude (or any LLM) when helping a developer build or modify the project. It is NOT loaded during runtime request handling. It is only used during the creation and editing workflow.

**Folder-level `claude.md`** files are loaded by the MCP server when it needs to interpret files in that folder. They contain conventions, format explanations, and constraints specific to that folder.

### 3.3 File Naming Conventions

- **Schema files:** Named after the entity in singular form. Example: `user.md`, `product.md`, `order.md`
- **Action files:** Named after the operation. Example: `list.md`, `create.md`, `search.md`, `delete.md`
- **Action folders:** Named after the resource collection in plural form, while schema filenames remain singular. Example: schema `user.md` maps to action folder `actions/users/`. If pluralization is ambiguous, projects must define the canonical folder name explicitly in `actions/claude.md`.
- **Rule files:** Named after the domain. Example: `permissions.md`, `validation.md`, `pricing.md`
- **Workflow files:** Named after the process. Example: `checkout.md`, `onboarding.md`, `password-reset.md`
- **Test files:** Mirror the action structure with `.test.md` suffix. Example: `tests/users/create.test.md`
- **Database files:** Named `{entity}-{id}.json`. Example: `user-001.json`, `product-abc123.json`

-----

## 4. Schema Specification

Schema files define the data models of the backend. Each file describes one entity (a "table" in traditional database terms). The schema is the single source of truth for what data looks like; actions, rules, and the database all reference it.

### 4.1 Schema File Format

Every schema file must include the following sections. The format uses natural language enhanced with a small set of **recognized keywords** that the rule-based compiler can parse deterministically. These sections must be present for the compiler to extract a usable data model.

**Entity Name:** The H1 heading of the file. Must match the filename (singular). This becomes the collection name in the database.

**Description:** A plain-English paragraph explaining what this entity represents and when it is created/used.

**Fields:** A list of fields with their type, constraints, and default values. Each field must specify: name, type, and relevant constraints using the recognized keywords below.

**Relationships:** How this entity relates to other entities. Must use the phrasing "has many", "belongs to", or "has one" followed by the related entity name.

### 4.2 Recognized Schema Keywords

The schema compiler matches these keywords deterministically. They can appear in any order after the field type.

|Keyword               |Meaning                                    |Example                                                 |
|-----------------------|-------------------------------------------|--------------------------------------------------------|
|`required`             |Field must be present                      |`required string`                                       |
|`optional`             |Field may be omitted                       |`optional string`                                       |
|`default <value>`      |Value used when field is omitted           |`default "medium"`                                      |
|`enum (<values>)`      |Restricted to listed values                |`enum ("easy", "medium", "hard")`                       |
|`min <n>` / `max <n>`  |Numeric or length bounds                   |`min 1, max 200`                                        |
|`unique`               |No two records may share this value        |`unique`                                                |
|`indexed`              |Build a query index for this field         |`indexed`                                               |
|`reference to <Entity>`|Foreign key to another entity              |`reference to User`                                     |
|`auto`                 |Value generated by the runtime             |`auto uuid`, `auto timestamp`                           |
|`immutable`            |Cannot be changed after creation           |`immutable`                                             |

### 4.3 Supported Field Types

|Type       |Description                          |Compiled To                                 |
|-----------|-------------------------------------|--------------------------------------------|
|`string`   |Text value                           |JSON string with length/pattern validation  |
|`number`   |Numeric value (integer or decimal)   |JSON number with min/max validation         |
|`boolean`  |True or false                        |JSON boolean                                |
|`date`     |ISO 8601 timestamp                   |JSON string with date format validation     |
|`enum`     |One of a defined set of values       |JSON string with allowed-values check       |
|`array`    |List of values (specify item type)   |JSON array with item validation             |
|`object`   |Nested structure (specify sub-fields)|Nested JSON object                          |
|`reference`|Pointer to another entity by ID      |JSON string with referential integrity check|
|`uuid`     |Auto-generated unique identifier     |Generated at creation, immutable            |

### 4.4 Example Schema File

```markdown
# Recipe

A recipe is a set of instructions for preparing a dish, submitted
by a registered user.

## Fields

- **id**: auto uuid, immutable
- **title**: required string, min 3, max 200
- **description**: optional string, max 2000
- **ingredients**: required array of objects, each with:
    - name (required string)
    - quantity (required string, e.g. "2 cups")
- **steps**: required array of strings, min 1 item
- **difficulty**: optional enum ("easy", "medium", "hard"), default "medium"
- **author_id**: required reference to User, indexed
- **tags**: optional array of strings
- **created_at**: auto timestamp, immutable
- **updated_at**: auto timestamp on change

## Relationships

- Belongs to a User (via author_id)
- Has many Reviews
- Has many Favorites (users who saved it)
```

### 4.5 Compiled Schema Output

The compiler transforms each schema file into a JSON definition stored in `.compiled/schemas/{entity}.json`. This compiled schema is used by the runtime for validation, database operations, and type checking. Because the schema format uses recognized keywords, the compilation is **deterministic and rule-based** — no LLM is needed for schema compilation.

### 4.6 Schema Evolution

When a developer adds, removes, or modifies a field in a schema file, existing records in the database may not match the new schema. The framework handles this with **lazy migration**: records are patched on read to conform to the current schema. Missing fields receive their default value (or `null` if no default is defined), and removed fields are stripped from the response but not deleted from the file. This ensures zero-downtime schema changes without a migration step.

For breaking changes (renaming a field, changing a type), the developer should create a one-time workflow that migrates existing records explicitly.

-----

## 5. Action Specification

Action files define the operations the backend can perform. Each file describes one MCP tool: what it accepts, what it does, and what it returns. Actions are the primary interface through which LLMs interact with the backend.

### 5.1 Tool Naming Convention

Each action file maps to an MCP tool. The tool name is derived from the folder structure:

```
actions/{entity}/{operation}.md  →  {entity}_{operation}
```

Examples:

- `actions/recipes/create.md` → `recipes_create`
- `actions/recipes/list.md` → `recipes_list`
- `actions/auth/login.md` → `auth_login`
- `actions/users/me.md` → `users_me`

The tool name can be overridden with an explicit `Tool:` directive in the action file.

### 5.2 Action File Format

Every action file must include the following sections:

**Title:** The H1 heading. A human-readable name for the action.

**Tool:** (Optional) Override the auto-derived tool name.

**Auth:** Authorization requirement. One of: "Public" (no auth), "Authenticated" (valid token required), or a specific role requirement (e.g., "Admin only"). Authentication is delegated to external providers (see §15.1).

**Tier:** (Optional) Override automatic tier classification. `Tier: 1` forces deterministic execution, `Tier: 3` forces per-request LLM involvement.

**What it does:** Plain-English description of the action's behavior. For Tier 1 operations, this must be precise enough to compile to deterministic rules. For Tier 3, it can be more abstract.

**Input:** Parameters the action accepts. Each must specify name, type, required/optional, and constraints.

**Output:** Description of the response structure.

**Errors:** Expected error conditions and their corresponding codes and messages.

### 5.3 Action Organization

Actions are organized in subfolders matching the resource name.

```
actions/
├── claude.md
├── auth/
│   ├── login.md
│   ├── register.md
│   └── refresh-token.md
├── users/
│   ├── me.md
│   ├── update.md
│   └── list.md
└── recipes/
    ├── create.md
    ├── list.md
    ├── get.md
    ├── update.md
    ├── delete.md
    └── search.md
```

### 5.4 Example Action File

```markdown
# Create Recipe

**Auth:** Authenticated
**Tier:** 1

## What it does

Creates a new recipe. The authenticated user is automatically set
as the author. Validates all fields against the Recipe schema.
The recipe starts as a draft unless explicitly published.

## Input

- **title** (required): The recipe name
- **description** (optional): A short summary
- **ingredients** (required): Array of {name, quantity}
- **steps** (required): Array of instruction strings
- **difficulty** (optional): "easy", "medium", or "hard"
- **tags** (optional): Array of tag strings

## Output

Returns the full recipe object with generated id, author_id,
and timestamps.

## Errors

- **invalid_input**: Missing required fields or validation failures
- **not_authenticated**: No valid auth token provided
- **conflict**: A recipe with the same title by this author exists
```

### 5.5 Standard Error Format

All actions use a consistent error response format:

```json
{
  "error": {
    "code": "invalid_input",
    "message": "Human-readable description of what went wrong",
    "details": {
      "field": "title",
      "constraint": "required"
    }
  }
}
```

The `code` is a machine-readable snake_case identifier. The `message` is a human-readable explanation. The `details` object is optional and provides field-level specifics when applicable.

### 5.6 Pagination & Filtering

List actions support pagination and filtering through standard input parameters. The framework provides a default convention that compiled list actions follow:

- **limit** (optional number, default 20, max 100): Number of records to return.
- **offset** (optional number, default 0): Number of records to skip.
- **sort_by** (optional string): Field name to sort by.
- **sort_order** (optional, "asc" or "desc", default "asc"): Sort direction.
- **filter** (optional object): Key-value pairs where keys are field names and values are the required values. Indexed fields use the index; non-indexed fields trigger a linear scan.

List responses include pagination metadata:

```json
{
  "data": [...],
  "pagination": {
    "total": 42,
    "limit": 20,
    "offset": 0,
    "has_more": true
  }
}
```

Action files can override these defaults or add custom filtering by describing the behavior in the "What it does" section.

-----

## 6. Rules Specification

Rules define business logic that applies across multiple actions. Instead of embedding authorization checks, validation constraints, and business policies inside each action, they are centralized in rule files and automatically enforced by the runtime.

### 6.1 Rule Categories

|Category     |File              |Purpose                                                                |
|-------------|------------------|-----------------------------------------------------------------------|
|Permissions  |`permissions.md`  |Who can do what, role-based and ownership-based access control         |
|Validation   |`validation.md`   |Cross-field and cross-entity validation rules beyond basic schema types|
|Rate Limiting|`rate-limits.md`  |Request throttling by role, action, or caller                          |
|Pricing      |`pricing.md`      |Cost calculations, discount rules, tax logic                           |
|Notifications|`notifications.md`|When and how to send notifications as side effects                     |
|Custom       |`{domain}.md`     |Any domain-specific business rules                                     |

### 6.2 Rule File Format

Rules are written as a series of declarative statements organized under headings. Each rule should be a single, unambiguous statement that can be evaluated as true or false given a request context. Ambiguous rules that could be interpreted multiple ways will cause the compiler to flag a warning.

Rules are compiled using the **LLM-powered compiler** (not rule-based), because natural language business rules require interpretation. The compiler converts each rule into a decision tree node in the compiled rule engine.

### 6.3 Example Rule File

```markdown
# Permissions

## Roles

- **Viewer**: Can read recipes and leave reviews on any recipe
- **Editor**: Everything a viewer can do, plus create and edit their own recipes
- **Admin**: Everything an editor can do, plus manage users, edit any recipe, and delete anything

## Ownership Rules

- Users can only edit their own recipes, unless they are an admin
- Users can only delete their own reviews, unless they are an admin
- Users can only update their own profile

## Rate Limits by Role

- Viewer: 60 requests per minute
- Editor: 120 requests per minute
- Admin: no rate limit
```

### 6.4 Rule Enforcement

Rules are compiled into a rule engine that runs before action logic executes. The compiled rule engine is a decision tree that evaluates rules in priority order: permissions first, then validation, then rate limits, then custom rules. If any rule fails, the request is rejected with a standard error before action logic runs.

Rule precedence is determined by specificity: a rule targeting a specific action overrides a general rule. A rule targeting a specific role overrides a rule targeting "all users". Conflicts between rules of equal specificity are flagged by the compiler as errors that must be resolved by the developer.

-----

## 7. Workflow Specification

Workflows define multi-step processes that coordinate multiple actions, database changes, and integration calls into a single logical unit. They are the natural language equivalent of orchestration code.

### 7.1 Workflow File Format

A workflow file describes a sequence (or graph) of steps. Each step is a natural language instruction that references an operation: calling an action, reading/writing data, calling an integration, or making a decision. Workflows are compiled using the **LLM-powered compiler**.

### 7.2 Step Types

|Step Type|Syntax Indicator                             |Description                                       |
|---------|---------------------------------------------|--------------------------------------------------|
|Action   |"Create/Update/Delete/Send…"                 |Performs a data mutation or side effect           |
|Check    |"Validate/Verify/Ensure/Confirm…"            |Evaluates a condition, fails the workflow if false|
|Decision |"If…/Based on…/Depending on…"                |Branches the workflow based on a condition        |
|Parallel |"Do these in parallel:" / "At the same time:"|Executes listed sub-steps concurrently            |
|Wait     |"Wait for…/After…completes"                  |Pauses until a condition is met or time elapses   |

### 7.3 Workflow Error Handling: Saga Pattern

Workflows use a **saga pattern** instead of traditional database transactions. Each step commits independently. If a step fails, the workflow stops and executes **compensation steps** defined in the "On Failure" section. This avoids the complexity and fragility of file-based rollbacks.

Why not atomic transactions in v1: true atomicity over a file-based database requires coordinating file writes, index updates, and a transaction log — if the process crashes between a failed step and the rollback, data is left in an inconsistent state. The saga pattern is simpler, more resilient, and honest about its guarantees.

Each workflow step should be designed to be **idempotent** when possible, so that retrying a failed workflow from the point of failure does not produce duplicates or side effects.

For non-critical workflows, the "On Failure" section is optional. The workflow simply stops at the failed step and logs the error. The workflow state is persisted so it can be retried from the point of failure.

### 7.4 Example Workflow

```markdown
# User Registration

**Trigger:** auth_register succeeds

## Steps

1. Create the user record in the database
2. Generate a verification token (random string, 64 chars)
3. Store the token with a 24-hour expiry
4. Do these in parallel:
   - Send welcome email via email integration
     (template: "welcome", include verification link)
   - Create default user preferences record
   - Log the registration event for analytics
5. Return the user object (without token or password hash)

## On Failure

- If email sending fails: still complete registration, but
  flag the user as "email_unverified" and queue a retry
- If any database write fails: mark the user record as
  "registration_incomplete" and log for manual review
- If token generation fails: complete registration without
  email verification, flag for manual verification
```

-----

## 8. Database Specification

The database is a folder of JSON files. Each entity has its own subfolder, and each record is a separate JSON file. This approach trades query performance for simplicity, portability, and git-friendliness. It is appropriate for the target scale of hundreds to low thousands of records.

### 8.1 Database Structure

```
db/
├── claude.md               # Database conventions
├── _meta.json              # Database metadata (created, version)
├── _log/                   # Write-ahead log (append-only)
│   └── 2026-02-26T10-30-00-create-user-001.json
├── users/
│   ├── _index.json         # Collection metadata & indexes
│   ├── user-001.json
│   └── user-002.json
├── recipes/
│   ├── _index.json
│   ├── recipe-abc.json
│   └── recipe-def.json
└── reviews/
    ├── _index.json
    └── review-xyz.json
```

### 8.2 Record Format

Each record file contains a single JSON object conforming to its entity schema. The runtime adds system fields automatically:

- **_id:** The record's unique identifier (matches the filename without `.json`)
- **_created_at:** ISO 8601 timestamp of creation
- **_updated_at:** ISO 8601 timestamp of last modification
- **_version:** Integer version counter, incremented on every update (for optimistic concurrency)

### 8.3 Write Strategy: Atomic File Rename

All write operations use the **write-to-temp-then-rename** pattern:

1. Write the new record content to a temporary file (`{entity}-{id}.tmp.json`) in the same directory.
2. Call `fs.rename()` to atomically replace the target file with the temp file.

On most filesystems, `rename` is atomic — the file either has the old content or the new content, never a partial write. This eliminates the risk of corrupted records from crashes during writes.

For new records, the temp file is renamed to the final path. For updates, it replaces the existing file. For deletes, the file is removed after logging.

### 8.4 Index Strategy: Lazy In-Memory Indexes

Instead of maintaining `_index.json` files on every write (which creates a wide lock window and I/O bottleneck), the framework builds indexes **lazily on server start**:

1. On startup, the runtime scans each collection folder and builds in-memory indexes for: reference fields (foreign keys), enum fields, boolean fields, and any field marked `indexed` in the schema.
2. Indexes are maintained in memory as writes occur (updating the in-memory index is fast and lock-free).
3. The in-memory indexes are **persisted to `_index.json` periodically** (every 30 seconds or on graceful shutdown) as a warm-start optimization.
4. On next startup, if `_index.json` exists and the file count matches, it is loaded directly. Otherwise, a full rebuild is triggered.

This approach simplifies writes (no index file update per write), eliminates the index corruption risk, and keeps query performance good for the target scale.

### 8.5 Write-Ahead Log

Every write operation (create, update, delete) is recorded in the `_log/` folder as an append-only entry **before** the actual write occurs. Log entries contain the operation type, the entity and record ID, the previous state (for compensation), the new state, a timestamp, and an operation ID.

The log enables compensation steps in saga workflows and provides a full audit trail. Log files older than a configurable retention period (default: 30 days) are automatically archived.

### 8.6 Concurrency Control

For the target scale (personal/small team), the framework uses a **per-collection lock** with short hold times. Before any write operation to a collection, the runtime acquires an in-memory lock (a simple mutex). Because writes use the atomic rename pattern and are fast (single file operations), lock contention is minimal.

The in-memory lock is sufficient because NLBackend runs as a **single process**. If a request arrives while a write lock is held, it waits with a short timeout (default: 5 seconds). If the timeout expires, the operation fails with a `busy` error.

For read operations, no locking is needed. A read may see a slightly stale state (before or after a concurrent write), which is acceptable for the target scale. This is **eventual consistency** and is documented as such.

### 8.7 Migration Path

When a project outgrows the file-based database, the schema markdown files serve as the migration spec. Because the data model is already clearly documented in natural language, generating SQL CREATE TABLE statements or ORM definitions is straightforward. The framework will include a built-in migration tool that reads schema files and generates database-specific migration scripts for SQLite and PostgreSQL.

-----

## 9. Integrations Specification

Integrations define connections to external services (email providers, payment processors, storage services, etc.). They are configuration files that tell the MCP server how to call external APIs.

### 9.1 Integration File Format

Each integration file describes one external service with the following sections:

**Provider:** The service name and API base URL.

**Authentication:** How to authenticate (API key, OAuth, etc.) and which environment variable holds the credentials.

**Available Actions:** A list of operations the integration supports, each with its input parameters and expected output.

**Error Handling:** How to handle common failure modes (timeouts, rate limits, invalid responses).

### 9.2 Built-in Integration Adapters

The MCP server includes pre-built adapters for common services. The integration markdown file selects and configures the adapter; no code is written.

|Adapter |Services                 |Actions                                              |
|--------|-------------------------|-----------------------------------------------------|
|Email   |Resend, SendGrid, Mailgun|Send email, send template, check delivery status     |
|Payments|Stripe                   |Create charge, create subscription, refund           |
|Storage |S3, Cloudflare R2        |Upload file, download file, generate signed URL      |
|Webhooks|Any URL                  |Send POST with payload, verify signatures            |
|HTTP    |Any REST API             |Generic GET/POST/PUT/DELETE with configurable headers|

### 9.3 Example Integration File

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

### Send Template
- **to**: email address (required)
- **template**: one of "welcome", "reset-password", "order-confirmation"
- **variables**: depends on template (see workflows that reference this)

## Error Handling

- If the API returns 429 (rate limited): wait 2 seconds and retry once
- If the API returns 5xx: log the error, return failure to caller
- If the API times out after 10 seconds: treat as failure
```

### 9.4 Custom Integrations

For services without a built-in adapter, the HTTP adapter serves as a generic escape hatch. The integration file describes the API endpoints, authentication method, and request/response formats in natural language. The MCP server uses the HTTP adapter to make the calls as described.

-----

## 10. Testing Specification

Tests are written in natural language using a Given-When-Then format. They mirror the action structure and are executed by the MCP server's test runner, which interprets each test scenario and verifies the assertions.

### 10.1 Test File Format

```markdown
# Create Recipe Tests

## Successful creation
- Given an authenticated user with role "editor"
- When calling recipes_create with:
    - title: "Pasta Carbonara"
    - ingredients: [{name: "spaghetti", quantity: "400g"}]
    - steps: ["Boil pasta", "Mix eggs and cheese", "Combine"]
- Then response contains field "id"
- And response field "title" equals "Pasta Carbonara"
- And response field "author_id" equals the authenticated user's id

## Missing title
- Given an authenticated user
- When calling recipes_create with:
    - ingredients: [{name: "flour", quantity: "2 cups"}]
    - steps: ["Mix ingredients"]
- Then error code is "invalid_input"
- And error message mentions "title"

## Not authenticated
- Given no authentication
- When calling recipes_create with valid data
- Then error code is "not_authenticated"

## Duplicate title by same author
- Given an authenticated user who already has a recipe titled "Pasta Carbonara"
- When calling recipes_create with:
    - title: "Pasta Carbonara"
    - ingredients: [{name: "penne", quantity: "400g"}]
    - steps: ["Boil pasta"]
- Then error code is "conflict"
```

### 10.2 Test Execution

Tests run against a clean database state. Before each test file, the runtime creates a fresh database with optional seed data defined in a setup section at the top of the test file. After the test file completes, the test database is discarded.

The test runner uses the compilation step to parse test scenarios into executable sequences. For Tier 1 actions, tests run without any LLM involvement. For Tier 2 and 3 actions, the LLM is used to interpret both the test setup and the assertions.

To keep CI stable, Tier 2/3 tests run in a deterministic test mode by default: pinned model version, fixed low temperature (default: `0`), strict structured output, and snapshot fixtures for expected outputs. Any test that allows non-deterministic variation must declare explicit tolerance rules in the test file.

### 10.3 Test Organization

```
tests/
├── claude.md
├── _seed.md                 # Global seed data for all tests
├── auth/
│   ├── login.test.md
│   └── register.test.md
├── users/
│   └── update.test.md
└── recipes/
    ├── create.test.md
    ├── list.test.md
    ├── search.test.md
    └── delete.test.md
```

-----

## 11. MCP Server Specification

The MCP server is the only piece of traditional code in the framework. It is a thin TypeScript layer that reads any conforming NLBackend project folder and exposes it as a set of MCP tools. It is written once and distributed as an npm package.

### 11.1 Architecture

The MCP server is the **sole interface** to the backend. LLMs interact with it via MCP tool calls. There is no HTTP server, no REST API, no routing layer. The server exposes two categories of tools:

**Project actions:** Dynamically generated from the `actions/` folder. Each action file becomes an MCP tool with the derived name, input schema, and description. These are the business logic tools that LLMs call to interact with the backend's data and workflows.

**System tools:** Built-in management and introspection tools for development and debugging.

### 11.2 System Tools

|Tool            |Purpose                               |Arguments                                |
|----------------|--------------------------------------|-----------------------------------------|
|`query_db`      |Read data from the file database      |collection, filters, sort, limit, offset |
|`mutate_db`     |Write data to the file database       |collection, operation, data              |
|`describe_api`  |Return the full list of available tools and their schemas|(none)                |
|`run_workflow`  |Execute a named workflow              |workflow_name, input_data                |
|`run_tests`     |Execute test suites                   |test_path (optional, runs all if omitted)|
|`compile`       |Trigger recompilation of project files|path (optional, compiles all if omitted) |
|`inspect`       |View compiled state for debugging     |entity (schema/action/rule name)         |
|`explain`       |Dry-run a tool call showing the execution plan|tool_name, input_data           |

### 11.3 The `explain` Tool

The `explain` tool is a debugging aid. Given a tool name and sample input, it returns:

- Which tier the action is classified as.
- The compiled execution plan that would run.
- Which rules would be evaluated and in what order.
- Which schemas are referenced.
- Whether a workflow would be triggered.
- For Tier 2 actions, whether a cached plan exists or a fresh LLM call would be needed.

This enables developers and LLMs to understand **what would happen** before it happens, making the system transparent and debuggable despite the natural language definitions.

### 11.4 Context Management

A critical responsibility of the MCP server is managing LLM context. It must never send the entire project as context for a single request. Instead, it assembles the minimal context needed:

1. The relevant action definition file.
1. The schemas referenced by that action.
1. Any rules that apply (permissions, validation).
1. The relevant workflow if the action triggers one.
1. The integration config if an external call is needed.

This context assembly is guided by the compiled dependency graph, which maps each action to its required context files. For Tier 1 operations, no LLM context is needed at all — the compiled execution plan runs directly.

### 11.5 Server Configuration

The MCP server is configured through `config/` markdown files in the project, plus environment variables for secrets.

```
config/
├── auth.md              # Auth strategy and token validation
├── rate-limits.md       # Global and per-action rate limits
└── server.md            # Port, host, logging level, LLM provider
```

### 11.6 LLM Provider Configuration

The MCP server supports multiple LLM providers for the compilation and runtime interpretation steps. The default is Claude via the Anthropic API. Configuration is done in `config/server.md`:

```markdown
## LLM Provider

- **Provider:** Anthropic
- **Model for compilation:** claude-sonnet-4-5-20250929
- **Model for runtime (Tier 3):** claude-sonnet-4-5-20250929
- **API key:** Environment variable ANTHROPIC_API_KEY
- **Max tokens per request:** 4096
- **Temperature:** 0 (for maximum determinism)
```

### 11.7 Hot Reloading

The MCP server watches the project folder for file changes. When a file is created, modified, or deleted, the server recompiles only the affected files and their dependents. The recompilation is incremental: if `schema/recipe.md` changes, the server recompiles the schema (rule-based), then recompiles all actions that reference the Recipe entity (LLM-powered), then updates the rule engine if any rules reference Recipe fields. The server continues handling tool calls during recompilation using the previous compiled state, then atomically switches to the new state once compilation completes.

Tier 2 caches are invalidated automatically for any action whose dependency hash has changed (see §2.3.3).

-----

## 12. Creation & Development Flow

One of the framework's key differentiators is that the creation process itself is conversational. The user does not need to manually create files — they describe what they want, and the LLM generates the entire project structure.

### 12.1 The Bootstrap Process

1. The user shares the NLBackend framework GitHub repository with Claude (or any capable LLM).
1. Claude reads the framework's root `claude.md`, which contains instructions for how to help build a new backend.
1. Claude asks: "What kind of backend do you want to build? Describe it in a few sentences."
1. The user describes their project in natural language (e.g., "A recipe sharing platform where users can post recipes, save favorites, and leave reviews").
1. Claude generates the complete project: all schema files, action files, rule files, initial workflow definitions, test files, and configuration.
1. The user reviews, requests changes ("Add a difficulty level to recipes", "Make search also filter by cooking time"), and Claude updates the relevant files.
1. When satisfied, the user saves the files to a Git repository and starts the MCP server.

### 12.2 Iterative Development

After the initial creation, development continues conversationally. The user can share their project folder with Claude and request changes: "Add a commenting system to recipes" or "Users should be able to follow other users." Claude understands the existing project context and generates only the necessary additions and modifications, respecting existing conventions and cross-referencing existing schemas and rules.

The MCP server supports hot reloading: when files change (either through direct editing or Claude-generated updates), the server detects the changes, recompiles affected files, and begins serving the updated definitions without a restart.

### 12.3 The Framework claude.md

The framework repository's root `claude.md` is the key file that enables this flow. It contains detailed instructions for the LLM on how to generate conforming project files, what conventions to follow, how to handle ambiguity, and when to ask clarifying questions versus making reasonable defaults. This file is essentially the "teacher" that turns any general-purpose LLM into an NLBackend expert.

```markdown
# NLBackend Framework — Instructions for Claude

You are helping someone build a backend using natural language files.
This is NOT a coding project. Everything is defined in markdown and JSON.

## When someone shares this repo with you:

1. Ask them what their backend should do (1-3 sentences is enough)
2. Generate ALL the necessary files following the conventions
   in each folder's claude.md
3. Start simple — MVP actions, basic schema, essential rules
4. Let them iterate — they'll tell you what to add or change

## Principles:
- Every file should be readable by a non-technical person
- Schemas should use the recognized keywords (required, optional,
  default, enum, min, max, unique, indexed, reference to, auto,
  immutable) for reliable compilation
- Actions should describe behavior, not implementation
- Rules should be unambiguous — if you can interpret it two ways,
  it's not precise enough
- When in doubt, ask the user rather than assuming
```

-----

## 13. Agents (Optional, Future)

The `agents/` folder is reserved for future use and is entirely optional. It defines specialized LLM roles that can handle different aspects of request processing.

### 13.1 When Agents Become Useful

For v1, a single LLM call with well-scoped context handles all Tier 2 and 3 operations. Agents become valuable when:

- The project grows to a point where request complexity benefits from specialization.
- Different steps require different cost/performance tradeoffs (e.g., validation on a cheaper model, complex reasoning on a more capable one).
- Parallel processing of independent concerns would improve response time.

### 13.2 Agent File Format

```markdown
# Validator Agent

**Model:** claude-haiku-4-5-20251001 (fast and cheap)
**Role:** Validate incoming request data

## Instructions

You receive a request body and a schema definition.
Your only job is to check if the data conforms to the schema.
Return a JSON object with:
- valid: true/false
- errors: array of {field, message} (empty if valid)

You do not interpret, transform, or judge the data.
You only validate structure and constraints.
```

The runtime would route different phases of request processing to different agents, assembling the results. This is the sub-agent pattern: the orchestrator (the main MCP server logic) delegates to specialists. The current architecture supports this without modification — the tool calls simply route to different models with different system prompts.

### 13.3 Planned Agent Types

|Agent    |Model Tier        |Purpose                                              |
|---------|------------------|-----------------------------------------------------|
|Validator|Fast/cheap (Haiku)|Schema validation, input sanitization                |
|Router   |Fast/cheap (Haiku)|Request routing and tier classification              |
|Executor |Standard (Sonnet) |Tier 2/3 action logic interpretation                 |
|Reviewer |Capable (Opus)    |Complex business rule evaluation, conflict resolution|

-----

## 14. Scalability & Evolution Path

NLBackend is designed for small scale but architected to not prevent growth. This section documents the known limitations and the path to overcome each one.

### 14.1 Scale Limitations & Mitigations

|Concern           |Current Limit                  |Mitigation Path                                                 |
|------------------|-------------------------------|----------------------------------------------------------------|
|Database size     |~10,000 records per collection |Migrate to SQLite (schema files generate migrations)            |
|Concurrent writes |Single-process, per-collection lock|Replace file locks with SQLite WAL mode or Postgres         |
|Request throughput|~100 req/min                   |Cache compiled plans aggressively; use Tier 1 for most actions  |
|LLM cost          |~$0.01–$0.05 per Tier 3 request|Minimize Tier 3 usage; use cheaper models for simple tasks      |
|Cold start        |~2–5 seconds for index rebuild |Persist index files for warm start; compile only changed files  |
|Complex queries   |In-memory indexes, linear scan fallback|Migrate to SQL for complex joins                        |

### 14.2 Deployment Options

1. **Local development:** Clone repo, set environment variables, run MCP server. The entire backend runs on localhost.
1. **GitHub hosting:** Store the project in a GitHub repo. Use GitHub Actions to deploy the MCP server to any Node.js hosting (Vercel, Railway, Fly.io, a VPS).
1. **Portable:** Since the backend is just files + one server process, it can run anywhere Node.js runs. No database server, no build step, no infrastructure dependencies beyond the LLM API key.

### 14.3 Version 2 Roadmap Considerations

- **SQLite adapter:** Drop-in replacement for the file-based database, same schema files, much higher performance, query capability, and true transaction atomicity.
- **HTTP adapter:** Optional HTTP/REST layer for projects that need to serve frontends or webhooks directly.
- **Multi-model routing:** Different LLM providers/models for different tiers and agents, optimizing cost and speed.
- **WebSocket support:** Real-time action definitions in markdown ("Listens for… Emits when…").
- **Plugin ecosystem:** Community-contributed integration adapters published as npm packages.
- **Visual editor:** A web UI that renders the markdown files as forms and lets non-technical users edit the backend visually.
- **Hosted service:** A managed platform where users push their NLBackend repo and get a running API without managing infrastructure.

-----

## 15. Security Considerations

### 15.1 Authentication

Authentication is **delegated to external providers**. The framework does not implement its own auth system in v1. Instead, projects integrate with external auth MCP servers or services (e.g., Auth0, Supabase Auth, Clerk) via the integrations system.

The `config/auth.md` file specifies how the MCP server validates incoming authentication tokens:

```markdown
## Authentication

- **Strategy:** Bearer token validation
- **Token source:** The `auth_token` field in tool call arguments
- **Validation:** Verify JWT signature using the public key
  from environment variable AUTH_PUBLIC_KEY
- **User identity:** Extract `sub` claim as the authenticated user ID
- **Role extraction:** Extract `role` claim for permission checks
```

For simple projects that don't need an external auth provider, the framework includes a minimal built-in token system: a shared secret (environment variable) that signs and verifies JWTs. This is sufficient for personal tools and prototypes but should be replaced with a proper auth provider for anything user-facing.

### 15.2 Input Sanitization

All input is validated against compiled schemas before processing. In addition, the runtime applies explicit normalization and safety controls: input size limits, string length limits, character-set normalization, and escaping rules for integration templates and generated prompts.

Sanitization does not replace context-specific defenses. Integrations and custom adapters must still validate outbound payloads, header values, and URLs. When projects migrate to SQL backends, parameterized queries remain mandatory even if input has already been validated.

### 15.3 Secret Management

Secrets (API keys, tokens, passwords) are never stored in markdown files. They are referenced by environment variable name and loaded at runtime. The `.env` file is gitignored by default. Integration files reference secrets as: "API key stored in environment variable STRIPE_API_KEY" — the runtime reads the actual value from the environment.

### 15.4 LLM Prompt Injection

Since user input may be passed to the LLM for Tier 3 operations, prompt injection is a real concern. The MCP server mitigates this by:

- Clearly separating system context (the action/schema definitions) from user input in the LLM prompt.
- Applying input validation and length limits before LLM processing.
- Using structured output formats that constrain the LLM's response.
- Never allowing LLM output to directly execute system commands or file operations without runtime validation.

### 15.5 Data Privacy

For projects handling personal data, the `rules/` folder can include a `privacy.md` file that defines data handling policies. These are compiled into runtime checks: which fields must be redacted in responses, which data can be logged, and retention policies for the write-ahead log.

-----

## 16. Implementation Plan

The framework is implemented in **TypeScript** as a thin MCP server layer. The codebase should remain small — the complexity lives in the natural language definitions, not in the server code.

### 16.1 Phase 1: Foundation (Weeks 1–3)

1. Write the framework specification document (this document).
1. Create the framework template repository with all `claude.md` files and empty folder structure.
1. Build the schema compiler: rule-based parser that matches recognized keywords and produces JSON validation definitions.
1. Build the file-based database engine: atomic file rename writes, in-memory lazy indexes, write-ahead log. No concurrency locks yet (single-request processing).

### 16.2 Phase 2: Action Compilation & Runtime (Weeks 4–6)

1. Build the LLM-powered action compiler: send action definitions + schema context to LLM, receive JSON execution plans.
1. Build the MCP server with system tools (`query_db`, `mutate_db`, `describe_api`, `compile`, `inspect`).
1. Implement dynamic tool registration: read compiled actions and expose them as MCP tools.
1. Add per-collection locking for concurrent write safety.

### 16.3 Phase 3: Rules, Workflows & Testing (Weeks 7–9)

1. Implement the rule engine: LLM-compiled rules enforced as a decision tree in the request pipeline.
1. Implement workflow execution: parse workflow files via LLM, execute step sequences with saga pattern compensation.
1. Build the test runner: parse test files and execute them against the running server.
1. Add the `explain` tool for execution plan inspection.

### 16.4 Phase 4: Integrations & Polish (Weeks 10–11)

1. Build integration adapters (email, HTTP) and the integration configuration parser.
1. Write the framework root `claude.md` with comprehensive LLM instructions for project generation.
1. Create one complete example backend (recipe platform) as a reference project.
1. Implement hot reloading with incremental recompilation and Tier 2 cache invalidation.
1. Write user documentation, quick-start guide, and publish to npm/GitHub.

### 16.5 Deliverables

- **nlbackend** (npm package): The generic MCP server that runs any NLBackend project.
- **nlbackend-template** (GitHub repo): The starter template with all conventions and `claude.md` files.
- **nlbackend-example-recipes** (GitHub repo): A fully built-out example backend demonstrating all framework features.
- **Documentation site:** Hosted on GitHub Pages, explaining the framework, its conventions, and how to build with it.

-----

## Appendix A: Glossary

|Term            |Definition                                                                            |
|----------------|--------------------------------------------------------------------------------------|
|NLBackend       |The framework name: Natural Language Backend                                          |
|Definition Layer|The collection of markdown and JSON files that describe a backend                     |
|Compilation     |The process of parsing natural language definitions into deterministic execution plans |
|Tier 1/2/3      |Classification of operations by their LLM dependency (none / cached / per-request)    |
|MCP Server      |The Model Context Protocol server that reads the project and exposes it as MCP tools  |
|Action          |A single backend operation, defined in markdown, exposed as an MCP tool               |
|claude.md       |Convention file providing LLM context for interpreting files in a folder               |
|Integration     |A configuration file describing how to connect to an external service                 |
|Workflow        |A multi-step process definition that coordinates actions, checks, and integrations    |
|Record          |A single JSON file in the db/ folder representing one data entity instance            |
|Write-Ahead Log |Append-only log of all database write operations, enabling compensation and audit     |
|Saga Pattern    |Error handling strategy where each step commits independently with compensation on failure|
|Recognized Keywords|The set of structured terms (required, optional, default, etc.) the schema compiler parses deterministically|

-----

## Appendix B: File Extension Reference

|Extension |Used For                                                                            |Location                 |
|----------|------------------------------------------------------------------------------------|-------------------------|
|`.md`     |All definition files: schemas, actions, rules, workflows, tests, config, claude.md  |All folders              |
|`.json`   |Database records, indexes, compiled output, metadata                                |`db/`, `.compiled/`      |
|`.test.md`|Test definitions                                                                    |`tests/`                 |
|`.env`    |Environment variables (secrets, API keys)                                           |Project root (gitignored)|

-----

*End of document.*
