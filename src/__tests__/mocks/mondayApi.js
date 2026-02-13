// Mock Monday.com API responses

const mockBoards = [
  {
    id: '1234567',
    name: 'Project Alpha',
    columns: [
      { id: 'status', title: 'Status', type: 'status', settings_str: '{"done_colors":[1]}' },
      { id: 'person', title: 'Owner', type: 'people', settings_str: '{}' },
      { id: 'date', title: 'Due Date', type: 'date', settings_str: '{}' }
    ]
  },
  {
    id: '7654321',
    name: 'Project Beta',
    columns: [
      { id: 'status2', title: 'Status', type: 'status', settings_str: '{"done_colors":[1]}' },
      { id: 'person2', title: 'Assignee', type: 'people', settings_str: '{}' }
    ]
  }
];

const mockItems = [
  {
    id: '111',
    name: 'Fix login bug',
    column_values: [
      { id: 'status', text: 'Working on it', value: '{"index":0}', type: 'status' },
      { id: 'person', text: 'John Doe', value: '{"personsAndTeams":[{"id":42,"kind":"person"}]}', type: 'people' },
      { id: 'date', text: '2026-02-20', value: '{"date":"2026-02-20"}', type: 'date' }
    ]
  },
  {
    id: '222',
    name: 'Write tests',
    column_values: [
      { id: 'status', text: 'Done', value: '{"index":1}', type: 'status' },
      { id: 'person', text: 'Jane Smith', value: '{"personsAndTeams":[{"id":99,"kind":"person"}]}', type: 'people' },
      { id: 'date', text: '2026-02-10', value: '{"date":"2026-02-10"}', type: 'date' }
    ]
  }
];

const mockUsers = [
  { id: 42, name: 'John Doe', email: 'john@example.com', enabled: true },
  { id: 99, name: 'Jane Smith', email: 'jane@example.com', enabled: true },
  { id: 100, name: 'Disabled User', email: 'disabled@example.com', enabled: false }
];

function mockBoardsResponse(workspaceId) {
  return { data: { boards: mockBoards } };
}

function mockItemsResponse(boardId) {
  return {
    data: {
      boards: [{
        items_page: { items: mockItems }
      }]
    }
  };
}

function mockUsersResponse() {
  return { data: { users: mockUsers } };
}

function mockMutationResponse(itemId) {
  return {
    data: {
      change_column_value: {
        id: itemId,
        name: 'Updated Item'
      }
    }
  };
}

module.exports = {
  mockBoards,
  mockItems,
  mockUsers,
  mockBoardsResponse,
  mockItemsResponse,
  mockUsersResponse,
  mockMutationResponse
};
