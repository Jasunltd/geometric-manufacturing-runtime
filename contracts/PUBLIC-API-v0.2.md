# Public API contract v0.2

Status: current implementation boundary.  
Authority: none.

The trusted public path is deliberately small:

```text
compileDesignProblem(input) -> CompileResult<DesignProblem>
evaluateDesignState(problem, parameters) -> DesignStateEvaluation
enumerateDesignActions(problem, state) -> readonly DesignAction[]
applyDesignAction(problem, state, action) -> DesignActionApplication
searchDesign(problem [, options]) -> DesignSearch
synthesizeDesignSpace(problem) -> DesignSynthesis
build123dGeometryBackendLayer(config) -> Layer<GeometryBackend>
compileStructuralStudyRequest(problem, candidate) -> StructuralStudyCompileResult
bindExistingFixtureStudyToolchain(request, toolchain) -> ExistingFixtureStudyConfig
bindExistingFixtureStudyResult(problem, request, result) -> CompileResult<StructuralVerificationBinding>
planCandidateManufacturing(problem, candidate) -> ManufacturingPlan
compileMotionProgram(plan [, setupId]) -> MotionProgram
controllerProfile(target) -> ControllerProfile
postMotionProgram(motion, profile) -> ControllerProgram
compileLinuxCncVerificationFixture(plan, motion, program) -> LinuxCncVerificationFixture
bindLinuxCncRs274Receipt(program, fixture, result) -> CompileResult<LinuxCncInterpreterVerificationBinding>
buildManufacturingDossier(problem, candidate, plan, motion) -> ManufacturingDossier
simulateMetrology(candidateDigest, drawing, inspection) -> SimulatedMetrology
reportlabDossierRendererLayer(config) -> Layer<DossierRenderer>
compileProcessObservation(input) -> CompileResult<ProcessObservation>
compileProcessObservations(inputs) -> CompileResult<readonly ProcessObservation[]>
compileProcessRecoveryScenario(input) -> CompileResult<ProcessRecoveryScenario>
createProcessControlState(plan) -> ProcessControlState
assessProcessException(plan, state, observations) -> RecoveryAssessment
applyRecoveryAction(state, assessment, actionId) -> RecoveryActionApplication
verifyRecovery(assessment, adjustedState, observations) -> RecoveryVerification
runProcessRecoveryScenario(plan, input) -> ProcessRecoveryCaseStudy
renderRecoveryCaseStudyMarkdown(study) -> string
reportlabRecoveryRendererLayer(config) -> Layer<RecoveryRenderer>
GeometricManufacturingReplSession
```

The v0.1 tool-generated-geometry and physical-state late-binding exports remain compatibility/research surfaces. They are not the primary v0.2 design flow.

## Contract rules

1. Natural-language text is not a trusted `DesignProblem`.
2. A frontend may propose `DesignProblem` data but cannot bypass `compileDesignProblem`.
3. The first synthesis family is explicit and bounded: `tapered-plate-arm`, with an optional declared `rootButtressLengthMm` topology branch.
4. Candidate identity includes exact input problem identity, parameters, derived metrics, violations, and disposition.
5. A `DesignState` binds one exact construction to its candidate evaluation and engineering obligations.
6. Design actions are content-addressed against the exact state that admitted them; stale/tampered or otherwise non-admissible actions fail closed.
7. Search has an explicit state-expansion budget and preserves the generated state/action graph plus winning path; topology actions are admissible only when declared by the grammar.
8. The exhaustive synthesizer remains a verification baseline for the current bounded grammar; search/baseline agreement is tested but not generalized into an optimality claim.
9. Downstream FEA/CAM compilers must reject a candidate whose problem digest does not match the supplied `DesignProblem`.
10. Rejected candidates cannot be passed to the manufacturing planner.
11. build123d is a geometry mechanism and cannot select, repair, or reinterpret a candidate.
12. Geometry realization must remain bound to the exact candidate digest.
13. Structural analysis is requested through a versioned handoff; request creation is not verification.
14. External structural results must match the exact bound geometry/material/load digest before they can become a `StructuralVerificationBinding`.
15. A structural-verification binding records external evidence and screening disposition; it does not promote that evidence to production structural approval.
16. Unsupported FEA geometry is refused rather than silently removed.
17. CAM semantics precede Motion IR; Motion IR precedes controller syntax.
18. Controller target changes may change NC identity but must not change Motion IR identity.
19. G-code/NC is derived output and never canonical design authority.
20. A posted program is not physical-machine authorization or proof of a good part.
21. LinuxCNC standalone-interpreter evidence is accepted only when the recorded receipt binds to the exact controller artifact, NC-text hash, metric machine INI, and tool-table fixture; interpreter acceptance is not realtime machine execution.
22. Drawing/GD&T, DFM, inspection, metrology, and prove-out artifacts are derived from exact upstream identities and cannot redefine the selected candidate.
23. Synthetic metrology and capability projections must remain labeled as simulated/model-based evidence and cannot be represented as physical measurements or production Cp/Cpk.
24. Virtual prove-out may check typed motion/controller semantics but cannot establish fixture/holder collision safety, machine dynamics, or successful physical machining.
25. Report rendering is a mechanism: PDF/SVG/CSV bytes may not become semantic design authority.
26. Machine feedback, metrology feedback, and human corrections all enter recovery policy through the same typed observation compiler.
27. Human corrections are evidence and cannot directly mutate process-control state or bypass diagnosis/admitted-action checks.
28. Dimensional feedback from a quarantined measurement system cannot drive tool/process compensation.
29. Recovery actions modify execution/process-control state only; they cannot silently rewrite canonical design geometry or drawing requirements.
30. Recovery must be verified by post-adjustment observations before a simulated case can be marked restored.
31. Recovery case studies and PDFs are derived simulated evidence and must not be represented as disturbances encountered on a physical machine.