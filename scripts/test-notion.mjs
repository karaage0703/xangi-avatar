import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNotionConversationLog, normalizeNotionPageId } from '../server/notion.mjs';

assert.equal(normalizeNotionPageId('https://app.notion.com/p/3ddbd1ff57e0800b869dfda2b83a1ebd'), '3ddbd1ff-57e0-800b-869d-fda2b83a1ebd');
assert.equal(normalizeNotionPageId('3DDBD1FF-57E0-800B-869D-FDA2B83A1EBD'), '3ddbd1ff-57e0-800b-869d-fda2b83a1ebd');
assert.throws(() => normalizeNotionPageId('not-a-page'), /Notionページ/);

const requests = [];
const responses = [
  { id: 'page-1', url: 'https://notion.so/page-1' },
  { id: 'upload-1', status: 'pending' },
  { id: 'upload-1', status: 'uploaded' },
  { results: [] },
  { id: 'upload-2', status: 'pending' },
  { id: 'upload-2', status: 'uploaded' },
  { results: [] },
];
const fetchImpl = async (url, init) => {
  requests.push({ url, init });
  return new Response(JSON.stringify(responses.shift()), { status: 200, headers: { 'content-type': 'application/json' } });
};
const log = createNotionConversationLog({ token: 'secret', parentPageId: 'parent-1', fetchImpl });
assert.equal(log.configured, true);
const result = await log.appendEntry({
  sessionId: 'session-1',
  characterName: '相棒',
  startedAt: '2026-09-16T08:00:00.000Z',
  recordedAt: '2026-09-16T08:01:00.000Z',
  spokenText: '次はどこ？',
  responseText: '上へ進もう。',
  image: Buffer.from('jpeg'),
  filename: 'frame.jpg',
  mimeType: 'image/jpeg',
});
assert.deepEqual(result, { pageId: 'page-1', pageUrl: 'https://notion.so/page-1' });
assert.deepEqual(requests.map(({ url, init }) => [url, init.method]), [
  ['https://api.notion.com/v1/pages', 'POST'],
  ['https://api.notion.com/v1/file_uploads', 'POST'],
  ['https://api.notion.com/v1/file_uploads/upload-1/send', 'POST'],
  ['https://api.notion.com/v1/blocks/page-1/children', 'PATCH'],
]);
assert.equal(requests[2].init.body instanceof FormData, true);
const appendBody = JSON.parse(requests[3].init.body);
assert.equal(appendBody.children[1].paragraph.rich_text[0].text.content, '利用者: 次はどこ？');
assert.equal(appendBody.children[3].image.file_upload.id, 'upload-1');
assert.equal(requests[0].init.headers.authorization, 'Bearer secret');
assert.equal(requests[0].init.headers['notion-version'], '2026-03-11');

await log.appendEntry({
  sessionId: 'session-1',
  characterName: '相棒',
  startedAt: '2026-09-16T08:00:00.000Z',
  recordedAt: '2026-09-16T08:02:00.000Z',
  spokenText: '次は？',
  responseText: '右へ進もう。',
  image: Buffer.from('jpeg-2'),
  filename: 'frame-2.jpg',
  mimeType: 'image/jpeg',
});
assert.equal(requests.filter(({ url }) => url.endsWith('/pages')).length, 1);
assert.equal(requests.filter(({ url }) => url.endsWith('/blocks/page-1/children')).length, 2);

const disabled = createNotionConversationLog({ token: '', parentPageId: '' });
assert.equal(disabled.configured, false);
await assert.rejects(() => disabled.appendEntry({ sessionId: 's' }), /not configured/);
await assert.rejects(() => disabled.latestSnapshot(), /not configured/);

const snapshotRequests = [];
const snapshotResponses = [
  {
    results: [
      {
        id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        type: 'child_page',
        last_edited_time: '2026-09-17T12:06:00.000Z',
        child_page: { title: '無関係なページ' },
      },
    ],
    has_more: true,
    next_cursor: 'parent-next',
  },
  {
    results: [
      {
        id: '11111111-2222-3333-4444-555555555555',
        type: 'child_page',
        last_edited_time: '2026-09-17T12:05:00.000Z',
        child_page: { title: '画像付き会話記録 2026-09-17 - 相棒' },
      },
    ],
    has_more: false,
  },
  {
    id: '11111111-2222-3333-4444-555555555555',
    url: 'https://notion.so/session',
    last_edited_time: '2026-09-17T12:05:00.000Z',
    properties: { title: { type: 'title', title: [{ plain_text: '画像付き会話記録 2026-09-17 - 相棒' }] } },
  },
  {
    results: [
      { type: 'heading_2', heading_2: { rich_text: [{ plain_text: '2026-09-17T12:04:00.000Z' }] } },
      { type: 'paragraph', paragraph: { rich_text: [{ plain_text: '利用者: 北へ進む' }] } },
      { type: 'quote', quote: { rich_text: [{ plain_text: 'キャラクター: 鍵を見つけた' }] } },
      {
        type: 'image',
        image: {
          type: 'file',
          file: { url: 'https://files.example/temporary-image' },
          caption: [{ plain_text: 'scene 1' }],
        },
      },
    ],
    has_more: false,
  },
];
const snapshotLog = createNotionConversationLog({
  token: 'secret',
  parentPageId: 'parent-1',
  fetchImpl: async (url, init) => {
    snapshotRequests.push({ url, init });
    return new Response(JSON.stringify(snapshotResponses.shift()), { status: 200, headers: { 'content-type': 'application/json' } });
  },
});
const snapshot = await snapshotLog.latestSnapshot();
assert.equal(snapshot.page.id, '11111111-2222-3333-4444-555555555555');
assert.equal(snapshot.page.lastEditedTime, '2026-09-17T12:05:00.000Z');
assert.deepEqual(snapshot.entries, [{
  recordedAt: '2026-09-17T12:04:00.000Z',
  user: '北へ進む',
  character: '鍵を見つけた',
  imageCaption: 'scene 1',
  imageUrl: 'https://files.example/temporary-image',
}]);
assert.deepEqual(snapshotRequests.map(({ url, init }) => [url, init.method]), [
  ['https://api.notion.com/v1/blocks/parent-1/children?page_size=100', 'GET'],
  ['https://api.notion.com/v1/blocks/parent-1/children?page_size=100&start_cursor=parent-next', 'GET'],
  ['https://api.notion.com/v1/pages/11111111-2222-3333-4444-555555555555', 'GET'],
  ['https://api.notion.com/v1/blocks/11111111-2222-3333-4444-555555555555/children?page_size=100', 'GET'],
]);

const tokenDirectory = await mkdtemp(join(tmpdir(), 'xangi-avatar-notion-'));
try {
  const tokenFile = join(tokenDirectory, 'token');
  await writeFile(tokenFile, 'file-secret\n', { mode: 0o600 });
  const fileConfigured = createNotionConversationLog({ tokenFile, parentPageId: 'parent-1' });
  assert.equal(fileConfigured.configured, true);

  const settingsFile = join(tokenDirectory, 'notion-settings.json');
  const settingsRequests = [];
  const configurable = createNotionConversationLog({
    token: 'secret',
    parentPageId: '',
    settingsFile,
    fetchImpl: async (url, init) => {
      settingsRequests.push({ url, init });
      return new Response(JSON.stringify({
        id: '3ddbd1ff-57e0-800b-869d-fda2b83a1ebd',
        properties: { title: { type: 'title', title: [{ plain_text: '会話ログ' }] } },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  const settings = await configurable.configureParentPage('https://app.notion.com/p/3ddbd1ff57e0800b869dfda2b83a1ebd');
  assert.deepEqual(settings, {
    configured: true,
    tokenConfigured: true,
    parentPageId: '3ddbd1ff-57e0-800b-869d-fda2b83a1ebd',
    parentPageUrl: 'https://app.notion.com/p/3ddbd1ff57e0800b869dfda2b83a1ebd',
    parentPageTitle: '会話ログ',
  });
  assert.equal(settingsRequests[0].url, 'https://api.notion.com/v1/pages/3ddbd1ff-57e0-800b-869d-fda2b83a1ebd');
  assert.deepEqual(JSON.parse(await readFile(settingsFile, 'utf8')), { parentPageId: '3ddbd1ff-57e0-800b-869d-fda2b83a1ebd' });
  const reloaded = createNotionConversationLog({ token: 'secret', parentPageId: 'fallback', settingsFile });
  assert.equal(reloaded.getSettings().parentPageId, '3ddbd1ff-57e0-800b-869d-fda2b83a1ebd');
  await writeFile(settingsFile, JSON.stringify({ parentPageId: '4eecf20068f1437893af22239af6c1a2' }), { mode: 0o600 });
  assert.equal(reloaded.getSettings().parentPageId, '4eecf200-68f1-4378-93af-22239af6c1a2');
} finally {
  await rm(tokenDirectory, { recursive: true, force: true });
}

console.log('Notion conversation log tests passed');
