// Shared safety-vocabulary scrub for vision-LLM outputs that feed a
// downstream STRICT-moderation image generator (OpenAI images API with
// moderation:"low" still hard-blocks on aesthetic/suggestive framing of
// people). Any prompt text a vision model writes about a person — for i2i
// resize facts (extract-master), or for a banner→landing character/scene
// prompt (analyze-banner-for-landing) — must be scrubbed before it reaches
// an image-gen call, or the whole pipeline 400s on "safety_violations".
//
// Belt-and-suspenders: the system prompt ALSO instructs the model to avoid
// these words, but models slip occasionally — this regex is the hard
// backstop applied to every returned field before it's ever used.
export const FORBIDDEN_VOCAB_PATTERN =
  /\b(attractive|beautiful|pretty|gorgeous|stunning|lovely|stylish|glamorous|glamour|elegant|sophisticated|chic|sultry|captivating|alluring|seductive|sexy|sensual|sensuous|flirty|playful|mysterious|dreamy|intimate|romantic|enchanting|smouldering|smoldering|soulful|piercing|confident|intense|fitted|form-fitting|body-hugging|tight|revealing|plunging|low-cut|daring|fierce|slim|slender|curvy|curves|curvaceous|figure|silhouette|posture|contoured|toned|glistening|dewy|wet-look|close-up|beauty\sshot|lifestyle\sshot|posing|posed|leaning|arching|draped)\b/gi;

/** Strip forbidden aesthetic/suggestive vocabulary from a vision-LLM string
 *  field, collapsing the whitespace left behind. Words are REMOVED, not
 *  substituted, so the surrounding factual nouns stay intact. */
export function sanitizeVisionText(s: string): string {
  return s
    .replace(FORBIDDEN_VOCAB_PATTERN, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s,/g, ",")
    .trim();
}

// The full system-prompt fragment (shared verbatim across vision-extraction
// endpoints) explaining the vocabulary rule to the model up front — reduces
// how often the regex backstop above actually has to fire.
export const VISION_VOCAB_RULE = [
  "===== CRITICAL VOCABULARY RULE (READ BEFORE WRITING ANYTHING) =====",
  "Your JSON output is fed directly into a downstream image generator",
  "with a STRICT content-safety classifier. Any aesthetic, suggestive,",
  "fashion-magazine or beauty-industry vocabulary will get the whole",
  "pipeline blocked. Write like a technical product datasheet, NOT like",
  "a fashion editorial.",
  "",
  "FORBIDDEN WORDS — never use any of these or their synonyms:",
  "  attractive, beautiful, pretty, gorgeous, stunning, lovely,",
  "  stylish, glamorous, glamour, elegant, sophisticated, chic,",
  "  sultry, captivating, alluring, seductive, sexy, sensual, sensuous,",
  "  flirty, playful, mysterious, dreamy, intimate, romantic, enchanting,",
  "  confident, intense, piercing, smouldering, smouldering, soulful,",
  "  fitted, form-fitting, body-hugging, tight, revealing, plunging,",
  "  low-cut, daring, bold, fierce, slim, slender, curvy, curves, curvaceous,",
  "  figure, silhouette, posture, contoured, athletic-build, toned,",
  "  close-up, body shot, torso shot, beauty shot, lifestyle shot,",
  "  glistening, glowing skin, flawless skin, dewy, wet-look,",
  "  pose, posing, posed, leaning, arching, draped",
  "",
  "Use neutral product-datasheet phrasing. Examples:",
  '  ✓ "person: red-haired, red-and-black racing suit, holding trophy"',
  '  ✗ "person: confident young woman with captivating smile in fitted racing suit"',
].join("\n");
