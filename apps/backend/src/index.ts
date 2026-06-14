import "dotenv/config";
import { createApp } from "./app.js";
import { logger } from "./lib/logger.js";

const PORT = process.env.PORT ?? 3001;

const app = createApp();

app.listen(PORT, () => {
  logger.info(`Backend API listening on port ${PORT}`);
});
