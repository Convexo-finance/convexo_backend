# Convexo Backend — Sequence Diagrams

> API processing, database operations, webhooks and external service integrations.  
> Updated: 2026-03-04

---

## 1. SIWE Authentication (Server-Side)

```mermaid
sequenceDiagram
    participant FE as Frontend
    participant BE as Backend (Fastify)
    participant Redis
    participant DB as PostgreSQL

    FE->>BE: GET /auth/nonce?address=0x...
    BE->>BE: Generate random nonce
    BE->>Redis: SET nonce:{address} = nonce (TTL 5 min)
    BE-->>FE: { nonce }

    FE->>BE: POST /auth/verify { message, signature }
    BE->>BE: Parse SIWE message, verify signature (ethers/viem)
    BE->>Redis: GET nonce:{address} → validate & DELETE
    BE->>DB: Upsert User (address, lastLoginAt)
    BE->>BE: Sign JWT (accessToken 15 min, refreshToken 7 d)
    BE-->>FE: { accessToken, refreshToken }
```

---

## 2. Onboarding API Processing

```mermaid
sequenceDiagram
    participant FE as Frontend
    participant BE as Backend (Fastify)
    participant DB as PostgreSQL

    FE->>BE: GET /onboarding/status
    BE->>DB: SELECT onboardingStep, accountType FROM User WHERE address = jwt.sub
    DB-->>BE: { step, accountType }
    BE-->>FE: { step, accountType, isComplete, nextAction }

    FE->>BE: POST /onboarding/type { accountType: "INDIVIDUAL" }
    BE->>BE: Validate accountType ∈ { INDIVIDUAL, BUSINESS }
    BE->>DB: UPDATE User SET accountType = 'INDIVIDUAL', onboardingStep = 'TYPE_SELECTED'
    BE-->>FE: { success }

    FE->>BE: POST /onboarding/profile { firstName, lastName, email, ... }
    BE->>BE: Validate required fields per accountType
    alt INDIVIDUAL
        BE->>DB: INSERT IndividualProfile { firstName, lastName, email, dateOfBirth, nationality, country }
    else BUSINESS
        BE->>DB: INSERT BusinessProfile { companyName, legalName, taxId, industry, companySize, repFirstName, ... }
    end
    BE->>DB: UPDATE User SET onboardingStep = 'PROFILE_COMPLETE'
    BE-->>FE: { success }
```

### Onboarding Step State Machine

```
NOT_STARTED → TYPE_SELECTED → PROFILE_COMPLETE → HUMANITY_VERIFIED
→ LP_VERIFIED → CREDIT_SCORE_SUBMITTED → CREDIT_SCORE_VERIFIED → COMPLETE
```

---

## 3. KYC Processing (Individual — Veriff)

```mermaid
sequenceDiagram
    participant FE as Frontend
    participant BE as Backend (Fastify)
    participant Veriff
    participant DB as PostgreSQL

    FE->>BE: POST /verification/kyc/start
    BE->>Veriff: POST /v1/sessions (API call)
    Veriff-->>BE: { sessionId, verificationUrl }
    BE->>DB: INSERT Verification { type: KYC_INDIVIDUAL, sessionId, veriffUrl, status: PENDING }
    BE-->>FE: { sessionUrl }

    Note over Veriff: User completes verification on Veriff platform

    Veriff->>BE: POST /webhooks/veriff/decision { decision, sessionId }
    BE->>BE: Validate HMAC-SHA256 signature (X-Hmac-Signature)
    BE->>DB: UPDATE Verification SET status = APPROVED/REJECTED
    alt APPROVED
        BE->>DB: UPDATE User SET onboardingStep = 'HUMANITY_VERIFIED'
        BE->>BE: Send Telegram notification (admin)
        BE->>BE: Send email notification (admin + user)
    end
    BE-->>Veriff: 200 OK

    FE->>BE: GET /verification/kyc/status
    BE->>DB: SELECT status FROM Verification WHERE userId AND type = KYC_INDIVIDUAL
    BE-->>FE: { status: "APPROVED" }
```

---

## 4. KYB Processing (Business — Sumsub)

```mermaid
sequenceDiagram
    participant FE as Frontend
    participant BE as Backend (Fastify)
    participant Sumsub
    participant DB as PostgreSQL

    FE->>BE: POST /verification/kyb/start
    BE->>Sumsub: POST /resources/applicants (create applicant)
    BE->>Sumsub: POST /resources/accessTokens (generate SDK token)
    Sumsub-->>BE: { applicantId, accessToken }
    BE->>DB: INSERT Verification { type: KYB_BUSINESS, applicantId, status: PENDING }
    BE-->>FE: { accessToken, applicantId }

    Note over Sumsub: User completes business verification in SDK

    Sumsub->>BE: POST /webhooks/sumsub/event { type, applicantId, reviewResult }
    BE->>BE: Validate X-App-Token header
    BE->>DB: UPDATE Verification SET status = reviewResult.reviewAnswer
    alt APPROVED
        BE->>DB: UPDATE User SET onboardingStep = 'LP_VERIFIED'
        BE->>BE: Notify admin (Telegram + Email)
    end
    BE-->>Sumsub: 200 OK

    FE->>BE: GET /verification/kyb/status
    BE->>DB: SELECT status FROM Verification WHERE userId AND type = KYB_BUSINESS
    BE-->>FE: { status: "APPROVED" }
```

---

## 5. Credit Score Pipeline (Business — n8n)

```mermaid
sequenceDiagram
    participant FE as Frontend
    participant BE as Backend (Fastify)
    participant Pinata as Pinata (IPFS)
    participant n8n
    participant Admin
    participant DB as PostgreSQL
    participant Chain as Blockchain

    FE->>BE: POST /verification/credit-score/submit (multipart form)
    BE->>Pinata: Upload Income Statement → { cid1 }
    BE->>Pinata: Upload Balance Sheet → { cid2 }
    BE->>Pinata: Upload Cash Flow → { cid3 }
    BE->>DB: INSERT CreditScoreRequest { cids, businessData, status: PENDING }
    BE->>n8n: POST /webhook/credit-score { requestId, cids, businessData }
    n8n-->>BE: { executionId }
    BE->>DB: UPDATE { n8nExecutionId, submittedToN8nAt }
    BE-->>FE: { requestId, status: "PENDING" }

    Note over n8n: n8n workflow processes documents with AI

    n8n->>BE: POST /webhooks/n8n/credit-score { requestId, score, rating, approved, maxCreditLimit }
    BE->>BE: Validate HMAC secret (X-Webhook-Secret)
    BE->>DB: UPDATE CreditScoreRequest { score, rating, approved, n8nCallbackAt }
    BE->>DB: UPDATE User SET onboardingStep = 'CREDIT_SCORE_VERIFIED'
    BE->>Admin: Notify via Telegram + Email (include mint instruction)
    BE-->>n8n: 200 OK

    Admin->>Chain: Mint ECREDITSCORING NFT for user
    Admin->>BE: PUT /admin/credit-score-requests/:id/nft { nftTokenId }
    BE->>DB: UPDATE { nftTokenId, nftMintedAt, status: COMPLETE }

    FE->>BE: GET /verification/credit-score/status
    BE->>DB: SELECT * FROM CreditScoreRequest WHERE userId
    BE-->>FE: { status: "COMPLETE", score, rating, approved }
```

---

## 6. OTC Order Management

```mermaid
sequenceDiagram
    participant FE as Frontend
    participant BE as Backend (Fastify)
    participant DB as PostgreSQL
    participant Admin

    FE->>BE: GET /rates/usd-cop
    BE->>BE: Fetch latest exchange rate (cache or provider)
    BE-->>FE: { pair: "USD-COP", rate: 4200 }

    FE->>BE: POST /otc/orders { orderType, tokenIn, tokenOut, amountIn, amountOut, priceUSD, network }
    BE->>BE: Validate order params, check user tier permissions
    BE->>DB: INSERT OtcOrder { status: PENDING, ...params }
    BE->>Admin: Send Telegram + Email notification
    BE-->>FE: { orderId, status: "PENDING" }

    Admin->>BE: PUT /admin/otc/orders/:id/status { status: "IN_PROGRESS" }
    BE->>DB: UPDATE OtcOrder SET status = IN_PROGRESS
    BE->>BE: Send email to user (status update)

    Admin->>BE: PUT /admin/otc/orders/:id/status { status: "COMPLETED" }
    BE->>DB: UPDATE OtcOrder SET status = COMPLETED, completedAt = now()
    BE->>BE: Send email to user (completion)

    FE->>BE: GET /otc/orders
    BE->>DB: SELECT * FROM OtcOrder WHERE userId ORDER BY createdAt DESC
    BE-->>FE: { orders[] }
```

---

## 7. Reputation Sync (Blockchain → DB)

```mermaid
sequenceDiagram
    participant FE as Frontend
    participant BE as Backend (Fastify)
    participant DB as PostgreSQL
    participant Chain as Blockchain (viem)

    FE->>BE: POST /reputation/sync
    BE->>Chain: Read CONVEXO_PASSPORT.balanceOf(address)
    BE->>Chain: Read LP_INDIVIDUALS.balanceOf(address)
    BE->>Chain: Read LP_BUSINESS.balanceOf(address)
    BE->>Chain: Read ECREDITSCORING.balanceOf(address)
    Chain-->>BE: NFT balances (uint256)

    BE->>BE: Compute tier:
    Note over BE: Tier 0 — no NFTs
    Note over BE: Tier 1 — CONVEXO_PASSPORT ≥ 1
    Note over BE: Tier 2 — LP_INDIVIDUALS or LP_BUSINESS ≥ 1
    Note over BE: Tier 3 — ECREDITSCORING ≥ 1

    BE->>BE: Derive permissions from tier:
    Note over BE: canAccessTreasury (Tier ≥ 2)
    Note over BE: canAccessFunding (Tier ≥ 3, BUSINESS only)
    Note over BE: canInvestInVaults (Tier ≥ 2)

    BE->>DB: UPSERT ReputationCache { tier, balances, permissions, lastSyncedAt }
    BE-->>FE: { tier, permissions }
```

---

## 8. Funding Request Processing (Business, Tier 3)

```mermaid
sequenceDiagram
    participant FE as Frontend
    participant BE as Backend (Fastify)
    participant DB as PostgreSQL
    participant Admin

    Note over BE: Middleware checks: JWT valid, tier ≥ 3, accountType = BUSINESS

    FE->>BE: POST /funding/requests { amount, currency, purpose, term, collateral }
    BE->>BE: Validate request, check permissions
    BE->>DB: INSERT FundingRequest { status: PENDING, userId, ...params }
    BE->>Admin: Notify via Telegram + Email
    BE-->>FE: { requestId, status: "PENDING" }

    Admin->>BE: GET /admin/funding/requests
    BE->>DB: SELECT * FROM FundingRequest ORDER BY createdAt DESC
    BE-->>Admin: { requests[] }

    Admin->>BE: PUT /admin/funding/requests/:id/review { status: "APPROVED", adminNotes }
    BE->>DB: UPDATE FundingRequest { status: APPROVED, reviewedBy, reviewedAt, adminNotes }
    BE->>BE: Send approval email to user

    FE->>BE: GET /funding/requests
    BE->>DB: SELECT * FROM FundingRequest WHERE userId
    BE-->>FE: { status: "APPROVED" }
```

---

## 9. Bank Account Management

```mermaid
sequenceDiagram
    participant FE as Frontend
    participant BE as Backend (Fastify)
    participant DB as PostgreSQL
    participant Admin

    FE->>BE: GET /bank-accounts
    BE->>DB: SELECT * FROM BankAccount WHERE userId
    BE->>BE: Decrypt account numbers for response
    BE-->>FE: { accounts[] }

    FE->>BE: POST /bank-accounts { accountName, bankName, accountNumber, accountType, currency }
    BE->>BE: Encrypt accountNumber (AES-256)
    BE->>DB: INSERT BankAccount { status: PENDING, ...encrypted }
    BE-->>FE: { account }

    Admin->>BE: PUT /admin/bank-accounts/:id/verify { status: "VERIFIED" }
    BE->>DB: UPDATE BankAccount { status: VERIFIED, verifiedAt, verifiedBy }
    BE->>BE: Send verification email to user

    FE->>BE: POST /bank-accounts/:id/default
    BE->>DB: UPDATE BankAccount SET isDefault = false WHERE userId
    BE->>DB: UPDATE BankAccount SET isDefault = true WHERE id = :id
    BE-->>FE: { success }
```

---

## 10. Webhook Security

All inbound webhooks follow a consistent validation pattern:

```mermaid
sequenceDiagram
    participant Ext as External Service
    participant BE as Backend (Fastify)
    participant DB as PostgreSQL

    Ext->>BE: POST /webhooks/{service}/{event}
    BE->>BE: Extract signature header
    Note over BE: Veriff → X-Hmac-Signature (HMAC-SHA256)
    Note over BE: Sumsub → X-App-Token
    Note over BE: n8n → X-Webhook-Secret (HMAC)

    BE->>BE: Compute expected signature from body + secret
    alt Signature VALID
        BE->>DB: Process event (update status, create records)
        BE->>BE: Trigger notifications (Telegram, Email)
        BE-->>Ext: 200 OK
    else Signature INVALID
        BE-->>Ext: 401 Unauthorized
        BE->>BE: Log security warning
    end
```

| Service | Webhook URL | Header | Algorithm |
|---------|-------------|--------|-----------|
| Veriff | `/webhooks/veriff/decision` | `X-Hmac-Signature` | HMAC-SHA256 |
| Sumsub | `/webhooks/sumsub/event` | `X-App-Token` | Token match |
| n8n | `/webhooks/n8n/credit-score` | `X-Webhook-Secret` | HMAC |
