import { Database } from 'bun:sqlite'

export const applySqlitePragmas = (db: Database) => {
  db.run('PRAGMA journal_mode = WAL')
  db.run('PRAGMA synchronous = NORMAL')
  db.run('PRAGMA busy_timeout = 5000')
  db.run('PRAGMA foreign_keys = ON')
}
