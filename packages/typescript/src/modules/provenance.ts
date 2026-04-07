import type { Session } from '../session.js';
import type { SessionCreateOpts } from '../types/session.js';
import type { ResourcesModule } from './resources.js';

export type SessionFactory = (opts: SessionCreateOpts) => Session;

export class ProvenanceModule {
  constructor(
    private _resources: ResourcesModule,
    private _sessionFactory: SessionFactory,
  ) {}

  get sessions() { return this._resources.sessions; }
  get receipts() { return this._resources.receipts; }
  get contracts() { return this._resources.contracts; }
  get a2a() { return this._resources.a2a; }

  /** Create a provenance session with hash chaining and optional signing. */
  session(opts: SessionCreateOpts): Session {
    return this._sessionFactory(opts);
  }

  /** Verify a session's receipt chain integrity. */
  async verify(sessionId: string) {
    return this._resources.sessions.verify(sessionId);
  }
}
