# Design contract v0.1

Status: frozen initial hypothesis boundary.  
Authority: none.

## Canonical ownership

1. A manufacturing construction is the canonical source of generated geometry.
2. A generated dimension such as a capsule radius is not independently authored when it is a direct consequence of the generating tool/process.
3. Machine, tool-measurement, fixture, thermal, calibration, and observation state are **execution bindings**, not silent edits to canonical geometry.
4. G-code and controller-native motion are projections of an immutable execution plan, not competing sources of truth.
5. Research packs, FEA results, StateMaps, machine observations, execution receipts, and metrology results retain their original owners and are referenced by identity rather than copied into a universal mutable twin.

## Ownership

| Owner | Semantic responsibility | Non-goals |
| --- | --- | --- |
| program | generating tool/process DAG and derived canonical geometry | machine state, controller syntax |
| boundary | compile open/native inputs into trusted records | policy, authority |
| execution | deterministic late binding, plan identity, lifecycle | telemetry acquisition, realtime servo logic |
| integration | bind exact identities across external evidence domains | reinterpret external evidence |
| runtime | Effect service composition | semantic truth |
| backends | lower immutable plan to target artifact | edit canonical program |
| repl | closed human interaction with semantic operations | arbitrary code or physical authority |
| integrity | canonical encoding and digest verification | repair or policy |

## Commit/barrier rule

An execution plan may be committed only for an exact program geometry identity, machine identity, and physical-state snapshot identity. A physical observation that invalidates read-ahead is represented as an explicit lifecycle barrier. The runtime never permits a REPL operation to mutate motion already committed below that barrier.

## Refusal rule

When the bounded compiler cannot prove a supported realization, it returns a typed refusal. It does not:

- mutate the design;
- substitute a different process silently;
- widen compensation limits;
- mark stale state current;
- treat a mechanism success as physical evidence.
