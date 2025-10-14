/**
 * Test file for Monday.com webhook handler
 * 
 * This file provides manual testing examples for the webhook functionality.
 * Run individual tests by uncommenting the test you want to run.
 */

require('dotenv').config();
const axios = require('axios');

// Configuration
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'http://localhost:3000/webhook/monday';

// Test data
const testEvents = {
  // Test 1: Challenge verification (Monday.com webhook setup)
  challenge: {
    challenge: 'test_challenge_12345'
  },
  
  // Test 2: User assigned to task (new assignment)
  newAssignment: {
    event: {
      type: 'change_column_value',
      boardId: 12345678,
      pulseId: 98765432,
      columnId: 'people',
      columnType: 'multiple-person',
      value: {
        value: JSON.stringify({
          personsAndTeams: [
            { id: 89455577, kind: 'person' }
          ]
        })
      },
      previousValue: {
        value: JSON.stringify({
          personsAndTeams: []
        })
      },
      userId: 12345678,
      timestamp: new Date().toISOString()
    }
  },
  
  // Test 3: Multiple users assigned
  multipleAssignments: {
    event: {
      type: 'change_column_value',
      boardId: 12345678,
      pulseId: 98765432,
      columnId: 'people',
      columnType: 'multiple-person',
      value: {
        value: JSON.stringify({
          personsAndTeams: [
            { id: 89455577, kind: 'person' },
            { id: 12345678, kind: 'person' }
          ]
        })
      },
      previousValue: {
        value: JSON.stringify({
          personsAndTeams: []
        })
      },
      userId: 12345678,
      timestamp: new Date().toISOString()
    }
  },
  
  // Test 4: User removed (should not trigger notification)
  userRemoved: {
    event: {
      type: 'change_column_value',
      boardId: 12345678,
      pulseId: 98765432,
      columnId: 'people',
      columnType: 'multiple-person',
      value: {
        value: JSON.stringify({
          personsAndTeams: []
        })
      },
      previousValue: {
        value: JSON.stringify({
          personsAndTeams: [
            { id: 89455577, kind: 'person' }
          ]
        })
      },
      userId: 12345678,
      timestamp: new Date().toISOString()
    }
  },
  
  // Test 5: Non-people column change (should be ignored)
  statusChange: {
    event: {
      type: 'change_column_value',
      boardId: 12345678,
      pulseId: 98765432,
      columnId: 'status',
      columnType: 'status',
      value: {
        value: JSON.stringify({ index: 1 })
      },
      previousValue: {
        value: JSON.stringify({ index: 0 })
      },
      userId: 12345678,
      timestamp: new Date().toISOString()
    }
  }
};

// Helper function to send test webhook
async function sendTestWebhook(testName, payload) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${testName}`);
  console.log(`${'='.repeat(60)}`);
  console.log('Payload:', JSON.stringify(payload, null, 2));
  
  try {
    const response = await axios.post(WEBHOOK_URL, payload, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('\n✅ Response Status:', response.status);
    console.log('Response Data:', JSON.stringify(response.data, null, 2));
    return response;
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.response) {
      console.error('Response Status:', error.response.status);
      console.error('Response Data:', error.response.data);
    }
    throw error;
  }
}

// Run tests
async function runTests() {
  console.log('🧪 Monday.com Webhook Handler Tests');
  console.log(`Webhook URL: ${WEBHOOK_URL}\n`);
  
  try {
    // Test 1: Challenge verification
    console.log('\n📋 Test 1: Challenge Verification');
    await sendTestWebhook('Challenge Verification', testEvents.challenge);
    await delay(1000);
    
    // Test 2: New user assignment
    console.log('\n📋 Test 2: New User Assignment');
    await sendTestWebhook('New User Assignment', testEvents.newAssignment);
    await delay(2000);
    
    // Test 3: Multiple users assigned
    console.log('\n📋 Test 3: Multiple Users Assignment');
    await sendTestWebhook('Multiple Users Assignment', testEvents.multipleAssignments);
    await delay(2000);
    
    // Test 4: User removed (should not notify)
    console.log('\n📋 Test 4: User Removed');
    await sendTestWebhook('User Removed', testEvents.userRemoved);
    await delay(1000);
    
    // Test 5: Non-people column change (should be ignored)
    console.log('\n📋 Test 5: Status Change (Should be Ignored)');
    await sendTestWebhook('Status Change', testEvents.statusChange);
    
    console.log('\n\n✅ All tests completed!');
    console.log('Check your Slack DMs and server logs for notifications.');
    
  } catch (error) {
    console.error('\n❌ Test suite failed:', error.message);
    process.exit(1);
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Individual test functions (uncomment to run specific tests)

async function testChallenge() {
  await sendTestWebhook('Challenge Only', testEvents.challenge);
}

async function testNewAssignment() {
  await sendTestWebhook('New Assignment Only', testEvents.newAssignment);
}

async function testMultipleAssignments() {
  await sendTestWebhook('Multiple Assignments Only', testEvents.multipleAssignments);
}

// Main execution
if (require.main === module) {
  // Run all tests
  runTests().catch(console.error);
  
  // Or run individual tests by uncommenting:
  // testChallenge().catch(console.error);
  // testNewAssignment().catch(console.error);
  // testMultipleAssignments().catch(console.error);
}

module.exports = {
  sendTestWebhook,
  testEvents,
  testChallenge,
  testNewAssignment,
  testMultipleAssignments
};
