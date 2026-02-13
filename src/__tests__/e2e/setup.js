// E2E test setup — nock-based HTTP interception for Monday.com and Slack APIs
const nock = require('nock');

function setupMondayNock(responses = []) {
  const scope = nock('https://api.monday.com').persist();
  responses.forEach(({ data, status = 200 }) => {
    scope.post('/v2').reply(status, { data });
  });
  return scope;
}

function setupSlackNock() {
  return nock('https://slack.com').persist();
}

function teardown() {
  nock.cleanAll();
  nock.restore();
  nock.activate();
}

module.exports = { setupMondayNock, setupSlackNock, teardown };
