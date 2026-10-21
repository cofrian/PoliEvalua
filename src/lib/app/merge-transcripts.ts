// Une las transcripciones de segmentos consecutivos. Los segmentos se graban
// con ~2 s de solape, así que el final de uno y el principio del siguiente
// repiten algunas palabras: se busca la coincidencia más larga y se elimina.

const MAX_OVERLAP_WORDS = 20;
const MIN_OVERLAP_WORDS = 2;
const MIN_SINGLE_WORD_LENGTH = 5;

function normalize(word: string) {
  return word
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

/** Número de palabras iniciales de `next` que repiten el final de `previous`. */
export function overlapLength(previous: string[], next: string[]) {
  const tail = previous.slice(-MAX_OVERLAP_WORDS).map(normalize);
  const head = next.slice(0, MAX_OVERLAP_WORDS).map(normalize);
  for (let size = Math.min(tail.length, head.length); size >= MIN_OVERLAP_WORDS; size -= 1) {
    const tailPart = tail.slice(tail.length - size);
    const headPart = head.slice(0, size);
    if (tailPart.every((word, index) => word !== "" && word === headPart[index])) {
      return size;
    }
  }
  // Una sola palabra repetida solo cuenta si es larga: "de de" o "la la"
  // pueden ser repeticiones reales del orador.
  const last = tail.at(-1);
  if (last && last.length >= MIN_SINGLE_WORD_LENGTH && last === head[0]) return 1;
  return 0;
}

export function mergeTranscripts(parts: string[]) {
  const words: string[] = [];
  for (const part of parts) {
    const next = part.trim().split(/\s+/).filter(Boolean);
    if (next.length === 0) continue;
    words.push(...next.slice(overlapLength(words, next)));
  }
  return words.join(" ");
}
