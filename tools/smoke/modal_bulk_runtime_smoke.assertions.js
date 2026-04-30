function assertParserCases(parserCases) {
  if (parserCases.singleLineBookmark.title !== 'Cultivator Against Hero Society') {
    throw new Error(`Single-line smart extract title promotion failed: ${JSON.stringify(parserCases.singleLineBookmark)}`);
  }
  if (!/(Cultivator%20Against%20Hero%20Society|cultivator\+against\+hero\+society)/i.test(parserCases.singleLineBookmark.url)) {
    throw new Error(`Single-line smart extract URL did not follow the promoted title: ${JSON.stringify(parserCases.singleLineBookmark)}`);
  }
  if (parserCases.singleLineBookmark.notes) {
    throw new Error(`Single-line smart extract should not leave the promoted title in notes: ${JSON.stringify(parserCases.singleLineBookmark)}`);
  }
  if (parserCases.titleListDetection.structured || parserCases.titleListDetection.singleEntry) {
    throw new Error(`Title-list smart extract should stay line-per-bookmark, got ${JSON.stringify(parserCases.titleListDetection)}`);
  }
  if (parserCases.punctuatedTitleListDetection.structured || parserCases.punctuatedTitleListDetection.singleEntry) {
    throw new Error(`Punctuated title-list smart extract should stay line-per-bookmark, got ${JSON.stringify(parserCases.punctuatedTitleListDetection)}`);
  }
  if (!parserCases.inlineUrlTitleDetection.structured || !parserCases.inlineUrlTitleDetection.singleEntry) {
    throw new Error(`Inline URL+title single-entry file should be detected for Smart Extract, got ${JSON.stringify(parserCases.inlineUrlTitleDetection)}`);
  }
  if (!parserCases.soloLevelingDetection.structured) {
    throw new Error(`Solo Leveling note file should be detected as structured Smart Extract, got ${JSON.stringify(parserCases.soloLevelingDetection)}`);
  }
  if (!parserCases.onePieceDetection.structured) {
    throw new Error(`One Piece volume note file should be detected as structured Smart Extract, got ${JSON.stringify(parserCases.onePieceDetection)}`);
  }
  if (parserCases.inlineUrlTitleBookmark.title !== 'Different Kings Chapter 1 & 2 [ ENGLISH ] - YouTube') {
    throw new Error(`Inline URL+title structured file title mismatch: ${JSON.stringify(parserCases.inlineUrlTitleBookmark)}`);
  }
  if (!/^https:\/\/(?:www\.)?youtube\.com\/watch\?v=1plftgkcaws$/i.test(parserCases.inlineUrlTitleBookmark.url)) {
    throw new Error(`Inline URL+title structured file URL mismatch: ${JSON.stringify(parserCases.inlineUrlTitleBookmark)}`);
  }
  if (parserCases.inlineUrlTitleBookmark.notes) {
    throw new Error(`Inline URL+title structured file should not spill parsed data into notes: ${JSON.stringify(parserCases.inlineUrlTitleBookmark)}`);
  }
  if (parserCases.ledgerBookmark.title !== 'Harry Potter') {
    throw new Error(`Progress-ledger structured file regressed: ${JSON.stringify(parserCases.ledgerBookmark)}`);
  }
  if (!/Movie 8: Fin/.test(parserCases.ledgerBookmark.notes)) {
    throw new Error(`Progress-ledger structured file lost note lines: ${JSON.stringify(parserCases.ledgerBookmark)}`);
  }
  if (parserCases.soloLevelingBookmark.title !== 'Solo Leveling') {
    throw new Error(`Solo Leveling structured file title mismatch: ${JSON.stringify(parserCases.soloLevelingBookmark)}`);
  }
  if (!/Officially ened at Ch: 184/.test(parserCases.soloLevelingBookmark.notes) || !/Then New Begining after End: 200/.test(parserCases.soloLevelingBookmark.notes)) {
    throw new Error(`Solo Leveling structured file lost note lines: ${JSON.stringify(parserCases.soloLevelingBookmark)}`);
  }
  if (parserCases.soloLevelingPromotion.chapter !== 184) {
    throw new Error(`Solo Leveling structured file should promote chapter 184, got ${JSON.stringify(parserCases.soloLevelingPromotion)}`);
  }
  if (parserCases.onePieceBookmark.title !== 'One Piece') {
    throw new Error(`One Piece volume note file should stay filename-driven, got ${JSON.stringify(parserCases.onePieceBookmark)}`);
  }
  if (parserCases.onePieceBookmark.notes !== 'Vol: 1') {
    throw new Error(`One Piece volume note file should keep volume text in notes, got ${JSON.stringify(parserCases.onePieceBookmark)}`);
  }
  if (parserCases.onePiecePromotion.summary !== 'Vol: 1') {
    throw new Error(`One Piece volume note file should promote notes into library summary, got ${JSON.stringify(parserCases.onePiecePromotion)}`);
  }
}

module.exports = { assertParserCases };
