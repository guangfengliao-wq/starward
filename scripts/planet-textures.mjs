import { readFile, writeFile, rename, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'

const directory = new URL('../src/assets/planet-textures/', import.meta.url)
const sources = JSON.parse(await readFile(new URL('sources.json', directory), 'utf8'))
const filenames = Object.values(sources)
const source = 'https://www.solarsystemscope.com/textures/download/'
const mirror = 'https://www.simplespacedata.org/texture/solarsystemscope/'
const checkOnly = process.argv.includes('--check')

function isImage(bytes, name) {
  if (bytes.length < 1024) return false
  if (name.endsWith('.png')) return bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
  return bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex')) && bytes.readUInt16BE(bytes.length - 2) === 0xffd9
}

async function downloadImage(name) {
  const body = name.replace(/^2k_/, '').replace(/\.[^.]+$/, '')
  const backup = name.startsWith('8k_')
    ? new URL(name, 'https://raw.githubusercontent.com/smithcg1/DigitalSolarSystem/master/')
    : new URL(`${body}/latest/${name}`, mirror)
  const urls = [new URL(name, source), backup]
  const errors = []
  for (const url of urls) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(12000) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const bytes = Buffer.from(await response.arrayBuffer())
      if (!isImage(bytes, name)) throw new Error('响应不是有效的图片')
      return bytes
    } catch (error) {
      errors.push(`${url.hostname}: ${error.cause?.code || error.message}`)
    }
  }
  throw new Error(errors.join(' / '))
}

const results = await Promise.allSettled(filenames.map(async (name) => {
  const destination = new URL(name, directory)
  const existing = await readFile(destination).catch(error => {
    if (error.code !== 'ENOENT') throw error
  })
  if (existing && isImage(existing, name)) return
  if (checkOnly) throw new Error('缺失或无效')

  const bytes = await downloadImage(name)
  const temporary = new URL(`${name}.${randomUUID()}.tmp`, directory)
  try {
    await writeFile(temporary, bytes)
    await rename(temporary, destination)
  } finally {
    await rm(temporary, { force: true })
  }
}))

const failures = results.flatMap((result, index) => result.status === 'rejected'
  ? [`${filenames[index]}（${result.reason.cause?.code || result.reason.message}）`]
  : [])
if (failures.length) {
  console.error(`以下贴图尚未就绪：\n${failures.join('\n')}\n可从 Solar System Scope 或脚本中的备用源下载缺少的文件，放入 src/assets/planet-textures/，然后运行 npm run textures:check。`)
  process.exitCode = 1
} else {
  console.log('太阳、八颗行星、土星环和银河贴图均已就绪。')
}
