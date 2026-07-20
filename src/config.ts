export const config = {
  port: Number(process.env.PORT || 3001),
  apiKeys: (process.env.DJMAGIC_API_KEYS || "").split(",").map((v) => v.trim()).filter(Boolean),
  redisHost: process.env.DJMAGIC_REDIS_HOST || "redis",
  redisPort: Number(process.env.DJMAGIC_REDIS_PORT || 6379),
  redisTls: process.env.DJMAGIC_REDIS_TLS === "true",
  redisPassword: process.env.DJMAGIC_REDIS_PASSWORD || undefined,
  jobsTable: process.env.DJMAGIC_JOBS_TABLE || "",
  destinationToken: process.env.DJMAGIC_DESTINATION_TOKEN || "",
  destinationSecretArn: process.env.DJMAGIC_DESTINATION_SECRET_ARN || "",
  allowedSourceHosts: (process.env.DJMAGIC_ALLOWED_SOURCE_HOSTS || "").split(",").map((v) => v.trim()).filter(Boolean),
  allowedDestinationHosts: (process.env.DJMAGIC_ALLOWED_DESTINATION_HOSTS || "").split(",").map((v) => v.trim()).filter(Boolean),
};
