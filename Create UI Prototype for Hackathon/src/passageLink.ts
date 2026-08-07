export interface PassageMatch {
  start: number
  end: number
  score: number
  exact: boolean
}

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'be', 'but', 'by', 'for', 'from', 'had', 'has',
  'he', 'her', 'his', 'in', 'into', 'is', 'it', 'its', 'not', 'of', 'on', 'or',
  'she', 'that', 'the', 'their', 'then', 'there', 'they', 'this', 'to', 'was',
  'were', 'which', 'with',
])

function evidenceTokens(value: string): string[] {
  const tokens = value.toLowerCase().match(/[a-z0-9]+/g) ?? []
  const significant = tokens.filter(token => token.length > 2 && !STOP_WORDS.has(token))
  return significant.length >= 3 ? significant : tokens
}

function sentenceRanges(content: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = []
  const matcher = /[^.!?]+(?:[.!?]+["'’”)]*)?|[^.!?]+$/g
  for (const match of content.matchAll(matcher)) {
    if (match.index === undefined) continue
    const leading = match[0].match(/^\s*/)?.[0].length ?? 0
    const trailing = match[0].match(/\s*$/)?.[0].length ?? 0
    const start = match.index + leading
    const end = match.index + match[0].length - trailing
    if (end > start) ranges.push({ start, end })
  }
  return ranges
}

function similarity(candidate: string, evidence: string): number {
  const evidenceSet = new Set(evidenceTokens(evidence))
  const candidateSet = new Set(evidenceTokens(candidate))
  if (!evidenceSet.size || !candidateSet.size) return 0
  let overlap = 0
  for (const token of evidenceSet) if (candidateSet.has(token)) overlap += 1
  const coverage = overlap / evidenceSet.size
  const precision = overlap / candidateSet.size
  return coverage * 0.78 + precision * 0.22
}

/**
 * Resolves Member 1 evidence to the original passage. Character offsets win;
 * exact quotes come next; shortened extraction summaries fall back to a
 * bounded one/two-sentence token match.
 */
export function findEvidencePassage(
  content: string,
  evidence: string,
  startChar?: number,
  endChar?: number,
): PassageMatch | null {
  if (
    Number.isInteger(startChar) && Number.isInteger(endChar) &&
    startChar! >= 0 && endChar! > startChar! && endChar! <= content.length
  ) {
    return { start: startChar!, end: endChar!, score: 1, exact: true }
  }

  const trimmedEvidence = evidence.trim()
  if (!trimmedEvidence) return null
  const exactStart = content.indexOf(trimmedEvidence)
  if (exactStart >= 0) {
    return {
      start: exactStart,
      end: exactStart + trimmedEvidence.length,
      score: 1,
      exact: true,
    }
  }

  const ranges = sentenceRanges(content)
  let best: PassageMatch | null = null
  for (let index = 0; index < ranges.length; index += 1) {
    for (const span of [1, 2]) {
      const last = ranges[index + span - 1]
      if (!last) continue
      const start = ranges[index]!.start
      const end = last.end
      const score = similarity(content.slice(start, end), trimmedEvidence)
      if (!best || score > best.score) best = { start, end, score, exact: false }
    }
  }
  return best && best.score >= 0.42 ? best : null
}
