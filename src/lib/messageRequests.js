import { SOGO_MESSAGE_HEADERS } from './messageRows.js';

export function buildMessageViewBody(params = {}) {
  const body = {
    sortby: 'date',
    asc: 0,
    headers: SOGO_MESSAGE_HEADERS,
  };
  if (params.limit) body.limit = params.limit;
  if (params.offset) body.offset = params.offset;
  return body;
}

export function buildMessageSearchBody(query, criteria = 'all') {
  return {
    search: query,
    criteria,
    headers: SOGO_MESSAGE_HEADERS,
  };
}
