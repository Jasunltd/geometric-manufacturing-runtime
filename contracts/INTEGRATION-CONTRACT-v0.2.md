# Integration contract v0.2

Status: current bounded integration seam.  
Authority: none.

## Frontends

Text, sketch, GUI, optimization, and agent interfaces are replaceable frontends. They may emit proposed `gmr.design-problem/v1` values only.

No frontend receives a privileged CAD-generation path.

## Geometry backend

```text
DesignCandidate + exact digest
  -> GeometryBackend
  -> source-bound realization + STEP/STL/SVG + hashes
```

The current implementation uses build123d 0.13.0 through a Python worker.

## Structural-verification owner

```text
DesignProblem + DesignCandidate
  -> StructuralStudyRequest
  -> toolchain binding
  -> existing fixture-load-path structural verifier
  -> fixture-structural.analysis/v1 result
  -> bindExistingFixtureStudyResult
  -> StructuralVerificationBinding
```

The design runtime does not import solver implementation semantics. Unsupported geometry fails closed at this seam.

The external result is accepted only when its study identity and geometry digest match the exact request. That geometry digest is defined by the external verifier over the request's geometry, material, and load case. Solver/toolchain executables remain mechanism configuration and are not part of design identity.

A `StructuralVerificationBinding` may derive a screening comparison against the `DesignProblem` requirements while preserving the external result as the evidence source. It does not turn a screening requirement into certified structural acceptance.

## Manufacturing/controller boundary

```text
DesignCandidate
  -> ManufacturingPlan
  -> MotionProgram
  -> ControllerProfile
  -> ControllerProgram
```

The controller program binds to the same `motionDigest`. Switching Haas/LinuxCNC targets changes only the target realization unless a capability mismatch is explicitly returned.

## Manufacturing-dossier boundary

```text
DesignProblem + DesignCandidate + ManufacturingPlan + MotionProgram
  -> ManufacturingDossier
       -> DrawingSpec / GD&T projection
       -> DFM report
       -> InspectionPlan
       -> deterministic simulated metrology/capability
       -> typed virtual prove-out
  -> DossierRenderer
  -> PDF / SVG / CSV artifacts + hashes
```

This projection may identify process/inspection obligations and may refuse or condition downstream claims. It may not mutate design authority. In particular, synthetic measurements are not physical measurements, synthetic Cp/Cpk is not production capability, and virtual prove-out is not machine authorization.

External controller/interpreter and material-removal simulators are verification mechanisms. Their receipts must bind to the exact posted-program identity and preserve the simulator/version/tool-table assumptions. Parser acceptance or virtual cutting remains distinct from physical machining.

## Observation/recovery boundary

```text
machine feedback / metrology / human correction
  -> compileProcessObservation(s)
  -> trusted ProcessObservation[]
  -> assessProcessException(plan, processState, observations)
  -> RecoveryAssessment
       -> admitted process-control actions
       -> hold / quarantine
       -> insufficient-evidence refusal
  -> applyRecoveryAction
  -> adjusted ProcessControlState
  -> independent verification observations
  -> verifyRecovery
```

Observation sources are data providers, not semantic owners. Human input is allowed to correct stale setup facts, but it enters as evidence and cannot bypass the same compiler, measurement-system trust gates, diagnosis, or admitted-action checks.

A future machine connector may bind selected recovery actions to controller offsets, probing macros, tool-management systems, or approved operator work instructions. That connector must remain downstream of an explicit machine/setup authorization contract; the current portfolio runtime does not directly command physical equipment.

A quarantined measurement system may produce data for investigation but cannot drive automatic dimensional compensation. Measurement-system restoration and process restoration are separate dispositions.

## Future physical execution

Machine/tool/setup observations, freshness, leases, fencing, and execution receipts remain a later cyber-physical boundary. The retained v0.1 late-binding experiment may be composed here only after the portfolio-level design/manufacturing path is stable.

## Research program

The CI research program owns study design, evidence admission, experimental comparison, and public claims. Runtime outputs become research evidence only when explicitly admitted by that owner.