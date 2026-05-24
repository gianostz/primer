# Plan: example feature

**Slug**: example
**Status**: planned
**Created**: 2026-01-01

## Summary
Fixture-only plan used by the validator test suite to exercise the sprint precondition.

## Scope
**HLD component(s)**: [Architecture style](../HLD.md#architecture-style)
**LLD module(s)**: [core](../modules/core.md)
**Type**: new capability

## Acceptance criteria
- [ ] fixture passes validation

## Skills
**Reused**: none
**To create**: none
**No-skill rationale**: this fixture only exercises validator preconditions, no codified conventions involved.

## Architectural impact
**New ADR needed**: no
**HLD changes**: no
**LLD changes**: no

## Steps

### Step 1: trivial step
**Parallelisable**: yes
**Acceptance**:
  - [ ] runs
**Files likely touched**: src/core.ts
**Must not touch**: none
**Notes**: none

## Post-implementation
1. Mark `Status: implemented`.
2. Run `/primer-sync`.
3. Delete this plan.
