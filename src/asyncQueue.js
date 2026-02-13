/**
 * AsyncQueue - In-Memory Background Job Queue with Dead Letter Queue
 *
 * Provides async request handling for Slack interactions.
 * Responds immediately to Slack, then processes jobs in background.
 *
 * Features:
 * - Instant Slack acknowledgment (< 100ms)
 * - Background job processing
 * - Error handling and retry logic
 * - Dead Letter Queue (DLQ) with file persistence
 * - Job status tracking
 * - Graceful shutdown
 *
 * @module asyncQueue
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const DLQ_FILE = path.join(__dirname, '../data/dlq.json');
const DLQ_TMP  = DLQ_FILE + '.tmp';

class AsyncQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.deadLetterQueue = [];
    this.stats = {
      totalJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      currentQueueSize: 0
    };

    // Load persisted DLQ from disk
    this._loadDLQ();

    // Graceful shutdown handler
    this.setupShutdownHandler();
  }

  /** Load DLQ from disk on startup */
  _loadDLQ() {
    try {
      if (fs.existsSync(DLQ_FILE)) {
        const raw = fs.readFileSync(DLQ_FILE, 'utf8');
        this.deadLetterQueue = JSON.parse(raw);
        console.log(`[AsyncQueue] Loaded ${this.deadLetterQueue.length} DLQ entries from disk`);
      }
    } catch (err) {
      console.error('[AsyncQueue] Failed to load DLQ from disk:', err.message);
      this.deadLetterQueue = [];
    }
  }

  /** Persist DLQ to disk atomically */
  _saveDLQ() {
    try {
      const dir = path.dirname(DLQ_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(DLQ_TMP, JSON.stringify(this.deadLetterQueue, null, 2));
      fs.renameSync(DLQ_TMP, DLQ_FILE);
    } catch (err) {
      console.error('[AsyncQueue] Failed to persist DLQ:', err.message);
    }
  }

  /** Categorize error for DLQ metadata */
  _categorizeError(errorMessage) {
    if (!errorMessage) return 'UNKNOWN';
    const msg = String(errorMessage).toUpperCase();
    if (msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT') || msg.includes('ENOTFOUND') || msg.includes('NETWORK')) return 'NETWORK';
    if (msg.includes('401') || msg.includes('403') || msg.includes('AUTH')) return 'AUTH';
    if (msg.includes('429') || msg.includes('RATE')) return 'RATE_LIMIT';
    if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('SERVER')) return 'SERVER';
    return 'UNKNOWN';
  }

  /**
   * Add a job to the queue
   * 
   * @param {Object} job - The job to add
   * @param {string} job.type - Job type identifier
   * @param {Object} job.data - Job data payload
   * @param {Function} job.handler - Async function to execute
   * @param {number} [job.maxRetries=3] - Maximum retry attempts
   * @param {number} [job.retryDelay=1000] - Delay between retries (ms)
   * @returns {Promise<void>}
   */
  async add(job) {
    // Validate job structure
    if (!job.type || !job.handler) {
      throw new Error('Job must have type and handler properties');
    }

    // Add job metadata
    const jobWithMetadata = {
      ...job,
      id: this.generateJobId(),
      addedAt: new Date().toISOString(),
      status: 'queued',
      retries: 0,
      maxRetries: job.maxRetries || 3,
      retryDelay: job.retryDelay || 1000
    };

    this.queue.push(jobWithMetadata);
    this.stats.totalJobs++;
    this.stats.currentQueueSize = this.queue.length;

    console.log(`📥 [AsyncQueue] Job queued: ${job.type} (ID: ${jobWithMetadata.id})`);
    console.log(`📊 [AsyncQueue] Queue size: ${this.queue.length}`);

    // Start processing if not already running
    if (!this.processing) {
      this.process();
    }
  }

  /**
   * Process jobs from the queue
   * Runs continuously until queue is empty
   * 
   * @private
   */
  async process() {
    if (this.processing) {
      console.log('⚠️  [AsyncQueue] Already processing, skipping...');
      return;
    }

    this.processing = true;
    console.log('🔄 [AsyncQueue] Starting job processor...');

    while (this.queue.length > 0) {
      const job = this.queue.shift();
      this.stats.currentQueueSize = this.queue.length;
      
      try {
        job.status = 'processing';
        job.startedAt = new Date().toISOString();
        
        console.log(`⚙️  [AsyncQueue] Processing job: ${job.type} (ID: ${job.id})`);
        
        // Execute the job handler
        await job.handler(job.data);
        
        job.status = 'completed';
        job.completedAt = new Date().toISOString();
        
        this.stats.completedJobs++;
        
        const duration = new Date(job.completedAt) - new Date(job.startedAt);
        console.log(`✅ [AsyncQueue] Job completed: ${job.type} (ID: ${job.id}) in ${duration}ms`);
        
      } catch (error) {
        job.status = 'failed';
        job.error = error.message;
        job.retries++;
        
        console.error(`❌ [AsyncQueue] Job failed: ${job.type} (ID: ${job.id})`, error);
        
        // Retry logic
        if (job.retries < job.maxRetries) {
          console.log(`🔄 [AsyncQueue] Retrying job ${job.id} (attempt ${job.retries}/${job.maxRetries})...`);
          
          // Add delay before retry
          await this.sleep(job.retryDelay * job.retries);
          
          // Re-queue the job
          job.status = 'queued';
          this.queue.push(job);
          this.stats.currentQueueSize = this.queue.length;
          
        } else {
          this.stats.failedJobs++;
          console.error(`💀 [AsyncQueue] Job permanently failed: ${job.type} (ID: ${job.id}) after ${job.maxRetries} attempts`);
          
          // Optional: Store failed jobs for later review
          this.handleFailedJob(job);
        }
      }
    }

    this.processing = false;
    console.log('⏸️  [AsyncQueue] Job processor stopped (queue empty)');
  }

  /**
   * Get current queue statistics
   * 
   * @returns {Object} Queue statistics
   */
  getStats() {
    return {
      ...this.stats,
      processing: this.processing,
      successRate: this.stats.totalJobs > 0 
        ? ((this.stats.completedJobs / this.stats.totalJobs) * 100).toFixed(2) + '%'
        : 'N/A'
    };
  }

  /**
   * Get current queue contents (for debugging)
   * 
   * @returns {Array} Current queue
   */
  getQueue() {
    return this.queue.map(job => ({
      id: job.id,
      type: job.type,
      status: job.status,
      addedAt: job.addedAt,
      retries: job.retries
    }));
  }

  /**
   * Clear all pending jobs
   * 
   * @returns {number} Number of jobs cleared
   */
  clear() {
    const count = this.queue.length;
    this.queue = [];
    this.stats.currentQueueSize = 0;
    console.log(`🗑️  [AsyncQueue] Cleared ${count} pending jobs`);
    return count;
  }

  /**
   * Generate unique job ID
   * 
   * @private
   * @returns {string} Unique job ID
   */
  generateJobId() {
    return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Sleep helper for retry delays
   * 
   * @private
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Handle permanently failed jobs — Dead Letter Queue implementation
   *
   * @param {Object} job - The failed job
   */
  handleFailedJob(job) {
    const entry = {
      id: job.id,
      type: job.type,
      error: job.error,
      errorCategory: this._categorizeError(job.error),
      retries: job.retries,
      data: job.data,
      failedAt: new Date().toISOString()
    };

    this.deadLetterQueue.push(entry);
    this._saveDLQ();

    console.error('[AsyncQueue] Job moved to DLQ:', entry);

    // Optional alert webhook
    const alertUrl = process.env.ALERT_WEBHOOK_URL;
    if (alertUrl) {
      axios.post(alertUrl, {
        text: `[AsyncQueue] Job permanently failed: ${job.type} (${job.id}) — ${job.error}`
      }).catch(err => console.error('[AsyncQueue] Alert webhook failed:', err.message));
    }
  }

  /** Return all DLQ entries */
  getDLQ() {
    return [...this.deadLetterQueue];
  }

  /** Clear all DLQ entries */
  clearDLQ() {
    this.deadLetterQueue = [];
    this._saveDLQ();
  }

  /** Retry a specific DLQ entry by id */
  async retryDLQJob(id) {
    const idx = this.deadLetterQueue.findIndex(e => e.id === id);
    if (idx === -1) throw new Error(`DLQ entry not found: ${id}`);
    const [entry] = this.deadLetterQueue.splice(idx, 1);
    this._saveDLQ();
    return entry;
  }

  /**
   * Setup graceful shutdown handler
   * Ensures jobs complete before process exits
   * 
   * @private
   */
  setupShutdownHandler() {
    const gracefulShutdown = async (signal) => {
      console.log(`\n🛑 [AsyncQueue] Received ${signal}, waiting for jobs to complete...`);
      
      // Wait for current processing to finish
      const maxWaitTime = 30000; // 30 seconds
      const startTime = Date.now();
      
      while (this.processing && (Date.now() - startTime) < maxWaitTime) {
        await this.sleep(100);
      }
      
      if (this.processing) {
        console.warn('⚠️  [AsyncQueue] Forced shutdown - some jobs may not have completed');
      } else {
        console.log('✅ [AsyncQueue] All jobs completed successfully');
      }
      
      console.log('📊 [AsyncQueue] Final stats:', this.getStats());
      process.exit(0);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  }
}

// Create singleton instance
const asyncQueue = new AsyncQueue();

// Export singleton instance
module.exports = asyncQueue;

// Also export class for testing
module.exports.AsyncQueue = AsyncQueue;
