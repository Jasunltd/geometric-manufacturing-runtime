# Code contract v0.1

Status: frozen initial implementation rule.  
Authority: none.

This is a project-specific projection of the Agent Workbench language/deep-function doctrine.

## TypeScript

- `strict`, `exactOptionalPropertyTypes`, and `noUncheckedIndexedAccess` remain enabled.
- Closed semantic alternatives are discriminated/tagged unions and switches must be exhaustive by construction.
- Open `unknown` values stop at `boundary/` or explicit compiler entry points.
- Expected failures are typed results or Effect error-channel values, never parsed log/error strings.
- No unchecked `any` belongs in the trusted semantic path.
- Semantic IDs and digests are explicit values, not inferred from filenames or mutable object identity.

## Deep functions

A public semantic function answers one complete question:

- `compileManufacturingProgram(input)` — is this open program a valid supported canonical manufacturing program, and what exact geometry does it generate?
- `bindExecutionPlan(program, machine, state)` — can this exact physical state realize the canonical geometry under the declared bounded model, and if so what immutable plan results?
- `lowerExecutionPlanToGcode(plan)` — what generic RS274 artifact represents this exact immutable plan?
- `buildFullSystemTrace(...)` — what exact cross-lane identities participated in one system-level derivation?
- `prepareExecutionArtifact(program, machine)` — acquire a current physical snapshot through Effect mechanisms, bind deterministically, then lower through a backend.

Private helpers may be long when they hide coherent complexity. Splitting for line count is forbidden.

## Effect

- Effect is used for effectful mechanisms/dependencies and typed operational failures.
- `Context.GenericTag`/Layers own replaceable mechanism injection.
- Semantic compilers and geometry math stay deterministic and directly testable.
- A successful Effect does not mint execution authority or physical truth.

## XState

- XState v5 owns lifecycle/statechart behavior only.
- Guards are pure and synchronous.
- Geometry, compensation math, filesystem/network I/O, controller I/O, and research policy stay outside guards/actions.
- Lifecycle context carries exact identities/observations, not a second copy of canonical program semantics.

## REPL

- Only closed function-call syntax is accepted.
- Arguments are inert JSON.
- No `eval`, `Function`, module loading, shell escape, controller escape, or arbitrary JavaScript path is permitted.
- Session history is non-authoritative.
