import path from 'node:path'

/**
 * Resolve a relative path inside a base directory.
 * Returns the resolved absolute path if it's safely inside `base`.
 * Throws if the path escapes or is absolute.
 */
export function resolveInside(base, rel) {
  if (typeof rel !== 'string') {
    throw Object.assign(new Error('Path must be a string.'), { status: 400 })
  }
  if (path.isAbsolute(rel)) {
    throw Object.assign(new Error('Absolute paths are not allowed.'), { status: 400 })
  }

  // Strip any leading ./ or .\
  const normalized = rel.replace(/^[./\\]+/, '')

  const resolved = path.resolve(base, normalized)

  // Ensure resolved path is inside base
  if (!resolved.startsWith(base + path.sep) && resolved !== base) {
    throw Object.assign(new Error('Path is outside the allowed directory.'), { status: 400 })
  }

  return resolved
}
