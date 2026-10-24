/** Keep the native discovery rules and ordering, but apply archive filtering before the cap. */
export async function listCandidates(original, receiver, args, archivedIds) {
  const limit = args[2] === undefined ? receiver.config.candidateLimit : args[2]
  // Preserve native validation, error types and cancellation semantics.
  if (!Number.isSafeInteger(limit) || limit <= 0) return Reflect.apply(original, receiver, args)
  const unlimited = [...args]
  unlimited[2] = Number.MAX_SAFE_INTEGER
  const candidates = await Reflect.apply(original, receiver, unlimited)
  if (args[3]?.aborted) return Reflect.apply(original, receiver, args)
  // Read the archive set AFTER the query, including changes made while it ran.
  const archived = new Set(archivedIds())
  return candidates.filter(candidate => !archived.has(candidate.sessionId)).slice(0, limit)
}
