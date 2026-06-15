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

const CONVERTER_SPECS = [
  ['s2t: cn → t', { from: 'cn', to: 't' }],
  ['s2tw: cn → tw', { from: 'cn', to: 'tw' }],
  ['s2hk: cn → hk', { from: 'cn', to: 'hk' }],
  ['t2s: t → cn', { from: 't', to: 'cn' }],
  ['tw2s: tw → cn', { from: 'tw', to: 'cn' }],
  ['hk2s: hk → cn', { from: 'hk', to: 'cn' }],
];
const CONVERTER_NAMES = CONVERTER_SPECS.map(([label]) => label.split(':')[0]);
const DICTIONARY_CONVERTER_NAMES = [...CONVERTER_NAMES, 't2jp', 'jp2t'];
const MAX_CANDIDATE_POOL_SIZE = 256;

const DICTIONARY_SOURCES = {
  st: 'https://cdn.jsdelivr.net/gh/BYVoid/OpenCC@master/data/dictionary/STCharacters.txt',
  ts: 'https://cdn.jsdelivr.net/gh/BYVoid/OpenCC@master/data/dictionary/TSCharacters.txt',
  tw: 'https://cdn.jsdelivr.net/gh/BYVoid/OpenCC@master/data/dictionary/TWVariants.txt',
  hk: 'https://cdn.jsdelivr.net/gh/BYVoid/OpenCC@master/data/dictionary/HKVariants.txt',
  t2jp: 'https://cdn.jsdelivr.net/gh/BYVoid/OpenCC@master/data/dictionary/JPVariants.txt',
  jp2t: 'https://cdn.jsdelivr.net/gh/BYVoid/OpenCC@master/data/dictionary/JPShinjitaiCharacters.txt',
};

const input = document.querySelector('#charInput');
const familySelect = document.querySelector('#familySelect');
const renderButton = document.querySelector('#renderButton');
const mappingStatus = document.querySelector('#mappingStatus');
const glyphHead = document.querySelector('#glyphHead');
const glyphBody = document.querySelector('#glyphBody');

let isComposing = false;
const converterMap = new Map();
const dictionaryMap = new Map();
const reverseDictionaryMap = new Map();

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
  const dictionary = new Map();
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...values] = trimmed.split(/\s+/);
    if (!key || !values.length) continue;
    dictionary.set(key, values);
  }
  return dictionary;
}

function reverseDictionary(dictionary) {
  const reversed = new Map();
  for (const [key, values] of dictionary) {
    for (const value of values) {
      reversed.set(value, unique([...(reversed.get(value) || []), key]));
    }
  }
  return reversed;
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
    reverseDictionaryMap.set(name, reverseDictionary(dictionary));
    loaded.push(name);
  }

  if (!loaded.length) throw new Error('No OpenCC dictionaries loaded');
  return loaded;
}

function initConverters() {
  if (!window.OpenCC) {
    mappingStatus.textContent = 'opencc-js 未載入；請確認網路或 CDN。';
    return;
  }

  CONVERTER_SPECS.forEach(([label, options]) => {
    try {
      const converter = OpenCC.Converter(options);
      converterMap.set(label.split(':')[0], converter);
    } catch (error) {
      console.warn(`OpenCC converter failed: ${label}`, error);
    }
  });

  mappingStatus.textContent = 'opencc-js loaded.';
}

function valuesFromDictionary(name, text) {
  return dictionaryMap.get(name)?.get(text) || [];
}

function valuesFromReverseDictionary(name, text) {
  return reverseDictionaryMap.get(name)?.get(text) || [];
}

function convertWith(name, text) {
  const converter = converterMap.get(name);
  if (!converter) return text;
  try { return converter(text); } catch { return text; }
}

function convertManyWith(name, text) {
  const dictionaryValues = {
    s2t: () => valuesFromDictionary('st', text),
    t2s: () => unique([
      ...valuesFromDictionary('ts', text),
      ...valuesFromReverseDictionary('st', text),
    ]),
    s2tw: () => unique([
      ...valuesFromDictionary('tw', text),
      ...valuesFromDictionary('st', text).flatMap((value) => valuesFromDictionary('tw', value)),
    ]),
    tw2s: () => unique([
      ...valuesFromReverseDictionary('tw', text).flatMap((value) => valuesFromDictionary('ts', value)),
      ...valuesFromDictionary('ts', text),
    ]),
    s2hk: () => unique([
      ...valuesFromDictionary('hk', text),
      ...valuesFromDictionary('st', text).flatMap((value) => valuesFromDictionary('hk', value)),
    ]),
    hk2s: () => unique([
      ...valuesFromReverseDictionary('hk', text).flatMap((value) => valuesFromDictionary('ts', value)),
      ...valuesFromDictionary('ts', text),
    ]),
    t2jp: () => unique([
      ...valuesFromDictionary('t2jp', text),
      ...valuesFromReverseDictionary('jp2t', text),
    ]),
    jp2t: () => unique([
      ...valuesFromDictionary('jp2t', text),
      ...valuesFromReverseDictionary('t2jp', text),
    ]),
  }[name]?.() || [];

  if (dictionaryValues.length) return dictionaryValues;
  const converted = convertWith(name, text);
  return converted === text ? [] : [converted];
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function buildCandidatePool(ch) {
  const pool = new Set([ch]);
  const queue = [ch];

  while (queue.length && pool.size < MAX_CANDIDATE_POOL_SIZE) {
    const value = queue.shift();
    for (const name of DICTIONARY_CONVERTER_NAMES) {
      for (const converted of convertManyWith(name, value)) {
        if ([...converted].length !== 1 || pool.has(converted)) continue;
        pool.add(converted);
        queue.push(converted);
        if (pool.size >= MAX_CANDIDATE_POOL_SIZE) break;
      }
      if (pool.size >= MAX_CANDIDATE_POOL_SIZE) break;
    }
  }

  return [...pool];
}

function candidates(values, fallback) {
  const filtered = unique(values).filter((value) => [...value].length === 1);
  return filtered.length ? filtered : [fallback];
}

function inferForms(ch) {
  const pool = buildCandidatePool(ch);
  const simplified = candidates([
    ...convertManyWith('t2s', ch),
    ...convertManyWith('tw2s', ch),
    ...convertManyWith('hk2s', ch),
    ...convertManyWith('jp2t', ch).flatMap((value) => convertManyWith('t2s', value)),
    ...pool.flatMap((value) => convertManyWith('t2s', value)),
    ...pool.flatMap((value) => convertManyWith('tw2s', value)),
    ...pool.flatMap((value) => convertManyWith('hk2s', value)),
    ...pool.flatMap((value) => (
      convertManyWith('jp2t', value).flatMap((candidate) => convertManyWith('t2s', candidate))
    )),
  ], ch);

  const baseTraditional = candidates([
    ...simplified.flatMap((value) => convertManyWith('s2t', value)),
    ...convertManyWith('s2t', ch),
    ...pool.flatMap((value) => convertManyWith('s2t', value)),
  ], ch);

  return {
    simplified,
    traditional: {
      jp: candidates([
        ...simplified.flatMap((value) => (
          convertManyWith('s2t', value).flatMap((candidate) => convertManyWith('t2jp', candidate))
        )),
        ...baseTraditional.flatMap((value) => convertManyWith('t2jp', value)),
        ...convertManyWith('t2jp', ch),
        ...pool.flatMap((value) => convertManyWith('t2jp', value)),
      ], baseTraditional[0] || ch),
      hk: candidates([
        ...simplified.flatMap((value) => convertManyWith('s2hk', value)),
        ...baseTraditional.flatMap((value) => convertManyWith('s2hk', value)),
        ...convertManyWith('s2hk', ch),
        ...pool.flatMap((value) => convertManyWith('s2hk', value)),
      ], baseTraditional[0] || ch),
      tw: candidates([
        ...simplified.flatMap((value) => convertManyWith('s2tw', value)),
        ...baseTraditional.flatMap((value) => convertManyWith('s2tw', value)),
        ...convertManyWith('s2tw', ch),
        ...pool.flatMap((value) => convertManyWith('s2tw', value)),
      ], baseTraditional[0] || ch),
      cn: baseTraditional,
    },
  };
}

function buildRows(ch) {
  const { simplified, traditional } = inferForms(ch);
  const traditionalValues = unique([
    ...traditional.hk,
    ...traditional.tw,
    ...traditional.cn,
  ]);
  const japaneseValues = traditional.jp;
  const rowMap = new Map();

  function addValues(group, region, values) {
    for (const value of unique(values)) {
      if (!rowMap.has(value)) {
        rowMap.set(value, { groups: [], scripts: new Set() });
      }
      const row = rowMap.get(value);
      row.groups.push(group);
      row.scripts.add(region === 'jp' ? 'jp' : 'zh');
    }
  }

  addValues('簡體', 'cn', simplified);
  addValues('繁體', 'hk', traditional.hk);
  addValues('繁體', 'tw', traditional.tw);
  addValues('繁體', 'cn', traditionalValues);
  addValues('日文', 'jp', japaneseValues);

  const rows = [...rowMap].map(([value, row]) => ({
    group: unique(row.groups).join(' / '),
    scripts: [...row.scripts],
    value,
  }));

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
  if (column.region === 'jp') return row.scripts.includes('jp');
  return row.scripts.includes('zh');
}

function renderUnicodeButton(value) {
  const codePoint = codePointLabel(value);
  return `
    <button class="unicode-copy" type="button" data-copy="${escapeHtml(codePoint)}" title="複製 ${escapeHtml(codePoint)}">
      ${escapeHtml(codePoint)}
    </button>
  `;
}

function renderGlyphTable(ch) {
  const family = familySelect.value;
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
      <td class="character-cell">${escapeHtml(row.value)}</td>
      <td>${renderUnicodeButton(row.value)}</td>
      ${FONT_COLUMNS.map((column) => `
        <td>${shouldRenderInColumn(row, column) ? renderGlyph(row.value, family, column) : renderUnavailable()}</td>
      `).join('')}
    `;
    glyphBody.appendChild(tr);
    previousGroup = row.group;
  }
}

function render() {
  const ch = firstCodePoint(input.value);
  if (!ch) return;
  renderGlyphTable(ch);
}

renderButton.addEventListener('click', render);
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

initConverters();
initDictionaries()
  .then((loaded) => {
    mappingStatus.textContent = `opencc-js + OpenCC 字表 loaded (${loaded.join(', ')}).`;
  })
  .catch((error) => {
    console.warn('OpenCC dictionary load failed', error);
    mappingStatus.textContent = 'opencc-js loaded. OpenCC 字表未載入，使用單值轉換。';
  })
  .finally(render);
