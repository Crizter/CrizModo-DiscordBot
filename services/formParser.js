const TOTAL_QUESTIONS = 15;

// Matches a numbered marker at the start of a line, tolerant of markdown bold
// and either "1." or "1)" numbering — e.g. "1. answer", "**2)** answer".
const MARKER_REGEX = /(?:^|\n)[ \t]*\**[ \t]*(\d{1,2})[.)][ \t]*\**[ \t]*/g;

// Detects a Super Verification form paste by structure: the message must
// contain markers 1 through 15, in increasing order (extra/unrelated numbers
// elsewhere in the text are ignored). Returns the 15 answers split between
// consecutive markers.
export function parseSuperVerificationForm(rawContent) {
  if (!rawContent || typeof rawContent !== "string") {
    return { isForm: false, answers: null };
  }

  const markers = [];
  let match;
  MARKER_REGEX.lastIndex = 0;
  while ((match = MARKER_REGEX.exec(rawContent)) !== null) {
    markers.push({
      number: parseInt(match[1], 10),
      matchStart: match.index,
      contentStart: match.index + match[0].length,
    });
  }

  const selected = [];
  let expected = 1;
  for (const marker of markers) {
    if (marker.number === expected) {
      selected.push(marker);
      expected += 1;
      if (expected > TOTAL_QUESTIONS) break;
    }
  }

  if (selected.length !== TOTAL_QUESTIONS) {
    return { isForm: false, answers: null };
  }

  const answers = selected.map((marker, i) => {
    const end =
      i + 1 < selected.length ? selected[i + 1].matchStart : rawContent.length;
    return rawContent.slice(marker.contentStart, end).trim();
  });

  return { isForm: true, answers };
}
