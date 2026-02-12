export type BugInput = {
  title: string;
  description: string;
  localRepoUrls: string[];
  imagePaths?: string[];
};

const requireNonEmptyString = (value: unknown, field: string) => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Bug JSON field "${field}" must be a non-empty string.`);
  }
  return value.trim();
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

export const parseBugInput = (raw: unknown): BugInput => {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Bug JSON must be an object.");
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
    imagePaths: optionalStringArray(record.imagePaths, "imagePaths"),
  };
};
