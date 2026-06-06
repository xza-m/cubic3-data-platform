export interface SemanticLayerSummaryInput {
  rawSpec?: unknown;
  semanticCanvas?: unknown;
  raw_spec?: unknown;
  semantic_canvas?: unknown;
}

export interface SemanticLayerSummary {
  cube: {
    status: "ready" | "missing";
    name: string;
    source: string;
    dimensionCount: number;
    measureCount: number;
  };
  ontology: {
    status: "ready" | "missing";
    objectName: string;
    metricNames: string[];
  };
  bindingCount: number;
}

export function extractSemanticLayerSummary(
  input: SemanticLayerSummaryInput | unknown,
): SemanticLayerSummary {
  const normalizedInput = isSummaryInput(input)
    ? input
    : { rawSpec: input, semanticCanvas: undefined };
  const rawSpec = normalizedInput.rawSpec ?? normalizedInput.raw_spec;
  const semanticCanvas =
    normalizedInput.semanticCanvas ?? normalizedInput.semantic_canvas;
  const spec = isRecord(rawSpec) ? rawSpec : {};
  const canvas = isRecord(semanticCanvas)
    ? semanticCanvas
    : {};
  const cube = firstRecord(spec.cube, spec.cubes);
  const ontology = isRecord(spec.ontology) ? spec.ontology : {};
  const ontologyObject = firstRecord(ontology.object, canvas.objects);
  const ontologyMetrics = recordsFrom(ontology.metrics);
  const canvasMetrics = recordsFrom(canvas.metrics);
  const metrics = ontologyMetrics.length > 0 ? ontologyMetrics : canvasMetrics;
  const bindings = recordsFrom(canvas.bindings);
  const metricNames = metrics
    .map((metric) => stringValue(metric.title) || stringValue(metric.name))
    .filter(Boolean);
  const bindingCount =
    bindings.length > 0
      ? bindings.filter(hasBindingRef).length
      : ontologyMetrics.reduce(
          (count, metric) => count + arrayLength(metric.measure_refs),
          0,
        );
  const cubeName = stringValue(cube.name);
  const objectName =
    stringValue(ontologyObject.title) || stringValue(ontologyObject.name);

  return {
    cube: {
      status: cubeName ? "ready" : "missing",
      name: cubeName,
      source: stringValue(cube.source) || stringValue(cube.table),
      dimensionCount: itemCount(cube.dimensions),
      measureCount: itemCount(cube.measures),
    },
    ontology: {
      status: objectName || metricNames.length > 0 ? "ready" : "missing",
      objectName,
      metricNames,
    },
    bindingCount,
  };
}

function isSummaryInput(value: unknown): value is SemanticLayerSummaryInput {
  if (!isRecord(value)) return false;
  return (
    "rawSpec" in value ||
    "semanticCanvas" in value ||
    "raw_spec" in value ||
    "semantic_canvas" in value
  );
}

function firstRecord(...values: unknown[]): Record<string, unknown> {
  for (const value of values) {
    if (isRecord(value)) return value;
    const records = recordsFrom(value);
    if (records[0]) return records[0];
  }
  return {};
}

function recordsFrom(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function itemCount(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (isRecord(value)) return Object.keys(value).length;
  return 0;
}

function arrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function hasBindingRef(binding: Record<string, unknown>): boolean {
  return Boolean(
    stringValue(binding.measure_ref) ||
      stringValue(binding.metric) ||
      stringValue(binding.cube_measure),
  );
}

function stringValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
