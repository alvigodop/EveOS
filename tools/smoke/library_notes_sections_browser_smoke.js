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

    await page.evaluate((rawNotes) => {
      [
        ['libSummary', 'library'],
        ['bookmarkFocusSummary', 'focus']
      ].forEach(([rawId, bindName]) => {
        const raw = document.getElementById(rawId);
        raw.value = rawNotes;
        window.EveLibraryNotesSections.bindProfile(bindName);
      });
      window.__notesSpaceKeyBubbles = 0;
      document.addEventListener('keydown', (event) => {
        if (event.key === ' ') window.__notesSpaceKeyBubbles += 1;
      });
    }, mergeBlock);

    const profiles = [
      {
        name: 'library',
        raw: '#libSummary',
        human: '#libHumanNotes',
        merge: '#libMergedNotesView',
        disclosure: '#libMergeNotesDisclosure'
      },
      {
        name: 'focus',
        raw: '#bookmarkFocusSummary',
        human: '#bookmarkFocusHumanNotes',
        merge: '#bookmarkFocusMergeNotesView',
        disclosure: '#bookmarkFocusMergeNotesDisclosure'
      }
    ];
    const result = {};
    for (const profile of profiles) {
      const initial = await page.evaluate((item) => ({
        human: document.querySelector(item.human)?.value || '',
        merge: document.querySelector(item.merge)?.textContent || '',
        mergeHidden: document.querySelector(item.disclosure)?.style.display === 'none',
        mergeOpen: !!document.querySelector(item.disclosure)?.open
      }), profile);
      assert(initial.human.includes('This is a test personal note.'), `${profile.name}: personal note was not extracted`);
      assert(!initial.human.includes('Bookmark Merge'), `${profile.name}: merge block leaked into personal notes`);
      assert(initial.merge.includes('Source Name'), `${profile.name}: merge history was not rendered`);
      assert(!initial.mergeHidden, `${profile.name}: merge section hidden despite merge history`);
      assert(!initial.mergeOpen, `${profile.name}: merge section should default collapsed`);

      const human = page.locator(profile.human);
      await human.evaluate((node) => {
        let disclosure = node.closest('details');
        while (disclosure) {
          disclosure.open = true;
          disclosure = disclosure.parentElement?.closest('details') || null;
        }
      });
      await human.click();
      await human.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
      await human.type('This is a test with spaces', { delay: 5 });
      const typed = await page.evaluate((item) => ({
        human: document.querySelector(item.human)?.value || '',
        raw: document.querySelector(item.raw)?.value || '',
        bubbledSpaces: window.__notesSpaceKeyBubbles
      }), profile);
      assert(typed.human === 'This is a test with spaces', `${profile.name}: real spacebar typing was rewritten`);
      assert(typed.raw.includes('This is a test with spaces'), `${profile.name}: spaced personal notes did not sync to raw notes`);
      assert(typed.raw.includes('=== Bookmark Merge ==='), `${profile.name}: merge block was lost while editing personal notes`);
      assert(typed.bubbledSpaces === 0, `${profile.name}: spacebar leaked to document shortcuts`);

      await page.evaluate((item) => {
        const raw = document.querySelector(item.raw);
        raw.value = 'Plain user note only';
        raw.dispatchEvent(new Event('input', { bubbles: true }));
      }, profile);
      const mergeHidden = await page.locator(profile.disclosure).evaluate((node) => node.style.display === 'none');
      assert(mergeHidden, `${profile.name}: empty merge section should be hidden`);
      result[profile.name] = { human: typed.human, mergeHidden };
    }

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
