#!/usr/bin/env node

/**
 * Environment validation script
 * Run this before starting the application to validate configuration
 */

require('dotenv').config();

const requiredEnvVars = [
  { key: 'MONDAY_API_KEY', description: 'Monday.com API key' },
  { key: 'SLACK_BOT_TOKEN', description: 'Slack bot token' }
];

const optionalEnvVars = [
  { key: 'SLACK_SIGNING_SECRET', description: 'Slack signing secret (required for server)' },
  { key: 'TEST_MODE', description: 'Test mode flag', default: 'false' },
  { key: 'WORKSPACE_IDS', description: 'Comma-separated workspace IDs' },
  { key: 'RATE_LIMIT_MS', description: 'Rate limit in milliseconds', default: '500' },
  { key: 'MAX_RETRIES', description: 'Maximum retry attempts', default: '3' },
  { key: 'PORT', description: 'Server port', default: '3000' }
];

console.log('🔍 Validating environment variables...\n');

let hasErrors = false;

// Check required variables
console.log('Required variables:');
for (const { key, description } of requiredEnvVars) {
  if (process.env[key]) {
    console.log(`  ✅ ${key}: Set (${description})`);
  } else {
    console.log(`  ❌ ${key}: Missing! (${description})`);
    hasErrors = true;
  }
}

console.log('\nOptional variables:');
for (const { key, description, default: defaultValue } of optionalEnvVars) {
  if (process.env[key]) {
    console.log(`  ✅ ${key}: Set to "${process.env[key]}" (${description})`);
  } else if (defaultValue) {
    console.log(`  ℹ️ ${key}: Using default "${defaultValue}" (${description})`);
  } else {
    console.log(`  ⚠️ ${key}: Not set (${description})`);
  }
}

if (process.env.NODE_ENV) {
  console.log(`\n📦 Environment: ${process.env.NODE_ENV}`);
}

if (hasErrors) {
  console.log('\n❌ Environment validation failed! Please set missing variables.');
  process.exit(1);
} else {
  console.log('\n✅ Environment validation successful!');
  process.exit(0);
}