// `astro:middleware` for unit tests: defineMiddleware is the identity function.

export const defineMiddleware = <T>(handler: T): T => handler;
