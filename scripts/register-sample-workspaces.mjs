const baseUrl = String(process.env.XANGI_URL || 'http://127.0.0.1:18888').replace(/\/$/u, '');
const headers = {
  'content-type': 'application/json',
  ...(process.env.XANGI_TOKEN ? { authorization: `Bearer ${process.env.XANGI_TOKEN}` } : {}),
};
const { createPresetWorkspaceLoader } = await import('../server/preset-workspaces.mjs');
const load = createPresetWorkspaceLoader(async (path, init = {}) => {
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `workspace HTTP ${response.status}`);
  return result;
});
const result = await load();
console.log('ready:', result.workspaces.filter(({ name }) => ['english', 'game'].includes(name)).map(({ name }) => name).join(', '));
