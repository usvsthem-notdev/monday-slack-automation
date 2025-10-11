// src/utils/errorHandler.js
// Enhanced error handling with retries and exponential backoff

class ErrorHandler {
  constructor() {
    this.maxRetries = 3;
    this.baseDelay = 1000; // 1 second
    this.errorCounts = new Map();
  }

  // Exponential backoff retry logic
  async retry(operation, context = 'operation') {
    let lastError;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await operation();
        
        // Reset error count on success
        this.errorCounts.delete(context);
        
        return result;
      } catch (error) {
        lastError = error;
        
        // Track error frequency
        this.incrementErrorCount(context);
        
        console.log(`❌ Attempt ${attempt}/${this.maxRetries} failed for ${context}: ${error.message}`);
        
        // Don't retry on final attempt
        if (attempt === this.maxRetries) {
          break;
        }
        
        // Calculate backoff delay (exponential)
        const delay = this.baseDelay * Math.pow(2, attempt - 1);
        console.log(`⏳ Retrying in ${delay}ms...`);
        
        await this.sleep(delay);
      }
    }
    
    // All retries failed
    throw new Error(`${context} failed after ${this.maxRetries} attempts: ${lastError.message}`);
  }

  // Rate limit handling
  async handleRateLimit(error, operation) {
    if (error.data?.error === 'rate_limited') {
      const retryAfter = error.data.retry_after || 60;
      console.log(`⏸️  Rate limited. Waiting ${retryAfter} seconds...`);
      
      await this.sleep(retryAfter * 1000);
      return await operation();
    }
    throw error;
  }

  // Circuit breaker pattern
  shouldCircuitBreak(context) {
    const errorCount = this.errorCounts.get(context) || 0;
    const threshold = 5; // Open circuit after 5 consecutive errors
    
    if (errorCount >= threshold) {
      console.log(`🔴 Circuit breaker opened for ${context} (${errorCount} errors)`);
      return true;
    }
    
    return false;
  }

  // Track error frequency
  incrementErrorCount(context) {
    const count = this.errorCounts.get(context) || 0;
    this.errorCounts.set(context, count + 1);
  }

  // Categorize errors for better handling
  categorizeError(error) {
    // Network errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      return {
        type: 'NETWORK',
        retry: true,
        message: 'Network connection failed'
      };
    }
    
    // API rate limits
    if (error.status === 429 || error.data?.error === 'rate_limited') {
      return {
        type: 'RATE_LIMIT',
        retry: true,
        message: 'Rate limit exceeded'
      };
    }
    
    // Authentication errors
    if (error.status === 401 || error.status === 403) {
      return {
        type: 'AUTH',
        retry: false,
        message: 'Authentication failed - check API keys'
      };
    }
    
    // Server errors (5xx)
    if (error.status >= 500) {
      return {
        type: 'SERVER',
        retry: true,
        message: 'Server error - likely temporary'
      };
    }
    
    // Client errors (4xx)
    if (error.status >= 400 && error.status < 500) {
      return {
        type: 'CLIENT',
        retry: false,
        message: 'Request error - check parameters'
      };
    }
    
    // Unknown errors
    return {
      type: 'UNKNOWN',
      retry: true,
      message: error.message || 'Unknown error occurred'
    };
  }

  // Format error for logging/alerting
  formatError(error, context) {
    const category = this.categorizeError(error);
    
    return {
      timestamp: new Date().toISOString(),
      context,
      type: category.type,
      message: category.message,
      originalError: error.message,
      stack: error.stack,
      shouldRetry: category.retry,
      statusCode: error.status,
      errorData: error.data
    };
  }

  // Sleep utility
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Reset circuit breaker
  resetCircuit(context) {
    this.errorCounts.delete(context);
    console.log(`✅ Circuit breaker reset for ${context}`);
  }
}

// Singleton instance
const errorHandler = new ErrorHandler();

module.exports = errorHandler;