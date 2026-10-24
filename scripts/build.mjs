import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
const root = new URL('../', import.meta.url)
const source = await readFile(new URL('lib/host.js', root), 'utf8')
const revision = createHash('sha256').update(source).digest('hex').slice(0, 12)
const directory = new URL(`dist/host/${revision}/`, root)
await mkdir(directory, { recursive: true })
await writeFile(new URL('host.js', directory), source)
await writeFile(new URL('release.json', root), JSON.stringify({ revision, entry: `./dist/host/${revision}/host.js` }, null, 2) + '\n')
console.log(`Built @ sessions ${revision}`)
