# ShipFlow AI - System Architecture

This document describes the high-level architecture, package dependency graph, and module layout of the ShipFlow AI Turborepo workspace.

---

## High-Level Architecture

The platform follows a clean, decoupled architecture. Client requests are routed through a unified Next.js entrypoint that handles authentication (BetterAuth), API routes (tRPC), and background workflows (Inngest).

```mermaid
graph TD
    %% Clients
    User([User Browser])
    GitHubApp([GitHub App Webhooks])
    RazorpayAPI([Razorpay Webhooks])
    
    %% Next.js Application
    subgraph Apps ["Vercel / Next.js Runtime (apps/web)"]
        UI[Frontend Views / UI]
        TRPCEndpoint[tRPC Route Handler]
        AuthEndpoint[BetterAuth Routes]
        InngestEndpoint[Inngest Event Endpoint]
        WebhookEndpoint[Webhook Handlers]
    end

    %% Packages / Services
    subgraph MonorepoPackages ["Monorepo Packages"]
        API[packages/api - tRPC Server]
        Auth[packages/auth - BetterAuth Config]
        InngestPkg[packages/inngest - Workflows]
        AIPkg[packages/ai - AI SDK Provider]
        GithubPkg[packages/github - Octokit Wrapper]
        BillingPkg[packages/billing - Razorpay Wrapper]
        DB[packages/db - Prisma Client]
        Validators[packages/validators - Zod Schemas]
        Types[packages/types - Shared Types]
        Utils[packages/utils - Common Helpers]
    end

    %% External Services
    Postgres[(PostgreSQL DB)]
    OpenAI[OpenAI / Gemini API]
    InngestCloud[Inngest Cloud Service]
    GitHubCloud[GitHub API]
    RazorpayCloud[Razorpay API]

    %% Connections - Client & App Router
    User -->|HTTPS / WSS| UI
    UI -->|tRPC Client| TRPCEndpoint
    UI -->|Session Context| AuthEndpoint
    GitHubApp -->|Webhooks| WebhookEndpoint
    RazorpayAPI -->|Webhooks| WebhookEndpoint
    
    %% Connections - Route Handlers to Packages
    TRPCEndpoint --> API
    AuthEndpoint --> Auth
    InngestEndpoint --> InngestPkg
    WebhookEndpoint --> InngestPkg
    WebhookEndpoint --> GithubPkg
    WebhookEndpoint --> BillingPkg

    %% Connections - Package Interactions
    API --> DB
    API --> Auth
    API --> Validators
    InngestPkg --> DB
    InngestPkg --> AIPkg
    InngestPkg --> GithubPkg
    InngestPkg --> BillingPkg
    
    Auth --> DB
    DB --> Postgres
    AIPkg --> OpenAI
    InngestPkg --> InngestCloud
    GithubPkg --> GitHubCloud
    BillingPkg --> RazorpayCloud

    classDef external fill:#f9f,stroke:#333,stroke-width:2px;
    classDef package fill:#bbf,stroke:#333,stroke-width:1px;
    classDef app fill:#bfb,stroke:#333,stroke-width:1px;
    class User,GitHubApp,RazorpayAPI,Postgres,OpenAI,InngestCloud,GitHubCloud,RazorpayCloud external;
    class API,Auth,InngestPkg,AIPkg,GithubPkg,BillingPkg,DB,Validators,Types,Utils package;
    class UI,TRPCEndpoint,AuthEndpoint,InngestEndpoint,WebhookEndpoint app;
```

---

## Package Dependency Diagram

To prevent circular dependencies and maintain clean boundaries, we enforce a strict unidirectional dependency graph. Lower-level packages must not import from higher-level packages.

```mermaid
graph TD
    %% Applications
    Web[apps/web]

    %% Higher-level packages
    API[packages/api]
    Inngest[packages/inngest]
    Auth[packages/auth]

    %% Service integration packages
    AI[packages/ai]
    Github[packages/github]
    Billing[packages/billing]

    %% Foundation packages
    DB[packages/db]
    UI[packages/ui]
    Validators[packages/validators]
    Types[packages/types]
    Utils[packages/utils]

    %% Dependencies
    Web --> API
    Web --> Inngest
    Web --> Auth
    Web --> UI
    
    API --> Auth
    API --> DB
    API --> Validators
    API --> Types
    
    Inngest --> DB
    Inngest --> AI
    Inngest --> Github
    Inngest --> Billing
    Inngest --> Types
    
    Auth --> DB
    
    AI --> Validators
    AI --> Types
    
    Github --> Types
    Github --> Utils
    
    Billing --> Types
    
    DB --> Types
    
    UI --> Types
    UI --> Utils
    
    Validators --> Types
    
    classDef app fill:#bfb,stroke:#333,stroke-width:1px;
    classDef service fill:#fbb,stroke:#333,stroke-width:1px;
    classDef core fill:#bbf,stroke:#333,stroke-width:1px;
    
    class Web app;
    class AI,Github,Billing service;
    class API,Inngest,Auth,DB,UI,Validators,Types,Utils core;
```

---

## Package Responsibilities

### 1. Applications (`apps/`)
* **`apps/web`**: Contains the Next.js application structure (pages, client hooks, public endpoints, stylesheets). All routes are handled here. Direct access to database schemas is prohibited; any write/read actions are mediated through tRPC procedures or Inngest background operations.

### 2. Core Packages (`packages/`)
* **`packages/db`**: Manages the Prisma schema and client instance. Restricts raw database connections across the codebase, ensuring transaction consistency and pool reuse.
* **`packages/api`**: Holds tRPC routers, query/mutation validation, context injection, and security middlewares.
* **`packages/auth`**: Configures BetterAuth with Prisma Adapters, workspace multi-tenancy rules, and role validations.
* **`packages/inngest`**: Defines background workflow orchestrations, triggers, and state retries.
* **`packages/ui`**: Encapsulates React components built on Tailwind CSS v4 and Shadcn UI.
* **`packages/validators`**: Contains shared Zod schema validators (e.g., project name patterns, credit purchase checks) to assert object shapes at compile and API ingestion times.
* **`packages/types`**: Declares shared TypeScript interfaces, database extensions, and type bindings used across multiple modules.
* **`packages/utils`**: Outlines common helper libraries (e.g., standard text string parsers, date formatters, environment variable assertions).

### 3. Service Packages (`packages/`)
* **`packages/ai`**: Provider-agnostic AI pipeline powered by the Vercel AI SDK. Maps custom interfaces to API endpoints (defaulting to OpenAI's latest models, with simple environment toggle capability).
* **`packages/github`**: Octokit-based utility handlers that process commit histories, fetch file diffs, initialize repository check runs, and submit code review threads.
* **`packages/billing`**: Integrates with the Razorpay client to issue payments, record subscriptions, and trace billing webhooks.
