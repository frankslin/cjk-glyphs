# 漢字字形對比 (CJK Glyph Comparison)

這個工具可以讓你輸入一個漢字，快速對比它在**簡中、香港、台灣、日本**不同地區字型中的寫法差異。同時，它也會自動幫你找出對應的簡體字、繁體字與日文漢字。

This tool lets you enter a Chinese character to quickly compare how it looks in **Simplified Chinese (SC), Hong Kong (HK), Taiwan (TC), and Japanese (JP)** fonts. It also automatically finds the corresponding Simplified, Traditional, and Japanese variant characters.

---

## 💡 功能特色 / Features

- **字形寫法對比 (Compare Glyphs)**：一次看清同一個字在不同地區（簡中、港、台、日）的細微筆畫差異，支援宋體/明體（Serif）與黑體（Sans）。
  See the subtle stroke differences of the same character across different regions (SC, HK, TC, JP) in both Serif and Sans styles.
- **自動推斷變體 (Find Variants)**：輸入一個字，自動找出相關的簡體、繁體與日文漢字。
  Enter one character to automatically find its related Simplified, Traditional, and Japanese Kanji variants.
- **快速複製碼點 (Easy Copy)**：點擊 Unicode 碼點（如 `U+91CC`）即可快速複製。
  Click the Unicode codepoint (e.g., `U+91CC`) to copy it instantly.
- **網址參數分享 (Shareable Links)**：支援使用 `?glyph=字` 網址參數，輸入字元時會同步更新網址，方便直接分享指定字元的對比結果。
  Supports query parameter `?glyph=char` to easily share the comparison link for a specific character, automatically syncing as you type.

---

## 🛠️ 技術棧 / Tech Stack

- **Frontend**: HTML5, Vanilla CSS, Vanilla JavaScript
- **Libraries & Data**: [OpenCC](https://github.com/BYVoid/OpenCC) (字表數據 / Dictionary data), [opencc-js](https://github.com/lucportas/opencc-js) (轉換套件 / Conversion engine)
- **Web Fonts**: [Google Fonts (Noto Sans & Noto Serif CJK)](https://fonts.google.com/)

---

## 🚀 如何使用 / How to Use

1. 下載或複製本專案。
   Download or clone this project.
2. 直接在瀏覽器中雙擊打開 `index.html` 即可開始使用！（需連接網路以載入字型與對照表）
   Double-click `index.html` to open and run it directly in your browser! (Internet connection required to load fonts and dictionaries)
