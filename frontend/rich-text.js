export const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function safeLink(url) {
  if (/^https?:\/\//i.test(url || '')) return url;
  if (/^mailto:[^\s<>]+$/i.test(url || '')) return url;
  return null;
}

function imageURL(url, model) {
  if (/^data:image\/(?:png|jpeg|jpg|gif|webp|bmp);base64,[a-z0-9+/=\s]+$/i.test(url)) return url;
  try {
    const path = new URL(url, 'https://archive.invalid').pathname;
    return model.imageMap[url] || model.imageMap[path] || model.imageMap['basename:' + decodeURIComponent(path.split('/').pop())];
  } catch { return null; }
}

function cleanHTML(source, model) {
  const doc = new DOMParser().parseFromString(source, 'text/html');
  const allowed = new Set('P BR STRONG B EM I U S DEL A IMG UL OL LI BLOCKQUOTE PRE CODE H1 H2 H3 H4 HR TABLE THEAD TBODY TR TH TD SPAN DIV SUB SUP'.split(' '));
  function clean(node) {
    if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent);
    if (node.nodeType !== Node.ELEMENT_NODE) return document.createTextNode('');
    if (['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','FORM','INPUT','BUTTON','SVG','MATH','LINK','META'].includes(node.tagName)) return document.createTextNode('');
    if (!allowed.has(node.tagName)) {
      const fragment = document.createDocumentFragment();
      for (const child of node.childNodes) fragment.append(clean(child));
      return fragment;
    }
    if (node.tagName === 'IMG') {
      const local = imageURL(node.getAttribute('src') || '', model);
      if (!local) {
        const span = document.createElement('span'); span.className = 'missing-image';
        span.textContent = '▧ Изображение не сохранено в архиве'; return span;
      }
      const image = document.createElement('img'); image.src = local;
      image.alt = node.getAttribute('alt') || 'Изображение из карточки';
      image.loading = 'lazy'; image.dataset.preview = local;
      return image;
    }
    const element = document.createElement(node.tagName.toLowerCase());
    if (node.tagName === 'A') {
      const url = safeLink(node.getAttribute('href'));
      if (url) { element.href = url; element.target = '_blank'; element.rel = 'noopener noreferrer'; }
    }
    for (const child of node.childNodes) element.append(clean(child));
    return element;
  }
  const container = document.createElement('div');
  for (const node of doc.body.childNodes) container.append(clean(node));
  return container.innerHTML;
}

function markdown(source) {
  const tokens = [];
  const token = value => { tokens.push(value); return `\u0001${tokens.length - 1}\u0002`; };
  let text = String(source).replace(/```[^\n]*\n([\s\S]*?)```/g, (_, code) => token(`<pre><code>${escape(code)}</code></pre>`));
  text = escape(text);
  text = text.replace(/!\[([^\]]*)\]\(<?([^\s)>]+)>?(?:\s+&quot;[^)]*&quot;)?\)/g, (_, alt, url) => token(`<img alt="${alt}" src="${url}">`));
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) => token(`<a href="${url}">${label}</a>`));
  text = text.replace(/`([^`\n]+)`/g, '<code>$1</code>').replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>').replace(/__([^_\n]+)__/g, '<strong>$1</strong>').replace(/\*([^*\n]+)\*/g, '<em>$1</em>').replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
  let inList = false;
  const lines = text.split('\n');
  const rendered = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (line.includes('|') && /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(lines[index + 1] || '')) {
      if (inList) { rendered.push('</ul>'); inList = false; }
      const cells = row => row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(x=>x.trim());
      let table = '<table><thead><tr>' + cells(line).map(x=>'<th>'+x+'</th>').join('') + '</tr></thead><tbody>';
      index += 2;
      while (index < lines.length && lines[index].includes('|')) {
        table += '<tr>' + cells(lines[index]).map(x=>'<td>'+x+'</td>').join('') + '</tr>';
        index++;
      }
      index--;
      rendered.push(table + '</tbody></table>');
      continue;
    }
    let html = '';
    if (/^\s*[-*+]\s+/.test(line)) {
      if (!inList) { html = '<ul>'; inList = true; }
      rendered.push(html + '<li>' + line.replace(/^\s*[-*+]\s+/, '') + '</li>'); continue;
    }
    if (inList) { html += '</ul>'; inList = false; }
    if (/^#{1,4} /.test(line)) {
      const n = line.match(/^#+/)[0].length; rendered.push(html + `<h${n}>${line.slice(n + 1)}</h${n}>`); continue;
    }
    if (/^&gt;\s?/.test(line)) { rendered.push(html + '<blockquote>' + line.replace(/^&gt;\s?/, '') + '</blockquote>'); continue; }
    rendered.push(html + (line ? '<p>' + line + '</p>' : '<br>'));
  }
  text = rendered.join('') + (inList ? '</ul>' : '');
  text = text.replace(/\u0001(\d+)\u0002/g, (_, n) => tokens[Number(n)] || '');
  return text;
}

export function richText(text, model, type) {
  if (!text) return '<span class="muted">Описание не заполнено</span>';
  const html = type === 2 || /<\/?(?:p|div|img|ul|br|table|strong)\b/i.test(text) ? text : markdown(text);
  return cleanHTML(html, model);
}
