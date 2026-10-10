# Code contract v0.2

Status: current implementation rule.  
Authority: none.

This contract projects the Agent Workbench deep-function/language doctrine onto the v0.2 runtime.

## Trusted TypeScript

- strict typing, exact optional properties, and checked indexing remain enabled;
- closed semantic alternatives use tagged/discriminated unions;
- open `unknown` stops at named compiler/boundary functions;
- expected failures are typed data or Effect errors;
- no unchecked `any` in trusted paths;
- semantic identity is explicit and content-addressed where appropriate;
- mechanism-specific paths/process handles never become semantic identity.

## Deep-function questions

- `compileDesignProblem`: is the open input a supported engineering problem?
- `evaluateDesignState`: what exact candidate and obligation state does one admitted construction produce?
- `enumerateDesignActions`: which parameter or admitted topology moves are valid now and which violations could each address?
- `applyDesignAction`: is a state-bound action still authentic/admissible, and what state results?
- `searchDesign`: can bounded deterministic action search reach a feasible candidate with complete graph provenance?
- `synthesizeDesignSpace`: what does exhaustive enumeration report as the current small-grammar baseline?
- `GeometryBackend.realize`: what exact geometry did this candidate realize into?
- `compileStructuralStudyRequest`: can the current verification owner represent this exact candidate?
- `bindExistingFixtureStudyResult`: does an external structural result bind to the exact request, and what screening evidence can be projected without taking solver authority?
- `planCandidateManufacturing`: what bounded process plan realizes the feasible candidate?
- `compileMotionProgram`: what controller-neutral motion expresses that plan?
- `postMotionProgram`: how does one target controller represent that same motion meaning?
- `compileLinuxCncVerificationFixture`: what explicit metric-machine/tool-table fixture binds executable LinuxCNC verification to this exact posted program?
- `bindLinuxCncRs274Receipt`: does a recorded standalone-interpreter result bind to that exact fixture/program identity?
- `buildManufacturingDossier`: what drawing/DFM/inspection/simulated-metrology/prove-out packet derives from the exact selected candidate and manufacturing semantics?
- `DossierRenderer.render`: what deterministic human-review artifacts represent that exact dossier without taking semantic authority?
- `compileProcessObservation(s)`: are these open machine/metrology/human values admitted observations?
- `assessProcessException`: what diagnosis is supported and what recovery actions are currently admissible?
- `applyRecoveryAction`: what explicit process-control state results from one action admitted by the exact assessment?
- `verifyRecovery`: did independent post-adjustment observations restore the bounded process condition?
- `runProcessRecoveryScenario`: does a complete case execute through the same observation/diagnosis/action/verification path?

Private helpers may remain large when they hide one coherent concept. Splitting solely for line count is forbidden.

## Python/build123d boundary

- Python owns no design policy;
- worker input is inert JSON;
- worker output is validated before trust;
- explicit placements/extrusions are preferred over context-sensitive builder state;
- generated artifact bytes are hashed;
- backend errors remain mechanism failures;
- build123d/OCCT object identity is never persisted as semantic identity.

## Reporting/metrology mechanism

- drawing, GD&T, DFM, inspection, metrology, capability, and prove-out semantics are owned by trusted TypeScript;
- ReportLab receives inert JSON and owns only PDF/SVG/CSV rendering;
- PDF/report bytes are hashed but remain derived artifacts;
- virtual CMM fits and synthetic lots must be deterministic for a fixed candidate/dossier identity;
- synthetic measurement data must never be labeled as physical measurement;
- synthetic Cp/Cpk must never be labeled as production capability;
- physical process capability requires stable, representative measured process data and an adequate measurement system;
- controller/interpreter acceptance, when recorded, is evidence about syntax/semantics only and is not machine authorization.

## Observation/recovery boundary

- open machine, metrology, and human inputs compile before diagnosis policy;
- human corrections are typed observations, not privileged state mutations;
- assessment may recommend, refuse, hold, or quarantine; it must not manufacture certainty from missing evidence;
- recovery actions are admitted by an assessment bound to the exact process-control state;
- untrusted/quarantined measurement systems may not drive dimensional compensation;
- canonical design geometry and drawing requirements remain unchanged by process recovery;
- post-adjustment verification requires new observations rather than assuming an action succeeded;
- simulated recovery reports must state that the disturbances are synthetic portfolio exercises.

## Effect

Effect owns explicit mechanisms and dependencies. Pure semantic calculations stay pure.

A successful Effect indicates mechanism completion only; it does not mint engineering, research, safety, or execution authority.

## XState

XState owns lifecycle sequencing, not calculations. Guards remain pure. Engineering policy lives in typed evaluators and contracts.

## Controller lowering

Vendor behavior belongs in versioned `ControllerProfile` data plus a target compiler. Do not scatter `if vendor === ...` policy across CAM.

The postcompiler must preserve the exact Motion IR digest and emit traceability from NC blocks to Motion IR command indices.

Cutter compensation entry/exit is represented in Motion IR as explicit lead moves rather than standalone mode toggles. Tool-length activation carries an explicit safe-Z destination so controller lowering cannot forget the clearance move.

Controller profiles own the block semantics of that activation. Haas may lower it as `G43 Hnn Z...`; LinuxCNC lowers it as `G43 Hnn` followed by a separate `G00 Z...` because the standalone RS274 interpreter rejects an axis word on the non-motion G43 block.