import type { CompileResult } from "../model.js";
import type {
  DesignCandidate,
  DesignProblem,
  DesignSynthesis,
} from "../design/model.js";
import type { DesignSearch } from "../design/search.js";
import type { StructuralStudyRequest } from "../analysis/structural.js";
import type { ManufacturingPlan } from "../cam/model.js";
import type { MotionProgram } from "../motion/model.js";
import type {
  ControllerProgram,
  ControllerTarget,
} from "../controllers/index.js";

export type ReplCommand =
  | { readonly kind: "help" }
  | { readonly kind: "status" }
  | { readonly kind: "history" }
  | { readonly kind: "exit" }
  | { readonly kind: "problem"; readonly input: unknown }
  | { readonly kind: "search" }
  | { readonly kind: "synthesize" }
  | { readonly kind: "candidates"; readonly limit: number }
  | { readonly kind: "select"; readonly candidateId: string }
  | { readonly kind: "inspect"; readonly candidateId?: string }
  | { readonly kind: "fea" }
  | { readonly kind: "cam" }
  | { readonly kind: "motion" }
  | { readonly kind: "post"; readonly target: ControllerTarget };

export interface ReplHistoryEntry {
  readonly sequence: number;
  readonly input: string;
  readonly resultKind: ReplResult["kind"];
}

export interface CandidateSummary {
  readonly id: string;
  readonly disposition: "feasible" | "rejected";
  readonly parameters: DesignCandidate["parameters"];
  readonly metrics: DesignCandidate["metrics"];
  readonly violations: DesignCandidate["violations"];
}

export type ReplResult =
  | { readonly kind: "help"; readonly text: string }
  | {
      readonly kind: "status";
      readonly problemDigest?: string;
      readonly searchDigest?: string;
      readonly synthesisDigest?: string;
      readonly selectedCandidateDigest?: string;
      readonly structuralRequestDigest?: string;
      readonly manufacturingPlanDigest?: string;
      readonly motionDigest?: string;
      readonly lastControllerArtifactDigest?: string;
    }
  | { readonly kind: "history"; readonly entries: readonly ReplHistoryEntry[] }
  | { readonly kind: "exit" }
  | {
      readonly kind: "problem";
      readonly result: CompileResult<DesignProblem>;
    }
  | {
      readonly kind: "search";
      readonly search: DesignSearch;
    }
  | {
      readonly kind: "synthesis";
      readonly synthesis: DesignSynthesis;
    }
  | {
      readonly kind: "candidates";
      readonly feasibleCount: number;
      readonly rejectedCount: number;
      readonly candidates: readonly CandidateSummary[];
    }
  | {
      readonly kind: "selection";
      readonly candidate: DesignCandidate;
    }
  | {
      readonly kind: "inspection";
      readonly candidate?: DesignCandidate;
    }
  | {
      readonly kind: "fea";
      readonly request: StructuralStudyRequest;
    }
  | {
      readonly kind: "cam";
      readonly plan: ManufacturingPlan;
    }
  | {
      readonly kind: "motion";
      readonly program: MotionProgram;
    }
  | {
      readonly kind: "post";
      readonly program: ControllerProgram;
    };
