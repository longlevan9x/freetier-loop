import type { Deps } from './platform/deps';

export type SessionUser = {
  id: string;
  email: string;
  name: string;
};

export type AppEnv = {
  Bindings: Record<string, unknown>;
  Variables: {
    deps: Deps;
    requestId: string;
    session: SessionUser | null;
  };
};
