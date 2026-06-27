# ShipFlow AI - Database Design

This document details the database architecture, the Entity-Relationship (ER) diagram, and the schemas managing multi-tenant workspaces, feature tracking, task management, subscriptions, and AI credits.

---

## Entity-Relationship (ER) Diagram

```mermaid
erDiagram
    User ||--o{ Account : has
    User ||--o{ Session : has
    User ||--o{ WorkspaceMember : belongs_to
    
    Workspace ||--o{ WorkspaceMember : contains
    Workspace ||--o{ Project : owns
    Workspace ||--o{ Subscription : has
    Workspace ||--1| AiCredit : tracks
    Workspace ||--o{ AiCreditLog : writes
    
    Project ||--o{ FeatureRequest : contains
    Project ||--o{ CodeReview : logs
    
    FeatureRequest ||--o| Prd : has
    Prd ||--o{ Task : breaks_down

    User {
        string id PK
        string name
        string email
        datetime emailVerified
        string image
        datetime createdAt
        datetime updatedAt
    }

    Workspace {
        string id PK
        string name
        string slug
        string githubInstallationId
        datetime createdAt
        datetime updatedAt
    }

    WorkspaceMember {
        string id PK
        string workspaceId FK
        string userId FK
        string role "OWNER | ADMIN | DEVELOPER | CUSTOMER"
        datetime createdAt
    }

    Project {
        string id PK
        string name
        string description
        string workspaceId FK
        string githubRepository "owner/repo"
        datetime createdAt
        datetime updatedAt
    }

    FeatureRequest {
        string id PK
        string projectId FK
        string creatorId FK
        string title
        string description
        string status "DRAFT | DISCOVERY | PRD_READY | DEVELOPMENT | REVIEW | APPROVED | SHIPPED"
        datetime createdAt
        datetime updatedAt
    }

    Prd {
        string id PK
        string featureRequestId FK
        string problemStatement
        string goals
        string nonGoals
        string userStories "JSON"
        string acceptanceCriteria "JSON"
        string edgeCases "JSON"
        string successMetrics "JSON"
        datetime createdAt
        datetime updatedAt
    }

    Task {
        string id PK
        string prdId FK
        string title
        string description
        string status "TODO | IN_PROGRESS | REVIEW | DONE"
        string priority "LOW | MEDIUM | HIGH | URGENT"
        int estimateMinutes
        string dependencies "JSON"
        string gitBranch
        datetime createdAt
        datetime updatedAt
    }

    CodeReview {
        string id PK
        string projectId FK
        string pullRequestNumber
        string commitSha
        string status "PENDING | APPROVED | CHANGES_REQUESTED"
        string summary
        string details "JSON"
        datetime createdAt
    }

    Subscription {
        string id PK
        string workspaceId FK
        string razorpaySubscriptionId
        string plan "FREE | PRO | ENTERPRISE"
        string status "ACTIVE | CANCELLED | PAST_DUE | INCOMPLETE"
        datetime currentPeriodStart
        datetime currentPeriodEnd
        datetime createdAt
        datetime updatedAt
    }

    AiCredit {
        string id PK
        string workspaceId FK
        int balance
        int lifetimeAllocated
        datetime updatedAt
    }

    AiCreditLog {
        string id PK
        string workspaceId FK
        int amount "negative for debits, positive for topups"
        string feature "DISCOVERY | PRD_GEN | TASK_GEN | REPO_ANALYSIS | PR_REVIEW | RELEASE_CHECK"
        string metadata "JSON reference to action ID"
        datetime createdAt
    }
```

---

## Schema Guidelines

### 1. Multi-Tenant Isolation
All tables linked to customer data should eventually cascade or resolve through the `Workspace` model. In standard operations:
* Access to `Project`, `FeatureRequest`, `Subscription`, and `AiCredit` must check the user's `WorkspaceMember` relationship with appropriate roles.
* Queries should explicitly filter by `workspaceId` (or via its projects/features relations) to prevent data leaks.

### 2. Indexes and Performance
* Composite unique constraints are set on `WorkspaceMember` (`workspaceId`, `userId`) to prevent duplicate enrollments.
* Indices are placed on foreign key references like `projectId`, `workspaceId`, and `featureRequestId`.
* Slug indexes on `Workspace(slug)` are set for quick route resolution.
