import { Queue } from "bullmq";
import { config } from "./config.js";

export const connection = {
  host: config.redisHost,
  port: config.redisPort,
  password: config.redisPassword,
  tls: config.redisTls ? {} : undefined,
  maxRetriesPerRequest: null,
};

export const migrationQueue = new Queue("site-migrations", { connection });
