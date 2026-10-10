# Architecture

> Portfolio overview: [README.md](README.md) · Documentation map: [docs/README.md](docs/README.md) · Contracts: [contracts/README.md](contracts/README.md)

## 1. Architectural thesis

v0.2 treats generative CAD as a **bounded engineering synthesis problem**, not a natural-language completion problem.

```text
partial engineering specification
        +
allowed parametric grammar
        +
deterministic constraints / objectives
        =
searchable design space
```

Geometry is a realization of a selected semantic candidate. Analysis and manufacturing are downstream evaluators/compilers over exact identities.

The previous v0.1 experiment proved a narrower idea: tool/process-generated geometry can remain canonical while measured physical tool state changes execution. That subsystem remains useful later, but v0.2 moves the primary authority boundary upward to `DesignProblem`.

## 2. Trusted semantic flow

```text
open input
   |
   v
compileDesignProblem
   |
   v
DesignProblem -----------------------------+
   |                                       |
   v                                       |
evaluateDesignState                       |
   |                                       |
   v                                       |
DesignState                                |
   |                                       |
   v                                       |
enumerateDesignActions                     |
   |                                       |
   v                                       |
searchDesign                               |
   |                                       |
   +--> rejected states + obligations      |
   |                                       |
   v                                       |
DesignCandidate                            |
   |                                       |
   +--> GeometryBackend (build123d)         |
   |      -> realization + artifacts        |
   |                                       |
   +--> compileStructuralStudyRequest ------+--> existing FEA owner
   |
   v
planCandidateManufacturing
   |
   v
ManufacturingPlan
   |
   v
compileMotionProgram
   |
   v
MotionProgram
   |
   +--> postMotionProgram(Haas)
   +--> postMotionProgram(LinuxCNC)
   +--> postMotionProgram(Generic)
   |
   +--> buildManufacturingDossier
           |
           +--> drawing / GD&T
           +--> DFM
           +--> inspection plan
           +--> simulated metrology / capability
           +--> virtual prove-out
           +--> deterministic PDF / SVG / CSV packet
   |
   +--> process observations
           |
           +--> machine feedback
           +--> metrology
           +--> human correction
           |
           v
       recovery assessment
           |
           v
       admitted process adjustment
           |
           v
       post-adjustment verification
```

No downstream projection may silently redefine the upstream design problem or selected candidate.

## 3. Why natural language is not authoritative

Natural language may be useful for proposing:

- interface definitions;
- requirements;
- load cases;
- keep-outs;
- objective choices;
- parameter ranges.

But a model-generated sentence does not establish geometry or engineering truth.

Every frontend must produce the same typed `DesignProblem` and pass the same deterministic compiler. Missing, unsupported, contradictory, or unsafe-to-infer information remains explicit rather than being filled with plausible prose.

## 4. Module ownership

| Module | Owns | Must not own |
| --- | --- | --- |
| `design/` | DesignProblem, grammar ranges, deterministic candidate evaluation, state/action semantics, bounded search, analytical screening, ranking | OCCT/build123d internals, FEA toolchains, G-code |
| `geometry/` | geometry-backend mechanism contract, build123d realization receipt and artifact hashes | design policy or candidate selection |
| `analysis/` | translation of an exact candidate into external verification requests | solver truth, FEA implementation, candidate mutation |
| `cam/` | bounded process/setup/tool/operation planning from accepted candidate semantics | controller syntax, physical-machine authority |
| `motion/` | controller-neutral executable motion semantics | vendor dialect policy |
| `controllers/` | versioned target semantics, NC lowering, standalone-interpreter verification fixtures, and recorded evidence binding | design/CAM authority, physical-machine authorization |
| `dossier/` | functional drawing/GD&T projection, DFM review, inspection plan, simulated metrology/capability, typed virtual prove-out, reporting contract | design authority, physical measurement, production capability, machine authorization |
| `recovery/` | typed machine/metrology/human observation intake, evidence-quality gates, bounded diagnosis, process-control state, admitted recovery actions, post-adjustment verification, case-study projection | canonical design mutation, unvalidated physical authority, privileged human bypass, compensation from quarantined measurement systems |
| `repl/` | closed semantic interaction and local session history | arbitrary code execution, hidden defaults |
| `integrity/` | canonical encoding and content identity | semantic repair |
| `program/` | legacy v0.1 tool-generated geometry experiment | primary v0.2 design authority |
| `execution/` | legacy/future physical-state late binding and lifecycle | design synthesis |
| `runtime/` | Effect composition for downstream mechanisms | semantic truth |
| `integration/` | content-addressed cross-system provenance | reinterpretation of external evidence |

## 5. Deep functions

### `compileDesignProblem(input)`

Answers: **is this open value a supported engineering problem?**

It hides schema normalization and supported-boundary checks. It does not synthesize geometry.

### `evaluateDesignState(problem, parameters)`

Answers: **what exact engineering state results from this admitted construction?**

It evaluates one construction into a deterministic candidate plus explicit satisfied/violated obligations.

### `enumerateDesignActions(problem, state)`

Answers: **which semantic one-step changes are valid now and which current violations could each address?**

It is the action-mask boundary. Actions outside the declared grammar, relational constraints, or current obligation context are not emitted.

### `applyDesignAction(problem, state, action)`

Answers: **does this exact content-addressed action still belong to this exact state, and what state results from applying it?**

Tampered, stale, or otherwise non-admissible actions fail closed.

### `searchDesign(problem [, options])`

Answers: **can bounded deterministic search reach a feasible state through only admitted actions within the declared budget?**

The current policy is best-first over the problem's objective ordering and starts at the grammar minimum. It records every generated state/action edge and an exact winning path. It is a baseline/teacher policy, not a learned model.

### `synthesizeDesignSpace(problem)`

Answers: **what does exhaustive enumeration say the feasible set and winning candidate are?**

It is retained as a falsifying baseline for the bounded action search. The first family is still the bounded `tapered-plate-arm`.

### `GeometryBackend.realize(candidate)`

Answers: **what B-Rep realization and measurable geometry does this exact candidate produce in the configured backend?**

The build123d mechanism uses its algebra API and returns exact source binding plus STEP/STL/SVG artifacts and hashes.

### `compileStructuralStudyRequest(problem, candidate)`

Answers: **can this exact candidate be represented by the existing structural-study contract, and what request should that owner evaluate?**

It does not run FEA or establish structural truth.

### `planCandidateManufacturing(problem, candidate)`

Answers: **what bounded 3-axis process plan realizes this feasible candidate under the declared v0.2 process model?**

It exposes tools, setup, operations, and assumptions.

### `compileMotionProgram(plan)`

Answers: **what controller-neutral motion semantics implement this process plan?**

The result contains no Haas/LinuxCNC-specific syntax.

### `postMotionProgram(motion, controllerProfile)`

Answers: **how does this exact Motion IR lower under one declared controller semantic profile?**

The result is a derived NC artifact plus block-to-Motion-IR trace.


### `buildManufacturingDossier(problem, candidate, plan, motion)`

Answers: **what drawing, DFM, inspection, simulated metrology, and virtual-prove-out evidence follows from this exact selected candidate and manufacturing semantics?**

The dossier is a derived engineering packet. It can expose process gaps and inspection obligations, but it cannot promote simulated measurements, synthetic capability, or virtual replay into physical production evidence.

### `DossierRenderer.render(candidate, plan, dossier)`

Answers: **what deterministic human-review artifacts represent this exact dossier?**

The ReportLab mechanism emits drawing/DFM/inspection/metrology/setup PDFs plus SVG/CSV artifacts and hashes. Rendering is not semantic authority.


### `compileProcessObservation(input)`

Answers: **is this open machine, metrology, or human value an admitted process observation?**

Machine and human inputs share this boundary. Human corrections remain observations and cannot directly mutate process-control state.

### `assessProcessException(plan, state, observations)`

Answers: **what bounded diagnosis is supported by the current evidence, and which recovery actions are currently admissible?**

The assessment may recommend a correction, hold/quarantine a measurement system, return no action, or refuse to diagnose when evidence is insufficient. Measurement-system trust is checked before dimensional feedback can drive compensation.

### `applyRecoveryAction(state, assessment, actionId)`

Answers: **what explicit process-control state results from one action admitted by this exact assessment?**

Recovery changes tool/process offsets, clamp/load/stickout settings, measurement-system status, or process holds. It does not change nominal product geometry.

### `verifyRecovery(assessment, adjustedState, observations)`

Answers: **did independent post-adjustment observations actually resolve the bounded exception?**

The result distinguishes restored process behavior from measurement-system restoration and unresolved cases.

### `runProcessRecoveryScenario(plan, input)`

Answers: **does one complete observation → diagnosis → action → verification case execute through the same public recovery semantics?**

Five committed scenarios exercise machine feedback, metrology feedback, and human corrections without case-specific bypasses.

## 6. First design grammar

The v0.2 grammar intentionally does not try to generate arbitrary 3D CAD.

```text
TaperedPlateArm
  thickness          ∈ declared range
  root half-width    ∈ declared range
  arm half-width     ∈ declared range
  tip half-width     ∈ declared range
  root-buttress length ∈ optional declared range

fixed semantic interfaces:
  two mounting holes at mount interface
  one payload/sensor bore at payload interface

derived:
  symmetric tapered profile
  mass
  section properties
  analytical deflection/stress screen
  manufacturing contour
```

This is a partial-program synthesis model: the family/topology is explicit, while parameter holes are searched under engineering constraints.

The action graph now admits one topology-changing construction: a retained in-plane `RootButtress`. It delays the root taper by a declared grammar length, adding a profile station/material while remaining an exact plate-stock contour. build123d, the existing variable-width structural verifier, and 3-axis contour CAM all consume the same profile. Vertical 3D ribs, pockets, and other topology changes remain absent until every downstream owner can represent them without silent approximation.

Topology changes are permitted only when explicitly admitted by the grammar and when geometry, analysis, and manufacturing projections preserve the same construction exactly. The root-buttress probe is the first such case.

New grammar families require their own falsifiable case rather than being added as generic unused abstraction.

## 7. Geometry realization and independent checks

The TypeScript candidate model and build123d realization are deliberately separate.

```text
DesignCandidate
    |
    +--> semantic area/volume calculation
    |
    +--> Python/build123d/OCCT solid
              |
              +--> independent volume
              +--> validity
              +--> topology counts
              +--> STEP/STL/SVG
```

The demo refuses to continue if the independent volume disagrees beyond the declared tolerance. The current worker constructs the 2D semantic profile, extrudes it to the declared thickness, and subtracts explicit through cylinders; backend placement remains mechanism detail and is checked by the independent volume comparison.

## 8. Structural verification integration

The structural-verification project remains a separate research/verification owner.

Its existing model accepts:

- extruded half-width profile;
- mount/load holes;
- thickness;
- material properties;
- z-axis load;
- mesh-convergence settings;
- Gmsh/CalculiX toolchain binding.

The runtime compiles to that shape rather than creating a second FEA semantics model.

A design keep-out that cannot be faithfully represented in the existing FEA schema is refused by the adapter. The system will not silently omit geometry and call the result correlated analysis.

## 9. Manufacturing planning

The first process model uses recognizable 2.5D operations:

```text
G54 / top setup
  -> drill mounting pattern
  -> finish payload bore
  -> profile outside contour with controller cutter compensation
```

The plan owns semantic operations and tooling assumptions. It does not own controller syntax or production feed/speed authority.

The current one-setup fixture is a declared sacrificial fixture plate. This is an explicit process assumption, not inferred hidden workholding.

## 10. Motion IR and controller semantics

CAM and postprocessing are separate compilers:

```text
ManufacturingPlan
      |
      v
MotionProgram
  SetUnits
  ToolChange
  SpindleOn
  ToolLengthOn
  DrillCycle
  BoreCycle
  CutterCompOn
  FeedLinear
  ...
      |
      +--> Haas NGC
      +--> LinuxCNC
      +--> generic RS274
```

A controller profile is semantic target data, not a string-template switch.

For example, the current Haas target declares percent delimiters, an O-number, M06/M03 spelling, M30 program end, G81/G85/G41/G42/G43/G54 support, and a maximum of one M-code per block. The LinuxCNC target uses its own program envelope, M2 termination, and separate `G43 Hnn` / `G00 Z...` activation because the standalone LinuxCNC interpreter treats G43 as non-motion.

The same `motionDigest` must survive across controller targets; only the derived NC artifact identity changes.

For the LinuxCNC target, `compileLinuxCncVerificationFixture` derives an explicit metric machine INI, exact nominal tool table, NC-text hash, and fixture digest. A recorded LinuxCNC 2.9.8 `rs274` receipt is accepted only when `bindLinuxCncRs274Receipt` can bind it to that exact program/fixture identity. The canonical interpreter trace is preserved as evidence, but interpreter success remains distinct from realtime machine execution.

## 11. Effect boundary

Effect is reserved for mechanisms:

- build123d Python worker;
- ReportLab dossier renderer;
- future external structural-study runner;
- physical-state sources;
- optional external LinuxCNC/CAMotics execution adapters when rerunning recorded verification.

Pure design synthesis, CAM planning, Motion IR compilation, target lowering, dossier compilation, virtual metrology mathematics, virtual prove-out, LinuxCNC verification-fixture creation, and recorded-receipt binding remain directly testable deterministic functions where possible.

Mechanism success is observation, not semantic or physical authority.

## 12. XState boundary

XState remains appropriate for lifecycles such as:

```text
problemCompiled
 -> synthesized
 -> candidateSelected
 -> geometryRealized
 -> verificationRequested
 -> manufacturingPlanned
 -> motionCompiled
 -> posted
```

and for the retained physical execution lifecycle.

It must not own design search, FEA equations, CAM geometry, or controller semantics. Guards remain pure.

## 13. REPL

The REPL mirrors the semantic architecture:

```text
problem({...})
search()
synthesize()  # exhaustive baseline
candidates()
select(...)
inspect()
fea()
cam()
motion()
post(...)
```

It is not a shell and not a natural-language agent. A future frontend may be graphical, sketch-driven, optimization-driven, or model-assisted and still use the same semantic surface.

## 14. Relationship to the v0.1 late-binding experiment

v0.1 remains valuable for a later question:

> Can a nominal manufacturing construction remain fixed while measured tool/machine state changes a bounded execution plan?

Those modules/tests remain intact, but they are downstream of the new design-system story.

Potential future composition:

```text
DesignCandidate
 -> ManufacturingPlan
 -> Motion IR
 -> physical-state late binding
 -> committed execution horizon
 -> CNC kernel
```

The v0.2 portfolio does not need to solve that entire runtime before demonstrating value.

## 15. Safety and evidence boundary

The current project demonstrates architecture and bounded engineering calculations. It does **not** claim:

- production structural adequacy;
- certified GD&T;
- certified CAM/post output;
- validated shop feeds/speeds;
- safe workholding;
- controller certification;
- physical machine readiness.

Those become separate verified evidence when a case study actually supports them.