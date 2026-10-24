// Globals defined by tests/support/register.mjs (the stand-ins for import.meta.env/glob).

declare global {
  var $env: {
    DEV: boolean;
    PROD: boolean;
    SSR: boolean;
    MODE: string;
    BASE_URL: string;
    SITE: string;
  };
  var $glob: (pattern: string) => Record<string, unknown>;
  var $globFixtures: Record<string, Record<string, unknown>> | undefined;
}

export {};
