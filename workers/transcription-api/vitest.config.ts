import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          // Provide deterministic env vars for tests.
          bindings: {
            SUPABASE_URL: "https://stub.supabase.co",
            SUPABASE_SERVICE_ROLE_KEY: "stub-service-role",
            SUPABASE_JWT_SECRET: "stub-jwt-secret-32-chars-minimum-len",
            GROQ_API_KEY: "stub-groq",
            OPENAI_API_KEY: "stub-openai",
          },
        },
      },
    },
  },
});
