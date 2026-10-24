/** Keep native matching and order, limited to ordinary sidebar-eligible sessions before the cap. */
export async function listCandidates(original, receiver, args, archivedIds) {
  const limit = args[2] === undefined ? receiver.config.candidateLimit : args[2]
  // Preserve native validation, error types and cancellation semantics.
  if (!Number.isSafeInteger(limit) || limit <= 0) return Reflect.apply(original, receiver, args)
  const unlimited = [...args]
  unlimited[2] = Number.MAX_SAFE_INTEGER
  const candidates = await Reflect.apply(original, receiver, unlimited)
  if (args[3]?.aborted) return Reflect.apply(original, receiver, args)
  // Use the same native catalog and blank/origin flags as the sidebar. This
  // does not resume sessions or read full cold transcripts.
  const controller = receiver.ctx.get('sessionController')
  if (!controller || typeof controller.list !== 'function') throw new Error('DSH sidebar session catalog is unavailable')
  let catalog
  try { catalog = await controller.list({}, args[3]) }
  catch (error) {
    if (args[3]?.aborted) return Reflect.apply(original, receiver, args)
    throw error
  }
  if (args[3]?.aborted) return Reflect.apply(original, receiver, args)
  const eligible = new Set(catalog.items.filter(session => session.origin !== 'subagent'
    && !session.blank && !session.sessionId.startsWith('session-sidechat-')).map(session => session.sessionId))
  // Read the archive set last, including changes made during either query.
  const archived = new Set(archivedIds())
  return candidates.filter(candidate => eligible.has(candidate.sessionId) && !archived.has(candidate.sessionId)).slice(0, limit)
}
