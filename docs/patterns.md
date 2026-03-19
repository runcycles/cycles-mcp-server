# Cycles Integration Patterns

## The Agent Decision Loop

Every agent step should follow this pattern:

```
1. cycles_reserve   → Lock budget before each costly step
2. Execute          → Perform the operation (respecting any caps)
3. cycles_commit    → Record actual usage after each step
   OR cycles_release → Clean release if step was skipped/cancelled
```

Optionally, before reserving:
- `cycles_check_balance` — inspect remaining budget to plan your approach (see Pattern 6)
- `cycles_decide` — lightweight preflight check without locking funds (see Pattern 2)

## Pattern 1: Simple Reserve/Commit

The most common pattern — reserve before, commit after:

```
reserve(estimate=1000 TOKENS) → reservationId
  execute LLM call → actual=850 TOKENS
commit(reservationId, actual=850) → releases 150 TOKENS back
```

## Pattern 2: Preflight + Reserve

Use `cycles_decide` for a lightweight check before committing to a reservation:

```
decide(estimate=5000 TOKENS) → ALLOW
  reserve(estimate=5000 TOKENS) → reservationId
  execute LLM call → actual=4200 TOKENS
  commit(reservationId, actual=4200)
```

## Pattern 3: Graceful Degradation

When budget is constrained, the server returns `ALLOW_WITH_CAPS`:

```
reserve(estimate=5000 TOKENS) → ALLOW_WITH_CAPS, caps={maxTokens: 2000}
  execute LLM call with maxTokens=2000
  commit(reservationId, actual=1800)
```

Caps may include:
- `maxTokens` — limit output tokens
- `maxStepsRemaining` — limit remaining agent steps
- `toolAllowlist` / `toolDenylist` — restrict available tools
- `cooldownMs` — delay between operations

## Pattern 4: Long-Running Operations

For operations that may exceed the default 60s TTL:

```
reserve(estimate=10000 TOKENS, ttlMs=60000) → reservationId
  start long operation
  every 30s: extend(reservationId, extendByMs=60000)  # heartbeat
  operation completes
commit(reservationId, actual=8500)
```

## Pattern 5: Fire-and-Forget Events

When you can't pre-estimate (e.g., webhook-triggered actions):

```
create_event(actual=500 TOKENS) → eventId
```

No reservation needed — the event is applied atomically.

## Pattern 6: Multi-Step Workflow

Each step gets its own reservation:

```
check_balance(tenant="acme") → remaining=50000 TOKENS

Step 1: reserve → execute → commit
Step 2: reserve → execute → commit
Step 3: reserve → DENY (budget exhausted)
  → degrade or stop
```

## Error Handling

| Error Code | Meaning | Action |
|---|---|---|
| BUDGET_EXCEEDED | Not enough budget | Degrade or stop |
| RESERVATION_EXPIRED | TTL elapsed | Re-reserve if needed |
| RESERVATION_FINALIZED | Already committed/released | No action needed |
| DEBT_OUTSTANDING | Scope has unpaid debt | Wait for admin to fund |
| OVERDRAFT_LIMIT_EXCEEDED | Over-limit state | Wait for admin to reconcile |

## Subject Hierarchy

Organize budgets hierarchically:

```
tenant:acme                          → company-wide budget
  tenant:acme/workspace:prod         → production budget
    tenant:acme/workspace:prod/app:chatbot  → app budget
      .../workflow:summarize          → workflow budget
        .../agent:researcher          → agent budget
```

Each level can have its own budget. Reservations check all ancestor scopes.
