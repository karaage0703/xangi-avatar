import { fileURLToPath } from 'node:url';

export const PRESET_WORKSPACES = ['english', 'game'].map((name) => ({
  name, path: fileURLToPath(new URL(`../workspaces/${name}`, import.meta.url)),
}));

// Share concurrent requests, but allow a later request to retry after failure.
export function createPresetWorkspaceLoader(xangiJson) {
  let pending;
  return function load() {
    if (pending) return pending;
    pending = (async () => {
      const result = await xangiJson('/api/workspaces');
      const workspaces = [...(result.workspaces || [])];
      for (const sample of PRESET_WORKSPACES) {
        if (workspaces.some(({ name }) => name === sample.name)) continue;
        const created = await xangiJson('/api/workspaces', { method: 'POST', body: JSON.stringify(sample) });
        if (!created.workspace?.id) throw new Error(`workspace ${sample.name} registration returned no ID`);
        workspaces.push(created.workspace);
      }
      return { ...result, workspaces };
    })().finally(() => { pending = undefined; });
    return pending;
  };
}
