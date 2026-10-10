
import type { Digest } from "../model.js";

export interface GeometryArtifactRef {
  readonly path: string;
  readonly digest: Digest;
}

export interface Build123dRealization {
  readonly schema: "gmr.geometry-realization/v1";
  readonly candidateId: string;
  readonly candidateDigest: Digest;
  readonly backend: {
    readonly name: "build123d";
    readonly version: string;
    readonly mode: "algebra";
  };
  readonly valid: boolean;
  readonly volumeMm3: number;
  readonly surfaceAreaMm2: number;
  readonly centerOfMassMm: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
  readonly boundingBoxMm: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
  readonly topology: {
    readonly solids: number;
    readonly faces: number;
    readonly edges: number;
  };
  readonly artifacts: {
    readonly step: GeometryArtifactRef;
    readonly stl: GeometryArtifactRef;
    readonly svg: GeometryArtifactRef;
  };
  readonly realizationDigest: Digest;
}
