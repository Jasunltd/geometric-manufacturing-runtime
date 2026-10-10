export {
  buildManufacturingDossier,
} from "./build.js";
export {
  DossierRenderer,
  DossierRendererFailure,
  reportlabDossierRendererLayer,
  type ReportlabDossierRendererConfig,
} from "./render.js";
export {
  fitCircle2D,
  fitPlane,
  simulateMetrology,
} from "./metrology.js";
export type {
  BasicDimension,
  CapabilityProjection,
  DatumDefinition,
  DfmCheck,
  DfmReport,
  DossierArtifactRef,
  DossierArtifacts,
  DrawingSpec,
  FittedCircle,
  FittedPlane,
  FirstArticleObservation,
  GeometricRequirement,
  InspectionCharacteristic,
  InspectionPlan,
  ManufacturingDossier,
  Point3,
  ProveoutCheck,
  SimulatedMetrology,
  SizeRequirement,
  VirtualProveout,
} from "./model.js";