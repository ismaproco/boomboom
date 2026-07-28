import { describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { serveClient } from './staticFiles'

describe('serveClient', () => {
  const distDir = join(import.meta.dir, '.test-dist')

  test('serves index.html for /', () => {
    mkdirSync(distDir, { recursive: true })
    writeFileSync(join(distDir, 'index.html'), '<html>ok</html>')
    const file = serveClient(distDir, '/')
    expect(file).not.toBeNull()
    rmSync(distDir, { recursive: true, force: true })
  })

  test('blocks path traversal outside dist', () => {
    mkdirSync(distDir, { recursive: true })
    writeFileSync(join(distDir, 'index.html'), '<html>ok</html>')
    expect(serveClient(distDir, '/../../../etc/passwd')).toBeNull()
    expect(serveClient(distDir, '/..%2f..%2fetc/passwd')).toBeNull()
    rmSync(distDir, { recursive: true, force: true })
  })

  test('serves nested asset when present', () => {
    mkdirSync(join(distDir, 'assets'), { recursive: true })
    const assetPath = join(distDir, 'assets', 'app.js')
    writeFileSync(assetPath, 'console.log(1)')
    const file = serveClient(distDir, '/assets/app.js')
    expect(file).not.toBeNull()
    expect(existsSync(assetPath)).toBe(true)
    rmSync(distDir, { recursive: true, force: true })
  })
})
