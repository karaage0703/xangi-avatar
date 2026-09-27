import { readFileSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_NOTION_URL = 'https://api.notion.com/v1';
const DEFAULT_NOTION_VERSION = '2026-03-11';
const DEFAULT_SETTINGS_FILE = fileURLToPath(new URL('../.runtime/notion-settings.json', import.meta.url));

export function normalizeNotionPageId(value) {
  const input = String(value || '').trim();
  const matches = input.match(/(?<![0-9a-f])[0-9a-f]{8}(?:-?[0-9a-f]{4}){3}-?[0-9a-f]{12}(?![0-9a-f])/giu);
  if (!matches?.length) {
    const error = new Error('NotionページのURLまたは32文字のページIDを入力してください');
    error.statusCode = 400;
    throw error;
  }
  const raw = matches.at(-1).replaceAll('-', '').toLowerCase();
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}

function notionPageUrl(pageId) {
  return pageId ? `https://app.notion.com/p/${pageId.replaceAll('-', '')}` : '';
}

function pageTitle(page) {
  const property = Object.values(page?.properties || {}).find((candidate) => candidate?.type === 'title');
  return (property?.title || []).map((item) => item?.plain_text || item?.text?.content || '').join('').trim();
}

function savedParentPageId(settingsFile) {
  try {
    const saved = JSON.parse(readFileSync(settingsFile, 'utf8'));
    return normalizeNotionPageId(saved.parentPageId);
  } catch {
    return '';
  }
}

function richText(content) {
  return [{ type: 'text', text: { content: String(content || '').slice(0, 2_000) } }];
}

function plainText(items) {
  return (items || []).map((item) => item?.plain_text || item?.text?.content || '').join('').trim();
}

function blockText(block) {
  return plainText(block?.[block?.type]?.rich_text);
}

function parseConversationEntries(blocks) {
  const entries = [];
  let current = null;
  for (const block of blocks) {
    const text = blockText(block);
    if (block?.type === 'heading_2') {
      current = { recordedAt: text, user: '', character: '', imageCaption: '', imageUrl: '' };
      entries.push(current);
    } else if (current && block?.type === 'paragraph' && text.startsWith('利用者:')) {
      current.user = text.slice('利用者:'.length).trim();
    } else if (current && block?.type === 'quote' && text.startsWith('キャラクター:')) {
      current.character = text.slice('キャラクター:'.length).trim();
    } else if (current && block?.type === 'image') {
      current.imageCaption = plainText(block.image.caption);
      const imageType = block.image.type;
      if (imageType === 'file' || imageType === 'external') current.imageUrl = String(block.image[imageType]?.url || '');
    }
  }
  return entries;
}

export function createNotionConversationLog({
  token = process.env.NOTION_API_KEY || '',
  tokenFile = process.env.NOTION_API_KEY_FILE || '',
  parentPageId = process.env.NOTION_CONVERSATION_PARENT_PAGE_ID || '',
  fetchImpl = globalThis.fetch,
  baseUrl = DEFAULT_NOTION_URL,
  notionVersion = DEFAULT_NOTION_VERSION,
  settingsFile = DEFAULT_SETTINGS_FILE,
} = {}) {
  const normalizedTokenFile = String(tokenFile || '').trim();
  const normalizedToken = String(token || '').trim() || (normalizedTokenFile ? readFileSync(normalizedTokenFile, 'utf8').trim() : '');
  let activeParentPageId = savedParentPageId(settingsFile) || String(parentPageId || '').trim();
  const pagePromises = new Map();
  const sessionQueues = new Map();

  function currentParentPageId() {
    return savedParentPageId(settingsFile) || activeParentPageId;
  }

  async function request(path, { method = 'GET', json, body, headers = {} } = {}) {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${normalizedToken}`,
        'notion-version': notionVersion,
        ...(json ? { 'content-type': 'application/json' } : {}),
        ...headers,
      },
      body: json ? JSON.stringify(json) : body,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(result.message || `Notion HTTP ${response.status}`);
      error.statusCode = response.status;
      throw error;
    }
    return result;
  }

  async function createSessionPage({ sessionId, characterName, startedAt }) {
    const destinationPageId = currentParentPageId();
    if (!normalizedToken || !destinationPageId) throw new Error('Notion conversation log is not configured');
    const cacheKey = `${destinationPageId}:${sessionId}`;
    if (!pagePromises.has(cacheKey)) {
      const title = `画像付き会話記録 ${String(startedAt || '').slice(0, 10)} - ${characterName || 'xangi-avatar'}`;
      pagePromises.set(cacheKey, request('/pages', {
        method: 'POST',
        json: {
          parent: { type: 'page_id', page_id: destinationPageId },
          properties: { title: { title: richText(title) } },
          children: [{ type: 'paragraph', paragraph: { rich_text: richText('xangi-avatarの画面付き会話から自動記録') } }],
        },
      }).catch((error) => {
        pagePromises.delete(cacheKey);
        throw error;
      }));
    }
    return pagePromises.get(cacheKey);
  }

  async function listChildren(blockId) {
    const blocks = [];
    let cursor = '';
    do {
      const query = new URLSearchParams({ page_size: '100' });
      if (cursor) query.set('start_cursor', cursor);
      const page = await request(`/blocks/${encodeURIComponent(blockId)}/children?${query}`);
      blocks.push(...(page.results || []));
      cursor = page.has_more ? String(page.next_cursor || '') : '';
    } while (cursor);
    return blocks;
  }

  async function latestSnapshot() {
    const destinationPageId = currentParentPageId();
    if (!normalizedToken || !destinationPageId) {
      const error = new Error('Notion conversation log is not configured');
      error.statusCode = 503;
      throw error;
    }
    const children = await listChildren(destinationPageId);
    const candidates = children.filter((block) => block?.type === 'child_page' && String(block.child_page?.title || '').startsWith('画像付き会話記録 '));
    if (!candidates.length) return null;
    const latest = candidates.reduce((selected, candidate) => (
      String(candidate.last_edited_time || '') > String(selected.last_edited_time || '') ? candidate : selected
    ));
    const page = await request(`/pages/${encodeURIComponent(latest.id)}`);
    const blocks = await listChildren(latest.id);
    return {
      source: 'notion',
      retrievedAt: new Date().toISOString(),
      page: {
        id: page.id || latest.id,
        url: page.url || notionPageUrl(page.id || latest.id),
        title: pageTitle(page) || latest.child_page?.title || '',
        lastEditedTime: page.last_edited_time || latest.last_edited_time || '',
      },
      entries: parseConversationEntries(blocks),
    };
  }

  async function uploadImage({ image, filename, mimeType }) {
    const upload = await request('/file_uploads', {
      method: 'POST',
      json: { mode: 'single_part', filename, content_type: mimeType },
    });
    const form = new FormData();
    form.append('file', new Blob([image], { type: mimeType }), filename);
    await request(`/file_uploads/${encodeURIComponent(upload.id)}/send`, { method: 'POST', body: form });
    return upload.id;
  }

  async function appendEntryNow(entry) {
    const page = await createSessionPage(entry);
    const uploadId = await uploadImage(entry);
    const recordedAt = String(entry.recordedAt || new Date().toISOString());
    await request(`/blocks/${encodeURIComponent(page.id)}/children`, {
      method: 'PATCH',
      json: {
        children: [
          { type: 'heading_2', heading_2: { rich_text: richText(recordedAt) } },
          { type: 'paragraph', paragraph: { rich_text: richText(`利用者: ${entry.spokenText || '（発話なし）'}`) } },
          { type: 'quote', quote: { rich_text: richText(`キャラクター: ${entry.responseText || '（返答なし）'}`) } },
          {
            type: 'image',
            image: {
              type: 'file_upload',
              file_upload: { id: uploadId },
              caption: richText(`${recordedAt} ${entry.characterName || 'xangi-avatar'}`),
            },
          },
        ],
      },
    });
    return { pageId: page.id, pageUrl: page.url || '' };
  }

  function appendEntry(entry) {
    if (!normalizedToken || !currentParentPageId()) return Promise.reject(new Error('Notion conversation log is not configured'));
    const sessionId = String(entry?.sessionId || '').trim();
    if (!sessionId) return Promise.reject(new Error('sessionId is required'));
    const previous = sessionQueues.get(sessionId) || Promise.resolve();
    const current = previous.catch(() => {}).then(() => appendEntryNow({ ...entry, sessionId }));
    const queued = current.finally(() => {
      if (sessionQueues.get(sessionId) === queued) sessionQueues.delete(sessionId);
    });
    sessionQueues.set(sessionId, queued);
    return current;
  }

  function getSettings(extra = {}) {
    const destinationPageId = currentParentPageId();
    return {
      configured: Boolean(normalizedToken && destinationPageId),
      tokenConfigured: Boolean(normalizedToken),
      parentPageId: destinationPageId,
      parentPageUrl: notionPageUrl(destinationPageId),
      ...extra,
    };
  }

  async function configureParentPage(value) {
    if (!normalizedToken) {
      const error = new Error('Notion APIキーがサーバーに設定されていません');
      error.statusCode = 503;
      throw error;
    }
    const nextParentPageId = normalizeNotionPageId(value);
    const page = await request(`/pages/${encodeURIComponent(nextParentPageId)}`);
    if (settingsFile) {
      await mkdir(dirname(settingsFile), { recursive: true, mode: 0o700 });
      const temporaryFile = `${settingsFile}.${process.pid}-${randomUUID()}.tmp`;
      await writeFile(temporaryFile, `${JSON.stringify({ parentPageId: nextParentPageId }, null, 2)}\n`, { mode: 0o600 });
      await rename(temporaryFile, settingsFile);
    }
    activeParentPageId = nextParentPageId;
    return getSettings({ parentPageTitle: pageTitle(page) });
  }

  return {
    get configured() { return getSettings().configured; },
    getSettings,
    configureParentPage,
    latestSnapshot,
    appendEntry,
  };
}
