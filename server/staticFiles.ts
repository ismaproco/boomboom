import { existsSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'

const distRoot = (distDir: string) => {
  const root = resolve(distDir)
  return root.endsWith(sep) ? root : `${root}${sep}`
}

/** Serve SPA assets only from under distDir (blocks path traversal). */
export const serveClient = (distDir: string, pathname: string) => {
  let decoded = pathname
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return null
  }
  const rel = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '')
  if (rel.includes('..')) return null
  const filePath = resolve(distDir, rel)
  const root = distRoot(distDir)
  if (!filePath.startsWith(root)) {
    return null
  }
  if (existsSync(filePath)) return Bun.file(filePath)
  const indexPath = join(distDir, 'index.html')
  if (existsSync(indexPath)) return Bun.file(indexPath)
  return null
}
