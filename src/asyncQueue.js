/**
 * AsyncQueue - In-Memory Background Job Queue
 * 
 * Provides async request handling for Slack interactions.
 * Responds immediately to Slack, then processes jobs in background.
 * 
 * Features:
 * - Instant Slack acknowledgment (< 100ms)
 * - Background job processing
 * - Error handling and retry logic
 * - Job status tracking
 * - Graceful shutdown
 * 
 * @module asyncQueue
 */

class AsyncQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.stats = {
      totalJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      currentQueueSize: 0
    };
    
    // Graceful shutdown handler
    this.setupShutdownHandler();
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
   * Handle permanently failed jobs
   * Override this method to customize failure handling
   * 
   * @private
   * @param {Object} job - The failed job
   */
  handleFailedJob(job) {
    // In production, you might want to:
    // - Send to a dead letter queue
    // - Log to external monitoring service
    // - Send alert notification
    // - Store in database for later analysis
    
    console.error('💀 [AsyncQueue] Failed job details:', {
      id: job.id,
      type: job.type,
      error: job.error,
      retries: job.retries,
      data: job.data
    });
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
