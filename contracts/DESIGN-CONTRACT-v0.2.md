# Design contract v0.2

Status: current architecture contract.  
Authority: none.

## Source-of-truth model

The canonical public design input is a structured engineering problem, not prose and not generated build123d code.

```text
DesignProblem
  -> deterministic design-space synthesis
  -> selected DesignCandidate
  -> geometry / verification / manufacturing projections
```

`DesignProblem` owns the declared interfaces, constraints, requirements, material assumptions, manufacturing capability, allowed grammar, and objective ordering.

`DesignCandidate` owns one exact parametric construction within that declared space.

## Ownership rules

| Owner | Owns | Must not own |
| --- | --- | --- |
| design | engineering-problem schema, candidate grammar/search, screening disposition | OCCT state, solver/toolchain execution, controller syntax |
| geometry | exact backend realization and source-bound artifacts | candidate selection or design-policy repair |
| analysis | typed handoff to external verification owner | structural truth or design mutation |
| cam | tooling/setup/process-operation semantics | vendor controller syntax |
| motion | controller-neutral executable motion meaning | vendor dialect |
| controllers | target-specific NC semantics and syntax | design/CAM policy |
| repl | closed semantic interaction | arbitrary code/NL execution |
| execution | later physical-state binding and lifecycle | upstream design authority |
| integration | exact provenance bindings | promotion of evidence/authority |

## Generative-design rule

The design runtime searches only explicitly admitted grammar families, parameter ranges, and state-conditioned semantic actions.

It may:
- fill declared parameter holes;
- derive deterministic geometry relationships;
- calculate screening metrics;
- represent satisfied and violated engineering obligations;
- enumerate only actions valid for the exact current state;
- apply content-addressed actions bound to that state;
- reject infeasible candidates/states;
- run bounded deterministic search;
- rank feasible candidates by declared objective order.

It may not:
- invent a new topology outside the admitted grammar;
- label a downstream approximation as equivalent topology when an owner cannot represent the construction exactly;
- invent missing functional requirements;
- silently relax a constraint;
- execute an action that was not in the current state's admitted action set;
- reuse a stale/tampered action identity;
- treat a screening equation as verified FEA;
- hide why a candidate/state was rejected.

An admitted topology action must produce a construction that every required downstream owner for the case can represent without silent deletion or substitution. The first admitted topology action is a retained in-plane root buttress; vertical 3D ribs remain unsupported.

The exhaustive `synthesizeDesignSpace` path remains a baseline oracle for the current small grammar. Agreement with that baseline is evidence for the current search policy; it is not a proof that future grammars or policies are globally optimal.

## Geometry rule

build123d/Python is a realization mechanism.

A candidate must be reproducible without treating generated Python, incidental OCCT topology IDs, or serialized STEP bytes as design authority.

The backend returns measured realization evidence and artifact hashes. Disagreement between semantic calculations and realized geometry is a verification failure to investigate, not a reason to rewrite semantics automatically.

## Analysis rule

Structural results remain owned by the structural-verification system. The design runtime may issue an exact request and later consume a source-bound result, but it may not claim that request generation, solver execution, or a passing number automatically authorizes the design.

Analysis does not directly mutate the candidate. A failed requirement may motivate a new proposed candidate/search, preserving both histories.

## Manufacturing rule

Manufacturing capability participates before CAM through the `DesignProblem` and candidate feasibility checks.

CAM then derives a process plan from an accepted candidate.

Controller selection occurs only after controller-neutral Motion IR exists.

## Historical/currentness rule

A historical design candidate, geometry realization, FEA receipt, manufacturing plan, motion program, or NC artifact remains reproducible by identity. Whether it is still current enough for downstream use is a separate binding/currentness question.