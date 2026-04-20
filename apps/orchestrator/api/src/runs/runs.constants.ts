// Queue names
export const RUN_QUEUE = 'runs';

// Job names
export const JOB_EXECUTE_RUN = 'execute-run';

// Job options defaults
export const DEFAULT_JOB_OPTIONS = {
  attempts: 1, // Retries handled by runner, not queue
  removeOnComplete: {
    count: 1000, // Keep last 1000 completed jobs
    age: 24 * 60 * 60, // Or jobs older than 24 hours
  },
  removeOnFail: {
    count: 5000, // Keep more failed jobs for debugging
    age: 7 * 24 * 60 * 60, // Or jobs older than 7 days
  },
};

// Timeouts
export const RUN_LEASE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes to start executing
export const RUN_HEARTBEAT_INTERVAL_MS = 30 * 1000; // 30 seconds
export const RUN_MAX_DURATION_MS = 60 * 60 * 1000; // 1 hour default max
