export type BugStatus = "todo" | "in-progress" | "done";

export type BugFinding = {
  probableCause: string;
  reason: string;
  suggestedFixes: string[];
  confidenceScore: number;
  evidence?: unknown;
};

export type BugRecord = {
  title: string;
  description: string;
  localRepoUrls: string[];
  status?: BugStatus;
  "bug-details"?: BugFinding | null;
  imagePaths?: string[];
};

const requireNonEmptyString = (value: unknown, field: string) => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Bug JSON field "${field}" must be a non-empty string.`);
  }
  return value.trim();
};

const requireStatus = (value: unknown, field: string): BugStatus => {
  const normalized = requireNonEmptyString(value, field);
  if (normalized === "todo" || normalized === "in-progress" || normalized === "done") {
    return normalized;
  }
  throw new Error(`Bug JSON field "${field}" must be one of: todo, in-progress, done.`);
};

const optionalStatus = (value: unknown, field: string): BugStatus | undefined => {
  if (value === undefined) {
    return undefined;
  }
  return requireStatus(value, field);
};

const requireNonEmptyStringArray = (value: unknown, field: string) => {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Bug JSON field "${field}" must be a non-empty array of strings.`);
  }

  return value.map((entry, index) => requireNonEmptyString(entry, `${field}[${index}]`));
};

const optionalStringArray = (value: unknown, field: string) => {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error(`Bug JSON field "${field}" must be an array of strings.`);
  }

  return value.map((entry, index) => requireNonEmptyString(entry, `${field}[${index}]`));
};

const optionalBugDetails = (value: unknown, field: string): BugFinding | null | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Bug JSON field "${field}" must be an object or null.`);
  }
  const record = value as Record<string, unknown>;
  const confidenceScore = record.confidenceScore;
  if (typeof confidenceScore !== "number" || !Number.isFinite(confidenceScore)) {
    throw new Error(`Bug JSON field "${field}.confidenceScore" must be a number.`);
  }
  if (confidenceScore < 0 || confidenceScore > 1) {
    throw new Error(`Bug JSON field "${field}.confidenceScore" must be between 0 and 1.`);
  }
  return {
    probableCause: requireNonEmptyString(record.probableCause, `${field}.probableCause`),
    reason: requireNonEmptyString(record.reason, `${field}.reason`),
    suggestedFixes: requireNonEmptyStringArray(record.suggestedFixes, `${field}.suggestedFixes`),
    confidenceScore,
    evidence: record.evidence,
  };
};

const parseBugRecord = (raw: unknown, index: number): BugRecord => {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`Bug JSON item at index ${index} must be an object.`);
  }
  const record = raw as Record<string, unknown>;
  const localRepoUrls =
    record.localRepoUrls !== undefined
      ? requireNonEmptyStringArray(record.localRepoUrls, "localRepoUrls")
      : [requireNonEmptyString(record.localRepoUrl, "localRepoUrl")];

  return {
    title: requireNonEmptyString(record.title, "title"),
    description: requireNonEmptyString(record.description, "description"),
    localRepoUrls,
    status: optionalStatus(record.status, "status"),
    "bug-details": optionalBugDetails(record["bug-details"], "bug-details"),
    imagePaths: optionalStringArray(record.imagePaths, "imagePaths"),
  };
};

export type BugInput = BugRecord[];

export const parseBugInput = (raw: unknown): BugInput => {
  if (!Array.isArray(raw)) {
    throw new Error("Bug JSON must be an array of bug objects.");
  }
  if (raw.length === 0) {
    throw new Error("Bug JSON must contain at least one bug object.");
  }
  return raw.map((entry, index) => parseBugRecord(entry, index));
};
