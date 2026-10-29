import Anthropic from '@anthropic-ai/sdk';
import FORMAT from '../../docs/recipe-format.md';
import { recipeSchema } from './schema.js';

// The house rules for converting a recipe, on top of the format doc.
const RULES = `You convert one recipe into Mise's recipe format. The format document is below.

Faithfulness
- Keep the author's quantities, temperatures, times and method. Never invent an amount. Lightly tighten wording so each step reads well on one screen, but don't change what it says.
- If something is missing or cut off (an amount, a step, a time), keep what's there, set status to "partial" or "missingSteps", and say what's missing in warnings. If there's no method at all, you may write one, but then set methodSource to "suggested" and status "missingSteps".
- Put the credit in source: the author and site, like "Maurizio Leo, The Perfect Loaf (theperfectloaf.com)", or "@handle on Instagram" for a post or screenshot that shows one.
- Put tips, make-ahead and storage notes in notes. Leave out life stories, ads and reviews.

Fields
- id: a kebab-case slug of the title. It must not be one of the existing ids listed below.
- category: pick the best fit from the list. If none fits well, pick the closest and say so in warnings.
- type: "recipe", or "notes" (with status "notes") for a reference page with no steps to cook along with.
- tags: each tag becomes a filter button, so use few. Pick from the existing tags listed below; add a new one only for a real way to filter, like a cooking method, never for the category or the dish ("dessert", "cookies", "baking"). Lowercase. Use "sourdough" for anything with a starter, levain or discard. Use "vegan", "vegetarian" or "gluten-free" only when the source says so. An empty list is fine.
- Times: totalTime is the format doc's times.total; follow its Times section. Prefer the source's own times; estimate the total from the steps if the source has none, and mention the estimate in warnings. timeParts holds the other times, each with part set to prep, cook, bake, proof, rest or active.
- Omit optional fields that don't apply instead of sending empty strings. Send an empty list for tags, equipment, notes, timers, temperatures or ingredientRefs when there are none.

Ingredients
- One group with name null for a plain list; named groups ("Crust", "Filling") when the source has them.
- id is i{group}-{index}, both starting at 1: i1-1, i1-2, i2-1.
- raw is the line exactly as written. item is the ingredient name.
- quantity is a decimal (⅓ is 0.3333). quantityMax is the top of a range. A count ("2 eggs") has no unit.
- unit is one of: cup tbsp tsp g kg ml l oz lb clove can stick stalk package packet pint piece slice inch. For anything else leave it out and keep the wording in raw. size is small, medium or large.
- preparation is what follows the first comma. note is a trailing parenthetical. altMeasure is a second measurement like "240 g".

Steps
- number runs 1 to n across all groups; id is s{number}. Name step groups ("Dough", "Bake") when the recipe has phases, otherwise one group with name null.
- Keep each step to about one screen: split a long paragraph into 3 to 5 steps.
- timers: one per duration in the text. label must be the exact words from the step text ("12–18 minutes"). A range gives minSeconds and maxSeconds; a single time gives the same number for both.
- temperatures: when both °C and °F are given, store the °F value.
- ingredientRefs: the ingredient ids the step actually uses, chosen by reading the step. Prefer the right group (the filling's butter, not the crust's).

warnings: short notes for the cook to check before saving. An empty list when nothing needs checking.`;

export async function convert(env, { source, categories, existingIds, existingTags }) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const as = { 'json-ld': 'the page\'s schema.org JSON-LD', text: 'the page\'s text' };
  let content;
  if (source.kind === 'photo') {
    content = [
      ...source.images.map((img) => ({ type: 'image', source: { type: 'base64', media_type: img.type, data: img.data } })),
      { type: 'text', text: `Here ${source.images.length > 1 ? `are ${source.images.length} photos` : 'is a photo'} of the recipe, taken or screenshotted by the cook. Read every word, handwriting too. Ignore app buttons, usernames and like counts. If the photos show only a finished dish with no recipe, say so in warnings and set status to "missingSteps".` },
    ];
  } else if (source.kind === 'edit') {
    content = `Here is a recipe already in Mise, as JSON:\n\n<recipe>\n${JSON.stringify(source.recipe, null, 2)}\n</recipe>\n\nThe cook asks for this change:\n\n<change>\n${source.request}\n</change>\n\nSend back the whole recipe with the change made. Change only what the request needs and keep everything else as it is, word for word. Keep the id. For any step you add, remove or reword, update its timers, temperatures and ingredientRefs, and renumber the steps. The times go in totalTime and timeParts as usual. In warnings, say in a few words what you changed; if the change can't be made or isn't clear, send the recipe back unchanged and say why.`;
  } else if (source.kind === 'paste') {
    content = `Here is the recipe, pasted in by the cook:\n\n<recipe>\n${source.content}\n</recipe>`;
  } else {
    content = `Here is the recipe from ${source.url}${source.title ? ` (page title: "${source.title}")` : ''}, as ${as[source.kind]}:\n\n<recipe>\n${source.content}\n</recipe>`;
  }

  const stream = client.messages.stream({
    model: env.MODEL,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema: recipeSchema(categories) },
    },
    system: [
      // The rules and format doc are the same every time, so cache them.
      { type: 'text', text: `${RULES}\n\n<format>\n${FORMAT}\n</format>`, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: `Categories, in order: ${categories.join(' | ')}\nExisting tags: ${existingTags.join(', ')}\nExisting ids: ${existingIds.join(', ')}` },
    ],
    messages: [{ role: 'user', content }],
  });
  let message;
  try {
    message = await stream.finalMessage();
  } catch (err) {
    console.error('Claude', err.status, err.message);
    throw new Error(err.status === 429 || err.status === 529
      ? 'Claude is busy right now. Try again in a minute.'
      : 'Claude couldn’t convert this recipe. Try again, or paste it in.');
  }

  if (message.stop_reason === 'refusal') throw new Error('Claude declined to convert this recipe');
  if (message.stop_reason === 'max_tokens') throw new Error('That recipe is too long to convert in one go');
  const text = message.content.find((b) => b.type === 'text')?.text;
  if (!text) throw new Error('Claude sent back no recipe');
  return { ...JSON.parse(text), usage: message.usage };
}
