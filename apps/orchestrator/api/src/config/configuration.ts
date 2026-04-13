const nodeEnv = process.env.NODE_ENV ?? 'development';
const isLocalRuntime = nodeEnv === 'development' || nodeEnv === 'local' || nodeEnv === 'test';
const synchronizeRequested = (process.env.DATABASE_SYNCHRONIZE ?? 'false').toLowerCase() === 'true';

export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),

  database: {
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT ?? '5432', 10),
    username: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    synchronize: isLocalRuntime && synchronizeRequested,
    logging: process.env.DATABASE_LOGGING === 'true',
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  },

  storage: {
    provider: process.env.STORAGE_PROVIDER || 's3', // s3 | azure | gcs | local
    s3: {
      endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
      region: process.env.S3_REGION || 'us-east-1',
      bucket: process.env.S3_BUCKET || 'skuldbot-artifacts',
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    },
    azure: {
      connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING,
      container: process.env.AZURE_STORAGE_CONTAINER || 'skuldbot-artifacts',
    },
    gcs: {
      projectId: process.env.GCS_PROJECT_ID,
      bucket: process.env.GCS_BUCKET || 'skuldbot-artifacts',
      keyFilename: process.env.GCS_KEY_FILENAME,
    },
    local: {
      basePath: process.env.LOCAL_STORAGE_PATH || './storage',
    },
  },
});
