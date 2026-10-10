import {
  compileStructuralStudyRequest,
} from "../analysis/index.js";
import {
  planCandidateManufacturing,
} from "../cam/index.js";
import {
  controllerProfile,
  postMotionProgram,
  type ControllerProgram,
} from "../controllers/index.js";
import {
  compileDesignProblem,
  searchDesign,
  synthesizeDesignSpace,
} from "../design/index.js";
import type {
  DesignCandidate,
  DesignProblem,
  DesignSynthesis,
} from "../design/model.js";
import type { DesignSearch } from "../design/search.js";
import {
  compileMotionProgram,
} from "../motion/index.js";
import type { ManufacturingPlan } from "../cam/model.js";
import type { StructuralStudyRequest } from "../analysis/structural.js";
import type { MotionProgram } from "../motion/model.js";
import type {
  ReplCommand,
  ReplHistoryEntry,
  ReplResult,
} from "./contracts.js";
import { parseReplLine } from "./parser.js";

const HELP = [
  "Constraint-Driven Generative Manufacturing REPL",
  "",
  "Trusted semantic commands:",
  "  problem({...})                 compile a structured DesignProblem",
  "  search()                       run state-conditioned bounded design search",
  "  synthesize()                   run exhaustive grammar baseline",
  "  candidates([limit])            list best exhaustive-baseline candidates",
  '  select("candidate-id")          select one known candidate',
  '  inspect(["candidate-id"])       inspect selected/named candidate',
  "  fea()                          compile the existing structural-study request",
  "  cam()                          derive the bounded manufacturing plan",
  "  motion()                       lower CAM into controller-neutral Motion IR",
  '  post("haas-ngc")               lower the same Motion IR to Haas NGC',
  '  post("linuxcnc")               lower the same Motion IR to LinuxCNC',
  '  post("generic-rs274")          lower to generic RS274 compatibility output',
  "  status()                       show current semantic identities",
  "  history()                      show local non-authoritative REPL history",
  "  help()                         show this help",
  "  exit()                         leave the REPL",
  "",
  "Natural language is not executed here. A language/sketch/GUI frontend may only",
  "compile into the same DesignProblem boundary before entering this runtime.",
].join("\n");

export class GeometricManufacturingReplSession {
  #problem: DesignProblem | undefined;
  #search: DesignSearch | undefined;
  #synthesis: DesignSynthesis | undefined;
  #selected: DesignCandidate | undefined;
  #structural: StructuralStudyRequest | undefined;
  #manufacturing: ManufacturingPlan | undefined;
  #motion: MotionProgram | undefined;
  #lastController: ControllerProgram | undefined;
  readonly #history: ReplHistoryEntry[] = [];
  #sequence = 0;

  history(): readonly ReplHistoryEntry[] {
    return this.#history.map((entry) => ({ ...entry }));
  }

  evaluate(input: string): ReplResult {
    const command = parseReplLine(input);
    const result = this.#dispatch(command);
    this.#sequence += 1;
    this.#history.push(
      Object.freeze({
        sequence: this.#sequence,
        input,
        resultKind: result.kind,
      }),
    );
    return result;
  }

  #resetDownstream(): void {
    this.#search = undefined;
    this.#synthesis = undefined;
    this.#selected = undefined;
    this.#structural = undefined;
    this.#manufacturing = undefined;
    this.#motion = undefined;
    this.#lastController = undefined;
  }

  #selectCandidate(candidate: DesignCandidate): DesignCandidate {
    if (candidate.disposition !== "feasible") {
      throw new TypeError(
        "candidate " +
          candidate.id +
          " is rejected and cannot drive downstream engineering",
      );
    }
    this.#selected = candidate;
    this.#structural = undefined;
    this.#manufacturing = undefined;
    this.#motion = undefined;
    this.#lastController = undefined;
    return candidate;
  }

  #requireProblem(): DesignProblem {
    if (this.#problem === undefined) {
      throw new TypeError("compile a DesignProblem first");
    }
    return this.#problem;
  }

  #requireSynthesis(): DesignSynthesis {
    if (this.#synthesis === undefined) {
      throw new TypeError("run synthesize() first");
    }
    return this.#synthesis;
  }

  #requireSelected(): DesignCandidate {
    if (this.#selected === undefined) {
      throw new TypeError("run search() or select a feasible candidate first");
    }
    return this.#selected;
  }

  #knownCandidate(candidateId: string): DesignCandidate | undefined {
    const exhaustive = this.#synthesis?.candidates.find(
      (candidate) => candidate.id === candidateId,
    );
    if (exhaustive !== undefined) return exhaustive;
    return this.#search?.states
      .map((state) => state.candidate)
      .find((candidate) => candidate.id === candidateId);
  }

  #dispatch(command: ReplCommand): ReplResult {
    switch (command.kind) {
      case "help":
        return { kind: "help", text: HELP };
      case "status": {
        const problemDigest =
          this.#search?.problemDigest ?? this.#synthesis?.problemDigest;
        return {
          kind: "status",
          ...(problemDigest === undefined ? {} : { problemDigest }),
          ...(this.#search === undefined
            ? {}
            : { searchDigest: this.#search.searchDigest }),
          ...(this.#synthesis === undefined
            ? {}
            : { synthesisDigest: this.#synthesis.synthesisDigest }),
          ...(this.#selected === undefined
            ? {}
            : { selectedCandidateDigest: this.#selected.candidateDigest }),
          ...(this.#structural === undefined
            ? {}
            : { structuralRequestDigest: this.#structural.requestDigest }),
          ...(this.#manufacturing === undefined
            ? {}
            : { manufacturingPlanDigest: this.#manufacturing.planDigest }),
          ...(this.#motion === undefined
            ? {}
            : { motionDigest: this.#motion.motionDigest }),
          ...(this.#lastController === undefined
            ? {}
            : {
                lastControllerArtifactDigest:
                  this.#lastController.artifactDigest,
              }),
        };
      }
      case "history":
        return { kind: "history", entries: this.history() };
      case "exit":
        return { kind: "exit" };
      case "problem": {
        const result = compileDesignProblem(command.input);
        if (result._tag === "Compiled") {
          this.#problem = result.value;
          this.#resetDownstream();
        }
        return { kind: "problem", result };
      }
      case "search": {
        const search = searchDesign(this.#requireProblem());
        this.#search = search;
        if (search.winner !== undefined) {
          this.#selectCandidate(search.winner.candidate);
        }
        return { kind: "search", search };
      }
      case "synthesize": {
        const synthesis = synthesizeDesignSpace(this.#requireProblem());
        this.#synthesis = synthesis;
        const selected = synthesis.feasibleCandidates[0];
        if (selected !== undefined) this.#selectCandidate(selected);
        return { kind: "synthesis", synthesis };
      }
      case "candidates": {
        const synthesis = this.#requireSynthesis();
        const best = synthesis.feasibleCandidates.slice(0, command.limit);
        return {
          kind: "candidates",
          feasibleCount: synthesis.feasibleCandidates.length,
          rejectedCount:
            synthesis.candidates.length - synthesis.feasibleCandidates.length,
          candidates: best.map((candidate) => ({
            id: candidate.id,
            disposition: candidate.disposition,
            parameters: candidate.parameters,
            metrics: candidate.metrics,
            violations: candidate.violations,
          })),
        };
      }
      case "select": {
        const candidate = this.#knownCandidate(command.candidateId);
        if (candidate === undefined) {
          throw new TypeError("unknown candidate " + command.candidateId);
        }
        return {
          kind: "selection",
          candidate: this.#selectCandidate(candidate),
        };
      }
      case "inspect": {
        const candidate =
          command.candidateId === undefined
            ? this.#selected
            : this.#knownCandidate(command.candidateId);
        return candidate === undefined
          ? { kind: "inspection" }
          : { kind: "inspection", candidate };
      }
      case "fea": {
        const result = compileStructuralStudyRequest(
          this.#requireProblem(),
          this.#requireSelected(),
        );
        if (result._tag !== "Compiled") {
          throw new TypeError(result.detail);
        }
        this.#structural = result.request;
        return { kind: "fea", request: result.request };
      }
      case "cam": {
        const plan = planCandidateManufacturing(
          this.#requireProblem(),
          this.#requireSelected(),
        );
        this.#manufacturing = plan;
        this.#motion = undefined;
        this.#lastController = undefined;
        return { kind: "cam", plan };
      }
      case "motion": {
        if (this.#manufacturing === undefined) {
          throw new TypeError("run cam() before motion()");
        }
        const program = compileMotionProgram(this.#manufacturing);
        this.#motion = program;
        this.#lastController = undefined;
        return { kind: "motion", program };
      }
      case "post": {
        if (this.#motion === undefined) {
          throw new TypeError("run motion() before post(target)");
        }
        const program = postMotionProgram(
          this.#motion,
          controllerProfile(command.target),
        );
        this.#lastController = program;
        return { kind: "post", program };
      }
    }
  }
}
