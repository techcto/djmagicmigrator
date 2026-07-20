import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { config } from "./config.js";
import type { MigrationJob } from "./domain.js";
import { Redis } from "ioredis";

const documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
const redis = new Redis({ host: config.redisHost, port: config.redisPort, password: config.redisPassword, tls: config.redisTls ? {} : undefined });

export async function putJob(job: MigrationJob): Promise<void> {
  if (!config.jobsTable) {
    await redis.set(`migration-job:${job.id}`, JSON.stringify(job));
    return;
  }
  await documentClient.send(new PutCommand({ TableName: config.jobsTable, Item: job }));
}

export async function getJob(id: string): Promise<MigrationJob | undefined> {
  if (!config.jobsTable) {
    const value = await redis.get(`migration-job:${id}`);
    return value ? JSON.parse(value) as MigrationJob : undefined;
  }
  const result = await documentClient.send(new GetCommand({ TableName: config.jobsTable, Key: { id } }));
  return result.Item as MigrationJob | undefined;
}
