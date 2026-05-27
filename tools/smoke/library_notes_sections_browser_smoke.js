const path = require('path');
const { chromium } = require('playwright');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  let browser = null;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent(`
      <details id="libNotesShell"><summary><span id="libNotesSummary"></span></summary>
        <details><summary><span id="libHumanNotesSummary"></span></summary><textarea id="libHumanNotes"></textarea></details>
        <details id="libMergeNotesDisclosure"><summary><span id="libMergedNotesSummary"></span></summary><div id="libMergedNotesView"></div></details>
        <details><summary><span id="libRawNotesSummary"></span></summary><textarea id="libSummary"></textarea></details>
      </details>
      <details id="bookmarkFocusNotesShell"><summary><span id="bookmarkFocusNotesSummary"></span></summary>
        <details><summary><span id="bookmarkFocusHumanNotesSummary"></span></summary><textarea id="bookmarkFocusHumanNotes"></textarea></details>
        <details id="bookmarkFocusMergeNotesDisclosure"><summary><span id="bookmarkFocusMergedNotesSummary"></span></summary><div id="bookmarkFocusMergeNotesView"></div></details>
        <details><summary><span id="bookmarkFocusRawNotesSummary"></span></summary><textarea id="bookmarkFocusSummary"></textarea></details>
      </details>
    `);
    await page.addScriptTag({ path: path.join(REPO_ROOT, 'js/modules/modals/logic/link-form.library.notes.js') });

    const result = await page.evaluate(() => {
      const mergeBlock = [
        'This is a test personal note.',
        '',
        '=== Bookmark Merge ===',
        'Merged At: 2026-05-26T12:00:00.000Z',
        'Reason: Duplicate sensor merge matched bookmarks by title or URL.',
        'Mode: notes-only',
        'Destination Kept: Target <https://example.com/TargetZ>',
        'Incoming Title: Source Name',
        'Incoming URL: https://example.com/SourceZ',
        'Incoming Bookmark Notes:',
        'source private notes'
      ].join('\n');

      function runProfile(rawId, humanId, mergeId, mergeDisclosureId, bindName) {
        const raw = document.getElementById(rawId);
        const human = document.getElementById(humanId);
        const merge = document.getElementById(mergeId);
        const mergeDisclosure = document.getElementById(mergeDisclosureId);
        raw.value = mergeBlock;
        window.EveLibraryNotesSections.bindProfile(bindName);
        if (!human.value.includes('This is a test personal note.')) throw new Error(bindName + ': personal note was not extracted');
        if (human.value.includes('Bookmark Merge')) throw new Error(bindName + ': merge block leaked into personal notes');
        if (!merge.textContent.includes('Source Name')) throw new Error(bindName + ': merge history was not rendered');
        if (mergeDisclosure.style.display === 'none') throw new Error(bindName + ': merge section hidden despite merge history');
        if (mergeDisclosure.open) throw new Error(bindName + ': merge section should default collapsed');

        let bubbledSpace = 0;
        document.addEventListener('keydown', () => { bubbledSpace += 1; }, { once: true });
        human.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true }));
        if (bubbledSpace !== 0) throw new Error(bindName + ': spacebar keydown leaked to document shortcuts');

        human.value = 'This is a test with spaces';
        human.dispatchEvent(new Event('input', { bubbles: true }));
        if (!raw.value.includes('This is a test with spaces')) throw new Error(bindName + ': human notes with spaces did not sync to raw notes');
        if (!raw.value.includes('=== Bookmark Merge ===')) throw new Error(bindName + ': merge block was lost while editing human notes');

        raw.value = 'Plain user note only';
        raw.dispatchEvent(new Event('input', { bubbles: true }));
        if (mergeDisclosure.style.display !== 'none') throw new Error(bindName + ': empty merge section should be hidden');
        return {
          human: human.value,
          mergeHidden: mergeDisclosure.style.display === 'none'
        };
      }

      return {
        library: runProfile('libSummary', 'libHumanNotes', 'libMergedNotesView', 'libMergeNotesDisclosure', 'library'),
        focus: runProfile('bookmarkFocusSummary', 'bookmarkFocusHumanNotes', 'bookmarkFocusMergeNotesView', 'bookmarkFocusMergeNotesDisclosure', 'focus')
      };
    });

    console.log(`LIBRARY_NOTES_SECTIONS_BROWSER_SMOKE_OK ${JSON.stringify(result)}`);
  } catch (error) {
    console.error(error && error.stack ? error.stack : String(error));
    process.exitCode = 1;
  } finally {
    if (browser) {
      try { await browser.close(); } catch (error) {}
    }
  }
}

main();
