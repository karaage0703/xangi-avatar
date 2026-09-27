// Display host execution evidence, never the assistant's self-reported model.
export function formatModelExecution(execution) {
  if (!execution) return '実行モデル：まだ記録がありません';
  const observed = Array.isArray(execution.observedModels) ? execution.observedModels : [];
  const model = execution.effectiveModel || observed.at(-1);
  const confirmed = execution.source === 'provider' && observed.length > 0;
  const name = model || execution.configuredModel || '不明';
  const detail = execution.modelSelection === 'Auto' && !model
    ? 'Auto（内部モデル不明）'
    : `${name}${confirmed ? '' : '（設定値・実行未確認）'}`;
  const others = observed.filter((item) => item !== model);
  const state = execution.status === 'running' ? '実行中' : execution.status === 'failed' ? '失敗した応答' : '直近の応答';
  return `${state}：${execution.backend || '不明'} / ${detail}${others.length ? ` / 同じ応答で使用：${others.join(', ')}` : ''}`;
}
