// `cloudflare:workers` for unit tests. `env` is one object for the whole test file — tests
// replace its contents with setWorkerEnv(), never the object itself, so every module that
// imported it sees the same bindings.

export const env: Record<string, unknown> = {};

export function setWorkerEnv(values: Record<string, unknown> = {}): void {
  for (const key of Object.keys(env)) Reflect.deleteProperty(env, key);
  Object.assign(env, values);
}
