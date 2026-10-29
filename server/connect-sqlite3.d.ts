declare module 'connect-sqlite3' {
  import type { Store } from 'express-session';
  import type session from 'express-session';
  type Options = { db?: string; dir?: string; table?: string; concurrentDB?: boolean; ttl?: number; cleanupInterval?: number };
  function SQLiteStore(session: typeof import('express-session')): new (options?: Options) => Store;
  export default SQLiteStore;
}
