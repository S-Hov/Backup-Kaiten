/** HTTP adapter. Components receive data and do not know about the server. */
const prefix = '/api/v1';
async function get(path, params={}) {
  const response = await fetch(prefix + path + '?' + new URLSearchParams(params));
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Не удалось загрузить данные');
  return body;
}
export const api = {
  snapshots: () => get('/snapshots'),
  search: (snapshot, q, offset=0, limit=40) => get('/cards', {snapshot,q,offset,limit}),
  card: (snapshot,id) => get('/cards/'+encodeURIComponent(id), {snapshot}),
};
