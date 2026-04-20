/**
 * Simple cron parser for schedule management
 * Supports standard 5-field cron: minute hour day month weekday
 */
export class CronParser {
  private readonly parts: string[];
  private readonly timezone: string;

  constructor(expression: string, timezone: string = 'UTC') {
    this.parts = expression.trim().split(/\s+/);
    this.timezone = timezone;
  }

  isValid(): boolean {
    if (this.parts.length !== 5) {
      return false;
    }

    const ranges = [
      { min: 0, max: 59 }, // minute
      { min: 0, max: 23 }, // hour
      { min: 1, max: 31 }, // day of month
      { min: 1, max: 12 }, // month
      { min: 0, max: 7 }, // day of week (0 and 7 are Sunday)
    ];

    for (let i = 0; i < 5; i++) {
      if (!this.isValidPart(this.parts[i], ranges[i])) {
        return false;
      }
    }

    return true;
  }

  private isValidPart(part: string, range: { min: number; max: number }): boolean {
    // Handle wildcard
    if (part === '*') return true;

    // Handle step values (*/5, 1-10/2)
    const stepMatch = part.match(/^(.+)\/(\d+)$/);
    if (stepMatch) {
      const base = stepMatch[1];
      const step = parseInt(stepMatch[2], 10);
      if (isNaN(step) || step < 1) return false;
      if (base === '*') return true;
      return this.isValidPart(base, range);
    }

    // Handle ranges (1-5)
    if (part.includes('-')) {
      const [start, end] = part.split('-').map((n) => parseInt(n, 10));
      return (
        !isNaN(start) &&
        !isNaN(end) &&
        start >= range.min &&
        end <= range.max &&
        start <= end
      );
    }

    // Handle lists (1,2,3)
    if (part.includes(',')) {
      return part.split(',').every((p) => this.isValidPart(p, range));
    }

    // Handle single number
    const num = parseInt(part, 10);
    return !isNaN(num) && num >= range.min && num <= range.max;
  }

  /**
   * Get the next run time from now
   */
  getNextRun(from: Date = new Date()): Date {
    // Simple implementation: iterate through next 366 days
    // In production, use a proper library like cron-parser
    const [minute, hour, dayOfMonth, month, dayOfWeek] = this.parts;

    let candidate = new Date(from);
    candidate.setSeconds(0);
    candidate.setMilliseconds(0);
    candidate.setMinutes(candidate.getMinutes() + 1); // Start from next minute

    const maxIterations = 366 * 24 * 60; // Max 1 year of minutes
    for (let i = 0; i < maxIterations; i++) {
      if (
        this.matches(minute, candidate.getMinutes()) &&
        this.matches(hour, candidate.getHours()) &&
        this.matches(dayOfMonth, candidate.getDate()) &&
        this.matches(month, candidate.getMonth() + 1) &&
        this.matchesDayOfWeek(dayOfWeek, candidate.getDay())
      ) {
        return candidate;
      }
      candidate.setMinutes(candidate.getMinutes() + 1);
    }

    // Fallback: return 1 day from now
    const fallback = new Date(from);
    fallback.setDate(fallback.getDate() + 1);
    return fallback;
  }

  private matches(pattern: string, value: number): boolean {
    if (pattern === '*') return true;

    // Handle step
    const stepMatch = pattern.match(/^(.+)\/(\d+)$/);
    if (stepMatch) {
      const step = parseInt(stepMatch[2], 10);
      const base = stepMatch[1];
      if (base === '*') {
        return value % step === 0;
      }
      // For ranges with step, check if value is in range and matches step
      if (base.includes('-')) {
        const [start, end] = base.split('-').map((n) => parseInt(n, 10));
        return value >= start && value <= end && (value - start) % step === 0;
      }
    }

    // Handle range
    if (pattern.includes('-')) {
      const [start, end] = pattern.split('-').map((n) => parseInt(n, 10));
      return value >= start && value <= end;
    }

    // Handle list
    if (pattern.includes(',')) {
      return pattern.split(',').some((p) => this.matches(p, value));
    }

    // Single value
    return parseInt(pattern, 10) === value;
  }

  private matchesDayOfWeek(pattern: string, value: number): boolean {
    // Convert Sunday (0) to 7 for easier handling
    const normalizedValue = value === 0 ? 7 : value;

    if (pattern === '*') return true;

    // Handle step
    const stepMatch = pattern.match(/^(.+)\/(\d+)$/);
    if (stepMatch) {
      const step = parseInt(stepMatch[2], 10);
      const base = stepMatch[1];
      if (base === '*') {
        return normalizedValue % step === 0;
      }
    }

    // Handle range
    if (pattern.includes('-')) {
      const [start, end] = pattern.split('-').map((n) => {
        const num = parseInt(n, 10);
        return num === 0 ? 7 : num;
      });
      return normalizedValue >= start && normalizedValue <= end;
    }

    // Handle list
    if (pattern.includes(',')) {
      return pattern.split(',').some((p) => this.matchesDayOfWeek(p, value));
    }

    // Single value
    const patternValue = parseInt(pattern, 10);
    const normalizedPattern = patternValue === 0 ? 7 : patternValue;
    return normalizedPattern === normalizedValue;
  }

  /**
   * Get next run time after a specific date
   * Useful for calculating missed executions
   */
  getNextRunAfter(afterDate: Date): Date | null {
    // Start from the next minute after the given date
    const startFrom = new Date(afterDate);
    startFrom.setSeconds(0);
    startFrom.setMilliseconds(0);
    startFrom.setMinutes(startFrom.getMinutes() + 1);

    return this.getNextRun(startFrom);
  }

  /**
   * Get multiple upcoming run times
   */
  getNextRuns(count: number, from: Date = new Date()): Date[] {
    const runs: Date[] = [];
    let current = from;

    for (let i = 0; i < count; i++) {
      const next = this.getNextRun(current);
      runs.push(next);
      current = next;
    }

    return runs;
  }

  /**
   * Check if the schedule should run at a specific time
   */
  shouldRunAt(date: Date): boolean {
    const [minute, hour, dayOfMonth, month, dayOfWeek] = this.parts;

    return (
      this.matches(minute, date.getMinutes()) &&
      this.matches(hour, date.getHours()) &&
      this.matches(dayOfMonth, date.getDate()) &&
      this.matches(month, date.getMonth() + 1) &&
      this.matchesDayOfWeek(dayOfWeek, date.getDay())
    );
  }

  /**
   * Get human-readable description of the cron expression
   */
  getDescription(): string {
    const [minute, hour, dayOfMonth, month, dayOfWeek] = this.parts;

    // Simple descriptions for common patterns
    if (minute === '0' && hour === '0' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
      return 'Daily at midnight';
    }
    if (minute === '0' && hour === '9' && dayOfMonth === '*' && month === '*' && dayOfWeek === '1-5') {
      return 'Weekdays at 9:00 AM';
    }
    if (minute === '*/5' && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
      return 'Every 5 minutes';
    }

    return `${minute} ${hour} ${dayOfMonth} ${month} ${dayOfWeek}`;
  }
}
