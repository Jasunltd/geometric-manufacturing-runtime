# Public API contract v0.1

Status: initial frozen implementation boundary.

The public surface is intentionally smaller than the implementation. Open values compile before trusted semantics, expected refusals are tagged data, and mechanism artifacts have no authority.

## Root exports

```text
compileManufacturingProgram(input) -> CompileResult<ManufacturingProgram>
inspectGeneratedGeometry(program, operationId) -> GeneratedCapsule | undefined
compileMachineModel(input) -> CompileResult<MachineModel>
compilePhysicalStateSnapshot(input) -> CompileResult<PhysicalStateSnapshot>
bindExecutionPlan(program, machine, state) -> BindingResult
lowerExecutionPlanToGcode(plan) -> GCodeArtifact
prepareExecutionArtifact(program, machine) -> Effect<PreparedExecutionArtifact, ...>
executionLifecycleMachine
GeometricManufacturingReplSession
```

## Contract rules

1. No independent radius parameter exists for `capsule-sweep`; radius is derived from nominal tool geometry.
2. `ManufacturingProgram.geometryDigest` is a function of canonical construction only, never current machine/tool state.
3. Binding may change execution-plan identity but never program/geometry identity.
4. Stale/mismatched state returns a typed refusal.
5. Physical tool larger than the nominal generator is unsupported in v0.1 and returns a typed refusal.
6. G-code lowering cannot alter plan semantics.
7. XState lifecycle cannot create a plan or geometry; it carries identities only.
8. Effect service success does not grant physical execution authority.
9. REPL input is closed semantic syntax and never evaluated as JavaScript.
