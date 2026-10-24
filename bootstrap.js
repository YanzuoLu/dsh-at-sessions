import { readFile } from 'node:fs/promises'
import { symbols } from '@deepseek-ai/cordis'
import referencePackage from '@deepseek-ai/dsh-session-reference/package.json' with { type: 'json' }

export const name = 'at-sessions'
export const inject = ['sessionReferenceResolver', 'workspaceRegistry']

/** Stable owner for an idle-gated, versioned candidate filter. */
export async function apply(ctx) {
  if (referencePackage.version !== '0.2.0-rc.2') throw new Error('dsh-at-sessions requires DSH 0.2.0-rc.2')
  const service = ctx.sessionReferenceResolver[symbols.original] ?? ctx.sessionReferenceResolver
  const descriptor = Object.getOwnPropertyDescriptor(service, 'listCandidates')
  const original = service.listCandidates
  if (typeof original !== 'function') throw new Error('DSH session-reference candidate API is unavailable')
  let current, revision, active = true, checking = false, calls = 0
  async function load(initial = false) {
    if (checking || !active) return
    checking = true
    try {
      let manifest
      try { manifest = JSON.parse(await readFile(new URL('./release.json', import.meta.url), 'utf8')) }
      catch (error) { if (!initial && error.code === 'ENOENT') return; throw error }
      if (!/^[a-f0-9]{12}$/.test(manifest.revision) || manifest.entry !== `./dist/host/${manifest.revision}/host.js`) throw new Error('Invalid @ sessions release manifest')
      if (manifest.revision === revision || calls) return
      const candidate = await import(new URL(manifest.entry, import.meta.url).href)
      if (typeof candidate.listCandidates !== 'function') throw new Error('Missing @ sessions candidate filter')
      if (!active || calls) return
      current = candidate
      revision = manifest.revision
    } catch (error) {
      if (initial) throw error
      ctx.logger.warn(`@ sessions update: ${error.message}`)
    } finally { checking = false }
  }
  await load(true)
  const wrapper = async function (...args) {
    if (!active) return Reflect.apply(original, this, args)
    calls += 1
    const implementation = current
    try { return await implementation.listCandidates(original, this, args, () => ctx.workspaceRegistry.archivedSessionIds) }
    finally { calls -= 1 }
  }
  ctx.effect(() => {
    Object.defineProperty(service, 'listCandidates', descriptor ? { ...descriptor, value: wrapper } : { value: wrapper, configurable: true, writable: true })
    const timer = setInterval(() => { void load() }, 2000)
    timer.unref?.()
    return () => {
      active = false
      clearInterval(timer)
      if (service.listCandidates !== wrapper) return
      if (descriptor) Object.defineProperty(service, 'listCandidates', descriptor)
      else delete service.listCandidates
    }
  }, 'at-sessions: candidate discovery')
}
