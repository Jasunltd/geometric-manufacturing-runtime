# Architecture research notes

> Navigation: [documentation map](README.md) · [flagship case](FLAGSHIP.md) · [recovery case](RECOVERY.md) · [architecture](../ARCHITECTURE.md)

Accessed 2026-10-04.

These sources inform implementation boundaries. They are comparison evidence, not project authority.

## build123d mechanism

- build123d 0.13.0 was released on PyPI on 2026-09-21 and is pinned in `requirements-build123d.txt`: https://pypi.org/project/build123d/0.13.0/
- build123d operations are available in both Builder and Algebra modes. The project uses Algebra-style explicit objects/operations so semantic placement comes from explicit inputs rather than hidden builder context: https://build123d.readthedocs.io/en/latest/operations.html
- The algebra documentation formalizes object combination/subtraction over CAD objects. The trusted TypeScript model remains above this mechanism: https://build123d.readthedocs.io/en/stable/algebra_definition.html
- Current algebra-mode concepts explicitly show `Polyline -> make_face -> extrude`, matching the bounded profile-family backend used here: https://build123d.readthedocs.io/en/latest/key_concepts_algebra.html

The TypeScript candidate and build123d/OCCT realization are checked independently by volume. Placement/extrusion implementation remains backend mechanism and cannot rewrite candidate semantics.

OCCT 8.0 writes the current wall-clock timestamp into the STEP `FILE_NAME` header. That metadata changes bytes without changing geometry, so the worker normalizes only that known timestamp field to `1970-01-01T00:00:00` before artifact hashing. Two-run tests require identical STEP/STL/SVG hashes and realization identity; the normalized STEP has also been round-trip imported through build123d/OCCT as a valid single solid.

## Haas controller semantics

- Haas's current mill programming manual states that only one M-code per block is allowed. It also shows percent-delimited programs, five-digit O program numbers, M06 tool change, G43 tool length compensation, G54 work coordinates, coolant/spindle M-codes, and M30 program end/reset: https://www.haascnc.com/service/online-operator-s-manuals/mill-operator-s-manual/mill---basic-programming.html
- The current Haas basic-programming example applies tool length after a tool change as `G43 H01 Z0.1`; the v0.2 Motion IR therefore carries an explicit clearance Z with tool-length activation rather than emitting a context-free `G43 Hnn`.
- Haas's cutter-compensation documentation requires a D address with G41/G42 and describes compensation entry/exit as motion blocks. Haas alarm documentation also identifies entry/exit moves smaller than the active radius/diameter offset as a cause of cutter-comp interference: https://www.haascnc.com/service/codes-settings.type%3Dgcode.machine%3Dmill.value%3DG41.html and https://www.haascnc.com/service/alarm-search.alarm%3Dngc_367-0000.html
- The current profile therefore emits compensation activation and cancellation on explicit linear lead-in/lead-out moves rather than standalone G41/G40 blocks.
- Haas's M-code reference repeats the one-M-code-per-line rule: https://www.haascnc.com/service/online-operator-s-manuals/mill-operator-s-manual/mill---m-codes.html

The `haas-ngc-mill-v1` profile encodes only the bounded semantics used by the demo. It is not represented as controller certification.

## LinuxCNC controller semantics

- LinuxCNC's current G-code quick reference documents G41/G42 cutter compensation, G43 tool length offsets, G54 work coordinates, G80 cancellation, G81 drilling, G85 boring, G90 absolute mode, G94 feed mode, spindle/coolant M-codes, and M2/M30 program end: https://www.linuxcnc.org/docs/html/gcode.html
- The detailed tool-compensation documentation says `G43 Hn` changes subsequent compensated motion and does not itself cause machine motion; a later compensated-axis move realizes the new endpoint. It also requires a cutter-compensation lead-in at least as long as the largest cutter radius that might be used: https://linuxcnc.org/docs/html/gcode/tool-compensation.html
- The shared Motion IR uses a 10 mm profile lead for the current 10 mm cutter, exceeding the 5 mm cutter radius.
- LinuxCNC documents `rs274` as a standalone G-code interpreter accepting an INI file and tool table: https://linuxcnc.org/docs/2.9/html/man/man1/rs274.1.html
- LinuxCNC also documents `LINEAR_UNITS = mm` as a machine-configuration setting distinct from the program's G20/G21 unit mode. The recorded verification fixture therefore supplies an explicit metric machine INI and exact nominal tool table.

During executable verification, LinuxCNC 2.9.8 `rs274` rejected the original Haas-style `G43 H02 Z8` block because `G43` is not a motion command in that interpreter context. The target profile was corrected to emit `G43 H02` followed by `G00 Z8`, while Haas retains its documented same-block activation form. This is now a controller-profile semantic, not a CAM or Motion-IR special case.

Both recorded demo variants then passed the real standalone interpreter:
- flagship canonical output: 126 lines, SHA-256 `131c0aa38fd6e8a54df2d5f3ade22d7e714fa6851209fbca5af5debd1e81671c`;
- topology-probe canonical output: 130 lines, SHA-256 `779f55ef5d71d406f9e37f18a9842dbcd146af015c83db4bb6b0315baba673e9`;
- LinuxCNC package: 2.9.8, recorded package SHA-256 `9234ff1e831ca42fedeccd08c5b6911f4e835772da04d7cf16fdb805388a64e4`.

The topology canonical trace contains the added compensated buttress station at X36.76, showing that the topology change survives not only NC emission but LinuxCNC's own cutter-compensation interpretation. Interpreter acceptance remains syntax/semantic evidence only; it does not execute realtime motion, HAL/servo behavior, physical offsets, fixtures, or material cutting.

## External structural verification

The sensor-bracket candidate was mapped through the existing structural study in a temporary workspace so the research repository remained untouched.

The recorded result used by the demo came from:
- Gmsh 4.15.2-nox;
- CalculiX 2.23;
- the existing three-level mesh sequence 8 / 5 / 3.5 mm.

The finest mesh reports about 0.06319 mm average displacement at the load interface. The external study reports displacement convergence and about 1.25% analytical-to-finest numerical deviation. The runtime accepts this evidence only when the external geometry digest matches the exact request's geometry/material/load definition.

A second recorded run validates the root-buttress topology probe. With the base plate frozen at 6 mm and a 0.145 mm displacement screen, the action path `AddRootButtress(8 mm) -> ExtendRootButtress(12 mm)` produces `candidate-0001-buttress-12`. Gmsh/CalculiX reports about 0.13759 mm finest-mesh average load displacement, displacement convergence, and about 5.2% analytical-to-finest deviation. This proves the added profile station survives the external verifier rather than being projected away.

## State-conditioned action policy / Taiga-S1 comparison

Taiga-S1 is a 1.2M-parameter FreeCAD next-action model whose runtime snapshots structured CAD state, enumerates commands valid in that state, and scores only those currently available actions. Numeric feature parameters come from the higher-level goal rather than being invented by the policy: https://github.com/shhivv/taiga-s1

The relevant architectural lesson here is the action-mask boundary, not the learned model. The v0.2 design runtime therefore:
- evaluates an exact `DesignState`;
- derives explicit violated/satisfied obligations;
- enumerates only semantic parameter actions valid for that state and grammar;
- binds each action digest to the exact state that admitted it;
- runs a deterministic best-first policy as the baseline teacher;
- preserves the full state/action DAG and winning path.

For the frozen flagship sensor bracket, the optional root-buttress grammar expands exhaustive enumeration to 900 candidates. The policy expands 183 states, generates 400 unique states, and explores 734 action edges while selecting the same `candidate-0046` as exhaustive enumeration. This is case-specific validation, not a claim of general optimality.

A future learned policy can score the same admitted actions without gaining any path that bypasses the typed design/verification boundary.

## Generative-design boundary

The current architecture does not treat natural language as CAD authority.

The trusted input is `DesignProblem`:
- explicit interfaces;
- loads;
- keep-outs;
- engineering constraints;
- material assumptions;
- manufacturing capability;
- bounded grammar families;
- objective order.

Search fills declared parameter holes and may traverse explicitly admitted topology actions. The first topology action is a retained in-plane root buttress chosen because build123d, the variable-width FEA schema, and 3-axis profile CAM can all preserve it exactly. Geometry, FEA, CAM, and NC remain downstream realizations or evidence.

## Drawing, GD&T, metrology, and virtual prove-out

- ASME lists Y14.5-2018 (R2024) as the current reaffirmed Dimensioning and Tolerancing standard. Its scope covers GD&T on engineering drawings, digital models, and related documents: https://www.asme.org/codes-standards/find-codes-standards/y14-5-dimensiones-y-tolerancias/2018
- ASME Y14.100-2017 remains the engineering drawing-practices reference for preparation/revision of manual or computer-generated drawings: https://www.asme.org/codes-standards/find-codes-standards/engineering-drawing-practices
- ASME Y14.45-2021 establishes measurement-data reporting practices for Y14.5-2018 specifications and explicitly covers product acceptance, manufacturing-process evaluation, and design development: https://www.asme.org/codes-standards/find-codes-standards/y14-45-measurement-data-reporting
- The portfolio dossier therefore keeps drawing semantics in typed TypeScript and treats ReportLab as a renderer. The generated drawing is intentionally labeled portfolio/research, not a production release or ASME compliance certification.
- NIST's process-capability guidance defines Cp/Cpk relative to an in-control/stable process and notes that capability estimates require sufficiently large independent samples; NIST separately states that process stability must be demonstrated before capability claims are meaningful: https://www.itl.nist.gov/div898/handbook/pmc/section1/pmc16.htm and https://www.itl.nist.gov/div898/handbook/ppc/section4/ppc45.htm
- The dossier's 30-observation Cp/Cpk values are therefore named **synthetic capability projections** only. They demonstrate calculations and control-plan thinking; they are not process qualification.
- ASME inspection training distinguishes least-squares substitute features from high-point/contact concepts and emphasizes datum precedence and measurement-data reporting. The portfolio virtual CMM uses deterministic least-squares circle/plane fits as an explicitly limited simulated measurement mechanism, not full ASME conformance evaluation: https://www.asme.org/learning-development/find-course/geometric-dimensioning-tolerancing-quality-inspection-reporting
- CAMotics documents LinuxCNC/O-code support and tool/workpiece simulation, but also states that it does not yet detect over/under cutting, tool-shaft or fixture collisions, or rapid moves in material, and that not all LinuxCNC G-code is implemented: https://camotics.org/
- Consequently external material-removal visualization remains optional evidence. The core virtual prove-out replays typed Motion IR modal state, machine-envelope endpoints, clearance, and bounded cut depth while preserving the missing collision/dynamics limitations.

## Observation-driven process recovery

The recovery case studies are grounded as **decision-structure exercises**, not claims that the simulated faults reproduce a particular physical machine.

- Haas current probing documentation says integrated probing can perform in-process inspection, monitor tool wear/breakage, and update work offsets to account for tool wear. This supports treating trusted measurement feedback as a possible input to bounded offset/process corrections rather than changing nominal CAD: https://www.haascnc.com/productivity/probe-system.html
- Haas current mill-chatter guidance says excessive tool wear increases cutting forces, longer tools are less stable, and tool stickout should generally be kept as short as practical; the guide specifically recommends avoiding stickout beyond roughly 3x tool diameter unless necessary and reducing cut load when longer reach is unavoidable: https://www.haascnc.com/service/troubleshooting-and-how-to/troubleshooting/mill-chatter---troubleshooting.html
- The chatter case therefore combines machine vibration with a human correction of actual loaded stickout. It prefers shortening the tool before a feed/spindle fallback when geometry permits.
- NIST's Gauge R&R guidance treats repeatability, reproducibility, stability, bias, resolution, linearity, hysteresis, and drift as measurement-system concerns: https://www.itl.nist.gov/div898/handbook/mpc/section4/mpc4.htm
- The failed-GR&R case therefore quarantines the measurement system and blocks machining compensation instead of steering the process with untrusted measurements.
- NIST states that process stability must be demonstrated before meaningful capability claims and describes a stable process as one with constant mean/variance/distribution over time: https://www.itl.nist.gov/div898/handbook/ppc/section4/ppc45.htm
- NIST's 2026 in-process thermal-compensation work measures machine thermal drift, constructs a model, and modifies G-code to compensate; it reports residual errors below measurement uncertainty in its experimental studies: https://www.nist.gov/publications/process-optical-measurement-and-compensation-machine-tool-thermal-deformations
- NIST's Augmented Intelligence for Manufacturing Systems program explicitly targets combinations of on-machine measurements, machine-control data, physics/modeling, vibration/tool-tip monitoring, thermal drift, and continuously updated process models: https://www.nist.gov/programs-projects/augmented-intelligence-manufacturing-systems-aims

The five committed scenarios therefore exercise a single pattern:

```text
open observation
  -> typed source/evidence
  -> trust/identifiability gate
  -> bounded diagnosis
  -> admitted process-control action
  -> new observation
  -> recovery verification
```

Machine feedback and human corrections share the same intake compiler. Human corrections may repair stale setup facts (for example actual stickout or clamp setting), but they do not directly authorize offsets or state transitions. A quarantined measurement system cannot drive dimensional compensation.

## CNC execution boundary

The retained v0.1 experiment is still informed by:
- NIST RS274NGC interpreter / canonical machining functions;
- LinuxCNC task/interpreter vs realtime motion separation;
- LinuxCNC read-ahead synchronization and external-offset concepts.

Those concerns are intentionally downstream of the v0.2 public design-synthesis story.