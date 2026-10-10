# Flagship Case Study — Constraint-Driven Sensor Bracket

This is the detailed technical walkthrough for the repository's primary manufacturing case.

The shorter portfolio overview is in the [root README](../README.md).

## 1. Problem definition

The trusted source is a typed `DesignProblem`, not a CAD file and not free-form text.

The flagship declares:

- a mounting interface and datum structure;
- a payload/sensor bore interface;
- a Z-axis structural load case;
- deflection, static factor-of-safety, edge-distance, setup, and optional mass requirements;
- material properties used for screening and external-analysis handoff;
- 3-axis milling capability;
- plate-stock envelope;
- maximum setup count;
- minimum profile-tool diameter;
- Haas, LinuxCNC, and generic RS274 targets;
- a bounded `tapered-plate-arm` grammar;
- an optional retained root-buttress topology;
- ordered design objectives.

Natural-language, GUI, sketch, or agent frontends may propose this data later, but all trusted execution begins after `compileDesignProblem`.

## 2. State-conditioned generative design

The runtime does not ask a model to invent arbitrary CAD.

```text
DesignProblem
   ↓
DesignState
   ↓
explicit satisfied / violated obligations
   ↓
enumerateDesignActions()
   ↓
bounded deterministic policy
   ↓
applyDesignAction()
   ↓
new DesignState
   ↺
```

The current parameter actions include thickness and profile-width changes. The first topology action can add, extend, shorten, or remove a retained in-plane root buttress.

Actions are content-addressed against the exact state that admitted them. Reusing an action digest after changing its fields fails closed.

### Flagship search

Admitting four buttress lengths expands the exhaustive space to **900 candidates**.

The bounded search:

- expands **183 states**;
- generates **400 unique states**;
- explores **734 action edges**;
- selects the exact same winner as exhaustive enumeration.

The selected flagship remains the simpler base construction:

```text
candidate-0046
thickness        8 mm
root half-width 24 mm
arm half-width  14 mm
tip half-width  14 mm
mass            ~62.30 g
```

This is intentional evidence that the search does not prefer topology novelty merely because a topology action exists.

## 3. Topology probe

A controlled second problem freezes the base widths and 6 mm thickness. Under its 0.145 mm displacement screen, the only feasible path is:

```text
base 6 mm plate
  ↓ AddRootButtress(8 mm)
still fails
  ↓ ExtendRootButtress(12 mm)
passes
```

The winner is:

```text
candidate-0001-buttress-12
screening displacement ~0.14474 mm
mass                   ~48.67 g
```

This is a real construction change: it adds another profile station and retained material. It is not a relabeled width edit.

## 4. Geometry realization

build123d 0.13.0 / OCCT is a replaceable mechanism below the trusted TypeScript semantics.

The geometry worker receives one exact candidate and returns:

- solid validity;
- measured volume / area / center of mass / bounding box;
- topology counts;
- STEP;
- STL;
- projected SVG;
- content hashes.

The demo compares the independently evaluated OCCT volume against the semantic candidate volume before continuing.

OCCT inserts a wall-clock timestamp into STEP metadata. The worker normalizes only that known non-semantic header field before hashing so repeated runs produce stable artifact bytes. The normalized STEP was separately round-trip imported as a valid solid.

## 5. Structural verification

The runtime does not own FEA solver truth.

`compileStructuralStudyRequest(problem, candidate)` translates an accepted candidate into the existing structural-verification owner's schema.

Recorded portfolio evidence was produced by real execution of:

- Gmsh **4.15.2-nox**;
- CalculiX **2.23**;
- 8 / 5 / 3.5 mm mesh sequence.

For the flagship:

```text
analytical displacement     ~0.06398 mm
finest-mesh displacement    ~0.06319 mm
requirement                  0.08000 mm
analytical-to-FEA deviation ~1.25%
mesh convergence             pass
```

For the 12 mm buttress topology probe:

```text
analytical displacement     ~0.14474 mm
finest-mesh displacement    ~0.13759 mm
requirement                  0.14500 mm
analytical-to-FEA deviation ~5.2%
mesh convergence             pass
```

Recorded solver results bind back to the exact geometry/material/load digest. A changed digest is refused.

These are screening/verification results, not production structural approval. The model still omits physical effects such as bolt preload, contact/friction, fixture/base compliance, residual stress, nonlinear material behavior, and manufacturing variation.

## 6. Manufacturing plan

The current 2.5D process is deliberately recognizable:

- T2 — mount-pattern drill;
- T3 — finish payload bore;
- T4 — outside profile end mill;
- one top setup;
- G54;
- sacrificial fixture plate;
- explicit positive-Z clearance;
- cutter compensation on the outer profile.

The tight payload-bore tolerance is mapped to a dedicated finish-bore operation rather than being left to drilling.

Workholding, feeds/speeds, tool stickout, coolant, real stock condition, and actual offsets remain physical setup obligations.

## 7. Motion IR before controller syntax

```text
ManufacturingPlan
      ↓
MotionProgram
      ├── SetUnits
      ├── ToolChange
      ├── SpindleOn
      ├── ToolLengthOn
      ├── DrillCycle
      ├── BoreCycle
      ├── CutterCompLeadIn
      ├── FeedLinear
      └── ...
      ↓
controller profiles
      ├── Haas NGC
      ├── LinuxCNC
      └── generic RS274
```

The same `motionDigest` survives target switching.

### A real post bug found by the target interpreter

The first LinuxCNC post emitted the Haas-style form:

```text
G43 H02 Z8
```

LinuxCNC 2.9.8's standalone `rs274` interpreter rejected that because G43 is non-motion in that context.

The profile now owns the semantic difference:

```text
Haas:
G43 H02 Z8

LinuxCNC:
G43 H02
G00 Z8
```

CAM and Motion IR did not change.

## 8. LinuxCNC executable verification

For the LinuxCNC target, the runtime derives a content-addressed verification fixture containing:

- exact NC text hash;
- explicit metric-machine INI;
- exact nominal tool table;
- controller artifact digest;
- Motion IR digest.

Recorded LinuxCNC 2.9.8 `rs274` receipts are accepted only when all those identities bind.

Recorded results:

| Case | Canonical trace |
| --- | ---: |
| Flagship | 126 canonical-function lines |
| Topology probe | 130 canonical-function lines |

The topology trace contains the extra compensated buttress station at X36.76, proving that the topology change survives target interpretation and cutter compensation.

This is controller-semantic verification, not realtime servo/HAL/machine execution.

## 9. Drawing, GD&T, DFM, and inspection

The selected candidate compiles into a manufacturing dossier containing:

- functional datum scheme;
- drawing semantics referencing ASME Y14.5-2018 (R2024);
- ANSI-B-style PDF/SVG engineering drawing;
- basic dimensions;
- size limits;
- datum tags;
- FCF-style controls;
- DFM checks;
- tolerance-to-process mapping;
- inspection characteristics;
- setup sheet.

A deliberate process condition is left visible: datum A flatness/thickness are stock-controlled because the current one-setup plan does not face that surface. The correct response is to verify incoming stock or revise the process—not silently claim a machined datum.

## 10. Simulated metrology and capability

The dossier includes deterministic virtual measurements:

- best-fit plane / circle calculations;
- seven first-article characteristics;
- raw synthetic measurement CSV;
- 30-observation synthetic lot projections;
- Cp/Cpk calculations where two-sided limits exist.

These artifacts demonstrate metrology/control-plan reasoning. They are explicitly labeled **simulated/model-based evidence**, not physical measurements, measurement-system qualification, or production capability.

## 11. Process recovery

The nominal process does not end the story.

The flagship manufacturing plan also feeds a separate observation/recovery runtime:

```text
machine / metrology / human observation
          ↓
typed compilation
          ↓
evidence trust + bounded diagnosis
          ↓
admitted process-control action
          ↓
new observation
          ↓
verification
```

See [RECOVERY.md](RECOVERY.md) for the five cases.

## 12. Reproduce it

```bash
npm install
npm run setup:portfolio
npm run verify
npm run portfolio:demo
```

Primary generated evidence:

```text
artifacts/sensor-bracket-v1/
artifacts/process-recovery/
```

The main artifacts are ignored because they are reproducible. Frozen external-tool evidence required to validate bindings is committed under `examples/`.

## 13. Claim boundaries

This project demonstrates an executable manufacturing-engineering decision stack.

It does **not** claim:

- physical machining;
- actual CMM operation;
- measured production Cp/Cpk;
- validated GR&R;
- physical collision-free workholding;
- real chatter/thermal/tool-wear history;
- machine safety authorization.

Those are deliberately separated from the evidence the repository actually contains.
