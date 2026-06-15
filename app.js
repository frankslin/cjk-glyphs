const FONT_COLUMNS = [
  { label: '香港', className: 'noto-hk', lang: 'zh-HK', region: 'hk' },
  { label: '台灣', className: 'noto-tc', lang: 'zh-TW', region: 'tw' },
  { label: '中國大陸', className: 'noto-sc', lang: 'zh-CN', region: 'cn' },
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

const DICTIONARY_SOURCES = {
  st: 'https://cdn.jsdelivr.net/gh/BYVoid/OpenCC@master/data/dictionary/STCharacters.txt',
  ts: 'https://cdn.jsdelivr.net/gh/BYVoid/OpenCC@master/data/dictionary/TSCharacters.txt',
  tw: 'https://cdn.jsdelivr.net/gh/BYVoid/OpenCC@master/data/dictionary/TWVariants.txt',
  hk: 'https://cdn.jsdelivr.net/gh/BYVoid/OpenCC@master/data/dictionary/HKVariants.txt',
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
    const [key, valuesText] = trimmed.split(/\t+/);
    if (!key || !valuesText) continue;
    dictionary.set(key, valuesText.split(/\s+/).filter(Boolean));
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
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return [name, parseDictionary(await response.text())];
  }));

  for (const [name, dictionary] of entries) {
    dictionaryMap.set(name, dictionary);
    reverseDictionaryMap.set(name, reverseDictionary(dictionary));
  }
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
    t2s: () => valuesFromDictionary('ts', text),
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
  }[name]?.() || [];

  if (dictionaryValues.length) return dictionaryValues;
  return unique([convertWith(name, text)]);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function buildCandidatePool(ch) {
  let pool = new Set([ch]);
  for (let i = 0; i < 3; i += 1) {
    const nextPool = new Set(pool);
    for (const value of pool) {
      for (const name of CONVERTER_NAMES) {
        for (const converted of convertManyWith(name, value)) {
          nextPool.add(converted);
        }
      }
    }
    if (nextPool.size === pool.size) break;
    pool = nextPool;
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
    ...pool.flatMap((value) => convertManyWith('t2s', value)),
    ...pool.flatMap((value) => convertManyWith('tw2s', value)),
    ...pool.flatMap((value) => convertManyWith('hk2s', value)),
  ], ch);

  const baseTraditional = candidates([
    ...simplified.flatMap((value) => convertManyWith('s2t', value)),
    ...convertManyWith('s2t', ch),
    ...pool.flatMap((value) => convertManyWith('s2t', value)),
  ], ch);

  return {
    simplified,
    traditional: {
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
  const simplifiedKey = simplified.join('');
  const hasTraditionalDifference = Object.values(traditional).some((values) => values.join('') !== simplifiedKey);

  if (!hasTraditionalDifference) {
    return [
      {
        label: '通用',
        cells: { hk: simplified, tw: simplified, cn: simplified },
      },
    ];
  }

  return [
    {
      label: '簡體',
      cells: { hk: simplified, tw: simplified, cn: simplified },
    },
    {
      label: '繁體',
      cells: traditional,
    },
  ];
}

function codePointLabel(ch) {
  return `U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
}

function renderCell(values, family, column) {
  return values.map((value) => {
    const codePoint = codePointLabel(value);
    return `
      <span class="glyph-option">
        <span class="glyph-sample ${family} ${column.className}" lang="${column.lang}">
          ${escapeHtml(value)}
        </span>
        <button class="unicode-copy" type="button" data-copy="${escapeHtml(codePoint)}" title="複製 ${escapeHtml(codePoint)}">
          ${escapeHtml(codePoint)}
        </button>
      </span>
    `;
  }).join('');
}

function renderGlyphTable(ch) {
  const family = familySelect.value;
  const rows = buildRows(ch);

  glyphHead.innerHTML = `
    <tr>
      <th scope="col">字形</th>
      ${FONT_COLUMNS.map((column) => `<th scope="col">${escapeHtml(column.label)}</th>`).join('')}
    </tr>
  `;

  glyphBody.innerHTML = '';
  for (const row of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <th scope="row">${escapeHtml(row.label)}</th>
      ${FONT_COLUMNS.map((column) => `
        <td>
          <div class="glyph-options">
            ${renderCell(row.cells[column.region], family, column)}
          </div>
        </td>
      `).join('')}
    `;
    glyphBody.appendChild(tr);
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
  .then(() => {
    mappingStatus.textContent = 'opencc-js + OpenCC 字表 loaded.';
  })
  .catch((error) => {
    console.warn('OpenCC dictionary load failed', error);
    mappingStatus.textContent = 'opencc-js loaded. OpenCC 字表未載入，使用單值轉換。';
  })
  .finally(render);
