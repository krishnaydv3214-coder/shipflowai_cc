# ShipFlow AI - AI Workflows & Inngest Integration

This document outlines the AI workflows powered by Vercel AI SDK and managed asynchronously by Inngest, detailing the complete Feature Request → Shipped flow, credit consumption limits, and background pipelines.

---

## Feature Request → Shipped Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    actor User as User / Product Owner
    participant App as ShipFlow (Next.js/tRPC)
    participant Queue as Inngest Engine
    participant AI as AI SDK (OpenAI)
    participant GH as GitHub API (Octokit)

    User->>App: 1. Create Feature Request
    App->>User: State: DRAFT
    
    User->>App: 2. Start Discovery Chat (Debits 1 Credit)
    App->>Queue: Dispatch "discovery.message.received"
    Queue->>AI: Call LLM (analyze feature scope & ask follow-up questions)
    AI-->>Queue: Return follow-up questions & duplicate checks
    Queue-->>App: Save Chat Message / Update UI
    App-->>User: Render AI follow-up questions

    User->>App: 3. Request PRD Generation (Debits 5 Credits)
    App->>Queue: Dispatch "prd.generate"
    App->>User: State: DISCOVERY -> Generating PRD...
    Queue->>AI: Call LLM with chat history & template requirements
    AI-->>Queue: Return Structured PRD JSON
    Queue->>App: Save PRD to DB
    App-->>User: State: PRD_READY (Render markdown PRD)

    User->>App: 4. Request Tasks Generation (Debits 2 Credits)
    App->>Queue: Dispatch "tasks.generate"
    Queue->>AI: Call LLM to break PRD into discrete tasks
    AI-->>Queue: Return structured tasks list (estimates, priorities)
    Queue->>App: Save Tasks to Kanban DB
    App-->>User: Render tasks on Kanban board

    Note over User, GH: Developer implements feature on branch & opens GitHub PR
    GH->>App: 5. Trigger Webhook: pull_request.opened
    App->>Queue: Dispatch "github.pr.opened" (Debits 10 Credits)
    Queue->>GH: Fetch diff contents via Octokit
    GH-->>Queue: Return files changed & raw diff
    Queue->>AI: Prompt LLM to review diff against PRD & acceptance criteria
    AI-->>Queue: Return list of line-specific issues (blocking/non-blocking)
    Queue->>GH: Post inline review comments & set Check Run status to PENDING
    Queue->>App: Save CodeReview report to DB
    App-->>User: State: REVIEW (Render code review dashboard)

    User->>App: 6. Human Reviewer Approves Release
    App->>GH: Update Status Check to SUCCESS / Trigger Merge
    App->>User: State: APPROVED -> SHIPPED
```

---

## Inngest Background Workflows

Inngest is used to model durable, multi-step workflows. If the LLM call fails or rate limits are hit, Inngest will automatically retry the step.

### 1. Discovery Chat Workflow (`discovery.message.received`)
Triggers whenever the user posts a message inside the Feature Discovery tab.
* **Steps**:
  1. Deduct 1 credit from Workspace balance.
  2. Query database for context: all historical message exchanges in the discovery session.
  3. Perform a semantic check/vector search (optional) to flag duplicate feature requests.
  4. Prompt LLM to extract requirements, identify missing specifications, and formulate follow-up questions.
  5. Store response in the database.

```mermaid
flowchart TD
    E1[Event: discovery.message.received] --> S1[Step 1: Check & Deduct 1 Credit]
    S1 --> S2[Step 2: Retrieve Chat History]
    S2 --> S3[Step 3: Call LLM Vercel AI SDK]
    S3 --> S4[Step 4: Save AI Response to DB]
    S4 --> S5[Step 5: Check if Requirements Complete]
    S5 -->|Yes| S6[Flag PRD Ready for generation]
    S5 -->|No| S7[Wait for user input]
```

### 2. PRD Generation Workflow (`prd.generate`)
Generates an standard engineering PRD from the Feature description and discovery log.
* **Steps**:
  1. Check and deduct 5 credits.
  2. Call OpenAI model requesting structured JSON payload adhering to the PRD schema:
     * Problem Statement
     * Goals and Non-Goals
     * User Stories
     * Acceptance Criteria
     * Success Metrics
  3. Save generated PRD content to database. Set feature status to `PRD_READY`.

### 3. Engineering Tasks Generator (`tasks.generate`)
Converts PRD acceptance criteria into actionable tasks.
* **Steps**:
  1. Deduct 2 credits.
  2. Call LLM with the PRD markdown.
  3. Request structured array matching the `Task` schema:
     * Title, Description
     * Priority (`LOW`, `MEDIUM`, `HIGH`, `URGENT`)
     * Estimates (in minutes)
     * Dependencies (references to other generated tasks index)
  4. Write Tasks records to database pointing to the Kanban board.

### 4. PR Code Review Workflow (`github.pr.opened` / `github.pr.sync`)
Reviews incoming pull request diffs against the PRD.
* **Steps**:
  1. Deduct 10 credits.
  2. Trigger GitHub check run state: `in_progress`.
  3. Fetch file list and complete diffs from GitHub.
  4. Fetch target PRD and Kanban task requirements from database.
  5. Query LLM to inspect diffs line-by-line, matching against the acceptance criteria, searching for security/performance flaws.
  6. Call Octokit to post inline comments on code lines for blocking issues.
  7. If blocking issues exist: Set GitHub status to `failure` (blocking merge).
  8. If passes: Set GitHub status to `success` (if human approved or awaiting human approval).

---

## AI Credits Configuration

Credits are tracked in the `AiCredit` table and managed by transactional logs in `AiCreditLog`.

| Feature Action | Credit Cost | Usage Trigger |
| :--- | :--- | :--- |
| **Discovery Chat** | 1 Credit | Every user message sent to AI Discovery |
| **PRD Generation** | 5 Credits | Initial generation of the PRD |
| **Task Generation** | 2 Credits | Initial generation of Kanban Tasks |
| **Repository Analysis**| 5 Credits | Initial repository linking crawl |
| **Pull Request Review**| 10 Credits | Automated Code Review run on PR open/sync |
| **Release Readiness**  | 3 Credits | Pre-deployment compliance/lint scan |

### Tier Allocations

Subscriptions managed via Razorpay grant recurring monthly credits:
* **Free Tier**: 50 credits/month, maximum 1 workspace, 1 connected repository.
* **Pro Tier**: 1,000 credits/month, unlimited workspaces, 5 repositories.
* **Enterprise Tier**: Custom credit limits (unlimited), customizable models, dedicated workspace routing.
