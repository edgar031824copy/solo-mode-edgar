import { config } from "dotenv";

// Load the test DB URL first so it takes precedence over .env
config({ path: ".env.test" });

// Load the rest of .env (JWT_SECRET, ANTHROPIC_API_KEY, etc.)
// dotenv never overrides vars already set — DATABASE_URL from .env is ignored
config();
