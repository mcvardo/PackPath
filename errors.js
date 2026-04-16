// errors.js
// Typed error classes for PackPath pipeline failures.
// Use these instead of generic Error so callers can distinguish failure modes.

/**
 * Thrown when a region config file is missing, malformed, or fails validation.
 */
export class RegionConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RegionConfigError';
  }
}

/**
 * Thrown when graph construction fails — e.g. the seed trail is not found
 * in the OSM data, or the main connected component cannot be seeded.
 */
export class GraphBuildError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GraphBuildError';
  }
}

/**
 * Thrown when the LLM call fails, returns unparseable JSON, or when
 * post-processing cannot match an archetype to its input cluster.
 * The grounding guarantee is broken if this is swallowed.
 */
export class NarrationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NarrationError';
  }
}

/**
 * Thrown when narration validation fails after all retries are exhausted
 * and the caller has opted to treat that as a hard failure.
 * @property {Array<{route: string, check: string, msg: string}>} errors
 */
export class ValidationError extends Error {
  constructor(message, errors = []) {
    super(message);
    this.name = 'ValidationError';
    this.errors = errors;
  }
}
