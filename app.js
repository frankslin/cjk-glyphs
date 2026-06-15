const FONT_COLUMNS = [
  {
    label: '簡中',
    className: 'noto-sc',
    lang: 'zh-CN',
    region: 'cn',
    serifName: 'Noto Serif SC',
    sansName: 'Noto Sans SC',
  },
  {
    label: '香港',
    className: 'noto-hk',
    lang: 'zh-HK',
    region: 'hk',
    serifName: 'Noto Serif HK',
    sansName: 'Noto Sans HK',
  },
  {
    label: '台灣',
    className: 'noto-tc',
    lang: 'zh-TW',
    region: 'tw',
    serifName: 'Noto Serif TC',
    sansName: 'Noto Sans TC',
  },
  {
    label: '日本',
    className: 'noto-jp',
    lang: 'ja-JP',
    region: 'jp',
    serifName: 'Noto Serif JP',
    sansName: 'Noto Sans JP',
  },
];

const MAX_CANDIDATE_POOL_SIZE = 256;

const DICTIONARY_SOURCES = {
  st: 'https://cdn.jsdelivr.net/gh/BYVoid/OpenCC@master/data/dictionary/STCharacters.txt',
  ts: 'https://cdn.jsdelivr.net/gh/BYVoid/OpenCC@master/data/dictionary/TSCharacters.txt',
  jp: 'https://cdn.jsdelivr.net/gh/BYVoid/OpenCC@master/data/dictionary/JPShinjitaiCharacters.txt',
  tw: 'https://cdn.jsdelivr.net/gh/BYVoid/OpenCC@master/data/dictionary/TWVariants.txt',
  hk: 'https://cdn.jsdelivr.net/gh/BYVoid/OpenCC@master/data/dictionary/HKVariants.txt',
};

const input = document.querySelector('#charInput');
const familySelect = document.querySelector('#familySelect');
const renderButton = document.querySelector('#renderButton');
const randomButton = document.querySelector('#randomButton');
const randomCandidates = document.querySelector('#randomCandidates');
const mappingStatus = document.querySelector('#mappingStatus');
const glyphHead = document.querySelector('#glyphHead');
const glyphBody = document.querySelector('#glyphBody');

let isComposing = false;
const dictionaryMap = new Map();
const rowMap = new Map();
const relationMap = new Map();
const tofuRiskChars = new Set();
let randomSourceChars = [];

function firstCodePoint(text) {
  return [...text.trim()][0] || '';
}

function escapeHtml(text) {
  return String(text).replace(/[&<>'"]/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  }[ch]));
}

function parseDictionary(text) {
  const rows = [];
  let comment = '';

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      comment = '';
      continue;
    }
    if (trimmed.startsWith('#')) {
      const body = trimmed.replace(/^#+\s?/, '');
      if (body) comment = comment ? `${comment}\n${body}` : body;
      continue;
    }

    const [key, ...values] = trimmed.split(/\s+/);
    const forms = unique([key, ...values]).filter((value) => [...value].length === 1);
    if (forms.length >= 2) rows.push({ key, values, forms, comment });
    comment = '';
  }

  return rows;
}

function indexRows(name, rows) {
  rowMap.set(name, rows);
  for (const row of rows) {
    if (row.comment.includes('@tofu-risk')) {
      for (const form of row.forms) tofuRiskChars.add(form);
    }
    for (const form of row.forms) {
      if (!relationMap.has(form)) relationMap.set(form, []);
      relationMap.get(form).push({ source: name, row });
    }
  }
}

function updateRandomSourceChars() {
  randomSourceChars = unique([...rowMap.values()].flatMap((rows) => (
    rows.flatMap((row) => row.forms)
  ))).filter((value) => !tofuRiskChars.has(value));
}

async function initDictionaries() {
  const entries = await Promise.all(Object.entries(DICTIONARY_SOURCES).map(async ([name, url]) => {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return [name, parseDictionary(await response.text())];
    } catch (error) {
      console.warn(`OpenCC dictionary load failed: ${name}`, error);
      return null;
    }
  }));

  const loaded = [];
  for (const entry of entries) {
    if (!entry) continue;
    const [name, dictionary] = entry;
    dictionaryMap.set(name, dictionary);
    indexRows(name, dictionary);
    loaded.push(name);
  }

  updateRandomSourceChars();

  if (!loaded.length) throw new Error('No OpenCC dictionaries loaded');
  return loaded;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function rowsForSource(name, ch) {
  return (relationMap.get(ch) || []).filter((item) => item.source === name).map((item) => item.row);
}

function relatedForms(name, ch) {
  return unique(rowsForSource(name, ch).flatMap((row) => row.forms));
}

function sourceKeys(name, ch) {
  return unique(rowsForSource(name, ch).map((row) => row.key));
}

function sourceValues(name, ch) {
  return unique(rowsForSource(name, ch).flatMap((row) => row.values));
}

function sourceComments(name, ch) {
  return unique(rowsForSource(name, ch).map((row) => row.comment).filter(Boolean));
}

function isCompatibilityRow(row) {
  return row.comment.includes('Preserved for compatibility');
}

function isCommentedAsChineseOnly(row, form) {
  const formLine = row.comment.split('\n').find((line) => line.includes(`「${form}」`));
  if (!formLine) return false;
  return /繁體中文|既非常用漢字也非人名用漢字|不可用於日本人|映射相容/.test(formLine);
}

function chineseOnlyJapaneseDictionaryForms(row) {
  const compatibilityForms = isCompatibilityRow(row)
    ? row.forms.filter((value) => value !== row.key)
    : [];
  const commentedForms = row.forms.filter((value) => isCommentedAsChineseOnly(row, value));
  return unique([...compatibilityForms, ...commentedForms]);
}

function japaneseForms(ch) {
  return unique(rowsForSource('jp', ch).flatMap((row) => (
    row.forms.filter((value) => !chineseOnlyJapaneseDictionaryForms(row).includes(value))
  )));
}

function japaneseChineseForms(ch) {
  return unique(rowsForSource('jp', ch).flatMap((row) => (
    chineseOnlyJapaneseDictionaryForms(row)
  )));
}

function collectRelated(ch) {
  return unique((relationMap.get(ch) || []).flatMap(({ row }) => row.forms));
}

function hasDictionaryRelation(ch) {
  return (relationMap.get(ch) || []).length > 0;
}

function buildCandidatePool(ch) {
  const pool = new Set([ch]);
  const queue = [ch];

  while (queue.length && pool.size < MAX_CANDIDATE_POOL_SIZE) {
    const value = queue.shift();
    for (const related of collectRelated(value)) {
      if (pool.has(related)) continue;
      pool.add(related);
      queue.push(related);
      if (pool.size >= MAX_CANDIDATE_POOL_SIZE) break;
    }
  }

  return [...pool];
}

function candidates(values, fallback) {
  const filtered = unique(values).filter((value) => [...value].length === 1);
  return filtered.length ? filtered : (fallback ? [fallback] : []);
}

function annotateCandidate(value) {
  const groups = new Set();
  const scripts = new Set();
  const comments = [];
  let verifiedChineseAttribute = false;
  let jpChineseOnly = false;

  for (const { source, row } of relationMap.get(value) || []) {
    if (source === 'st') {
      if (row.key === value) groups.add('簡體');
      if (row.values.includes(value)) groups.add('繁體');
      scripts.add('zh');
      verifiedChineseAttribute = true;
    } else if (source === 'ts') {
      if (row.key === value) groups.add('繁體');
      if (row.values.includes(value)) groups.add('簡體');
      scripts.add('zh');
      verifiedChineseAttribute = true;
    } else if (source === 'tw') {
      groups.add('繁體');
      scripts.add('zh');
      verifiedChineseAttribute = true;
    } else if (source === 'hk') {
      groups.add('繁體');
      scripts.add('zh');
      verifiedChineseAttribute = true;
    } else if (source === 'jp') {
      if (japaneseForms(value).includes(value)) {
        groups.add('日文');
        scripts.add('jp');
        if (row.comment) comments.push(row.comment);
      }
      if (japaneseChineseForms(value).includes(value)) {
        jpChineseOnly = true;
        scripts.add('zh');
        if (row.comment) comments.push(row.comment);
      }
    }
  }

  if (jpChineseOnly && !verifiedChineseAttribute) {
    groups.add('中文');
  }

  if (!groups.size) groups.add('通用');
  if (!scripts.size) {
    scripts.add('zh');
    scripts.add('jp');
  }

  return {
    group: [...groups].join(' / '),
    scripts: [...scripts],
    comments: unique(comments),
    value,
  };
}

function buildRows(ch) {
  if (!hasDictionaryRelation(ch)) {
    return [{ group: '通用', scripts: ['zh', 'jp'], comments: [], value: ch }];
  }

  const rows = buildCandidatePool(ch).map(annotateCandidate);

  if (rows.length === 1) {
    return [{ group: '通用', scripts: rows[0].scripts, value: rows[0].value }];
  }
  return rows;
}

function codePointLabel(ch) {
  return `U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
}

function renderGlyph(value, family, column) {
  const fontName = family === 'serif' ? column.serifName : column.sansName;
  return `
    <div class="glyph-rendering">
      <span class="glyph-sample ${family} ${column.className}" lang="${column.lang}">
        ${escapeHtml(value)}
      </span>
      <span class="font-name">${escapeHtml(fontName)}</span>
    </div>
  `;
}

function renderUnavailable() {
  return '<span class="unavailable" title="此字不屬於該列候選體系">—</span>';
}

function shouldRenderInColumn(row, column) {
  if (column.region !== 'jp') return true;
  // Japanese uses traditional-based forms; purely simplified characters don't exist in Japanese
  if (row.scripts.includes('jp')) return true;
  return row.group !== '簡體';
}

function renderUnicodeButton(value) {
  const codePoint = codePointLabel(value);
  return `
    <button class="unicode-copy" type="button" data-copy="${escapeHtml(codePoint)}" title="複製 ${escapeHtml(codePoint)}">
      ${escapeHtml(codePoint)}
    </button>
  `;
}

function renderComment(comments) {
  if (!comments.length) return '';
  return ` <span class="row-comment" title="${escapeHtml(comments.join('\n\n'))}">comment</span>`;
}

function renderGlyphTable(ch) {
  const family = document.querySelector('input[name="fontFamily"]:checked')?.value || 'serif';
  const rows = buildRows(ch);

  glyphHead.innerHTML = `
    <tr>
      <th scope="col">字組</th>
      <th scope="col">字元</th>
      <th scope="col">Unicode</th>
      ${FONT_COLUMNS.map((column) => `<th scope="col">${escapeHtml(column.label)}</th>`).join('')}
    </tr>
  `;

  glyphBody.innerHTML = '';
  let previousGroup = '';
  for (const row of rows) {
    const tr = document.createElement('tr');
    if (row.group !== previousGroup) tr.className = 'group-start';
    tr.innerHTML = `
      <th scope="row">${escapeHtml(row.group)}</th>
      <td class="character-cell">${escapeHtml(row.value)}${renderComment(row.comments)}</td>
      <td>${renderUnicodeButton(row.value)}</td>
      ${FONT_COLUMNS.map((column) => `
        <td>${shouldRenderInColumn(row, column) ? renderGlyph(row.value, family, column) : renderUnavailable()}</td>
      `).join('')}
    `;
    glyphBody.appendChild(tr);
    previousGroup = row.group;
  }
}

function pickRandomCandidates(count = 5) {
  const source = randomSourceChars.slice();
  const picked = [];

  while (source.length && picked.length < count) {
    const index = Math.floor(Math.random() * source.length);
    const [candidate] = source.splice(index, 1);
    picked.push(candidate);
  }

  return picked;
}

function setInputAndRender(ch) {
  input.value = ch;
  render();
}

function renderRandomCandidates(candidates, active) {
  randomCandidates.innerHTML = candidates.map((candidate) => `
    <button class="random-candidate${candidate === active ? ' active' : ''}" type="button" data-char="${escapeHtml(candidate)}" title="查看 ${escapeHtml(candidate)}">
      ${escapeHtml(candidate)}
    </button>
  `).join('');
}

function refreshRandomCandidates() {
  const candidates = pickRandomCandidates(5);
  if (!candidates.length) return;
  renderRandomCandidates(candidates, candidates[0]);
  setInputAndRender(candidates[0]);
}

function render() {
  const ch = firstCodePoint(input.value);
  if (!ch) return;
  renderGlyphTable(ch);
  const url = new URL(window.location);
  if (url.searchParams.get('glyph') !== ch) {
    url.searchParams.set('glyph', ch);
    history.replaceState(null, '', url);
  }
}

const glyphParam = new URLSearchParams(window.location.search).get('glyph');
if (glyphParam) {
  const ch = firstCodePoint(glyphParam);
  if (ch) input.value = ch;
}

renderButton.addEventListener('click', render);
randomButton.addEventListener('click', refreshRandomCandidates);
familySelect.addEventListener('change', render);
input.addEventListener('compositionstart', () => {
  isComposing = true;
});
input.addEventListener('compositionend', () => {
  isComposing = false;
  render();
});
input.addEventListener('input', () => {
  if (!isComposing) render();
});
glyphBody.addEventListener('click', async (event) => {
  const button = event.target.closest('.unicode-copy');
  if (!button) return;
  const text = button.dataset.copy;
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
    button.textContent = '已複製';
  } catch {
    button.textContent = '複製失敗';
  }
  window.setTimeout(() => {
    button.textContent = text;
  }, 900);
});
randomCandidates.addEventListener('click', (event) => {
  const button = event.target.closest('.random-candidate');
  if (!button) return;
  const ch = button.dataset.char;
  if (!ch) return;
  for (const candidateButton of randomCandidates.querySelectorAll('.random-candidate')) {
    candidateButton.classList.toggle('active', candidateButton === button);
  }
  setInputAndRender(ch);
});

initDictionaries()
  .then((loaded) => {
    mappingStatus.textContent = `OpenCC CDN 字表 loaded (${loaded.join(', ')}).`;
    renderRandomCandidates(pickRandomCandidates(5), '');
  })
  .catch((error) => {
    console.warn('OpenCC dictionary load failed', error);
    mappingStatus.textContent = 'OpenCC CDN 字表未載入。';
  })
  .finally(render);
