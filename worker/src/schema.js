// The JSON schema Claude's answer must match: one recipe in the shape
// docs/recipe-format.md describes. Structured outputs enforce it, so the
// reply always parses and has every required field. Claude limits how big a
// schema can get, so it's kept plain: lists are required (empty when unused),
// units are free text, and tidy() checks and reshapes the details.

const str = { type: 'string' };
const num = { type: 'number' };
const nullable = (t) => ({ anyOf: [t, { type: 'null' }] });

const time = {
  type: 'object',
  properties: { text: str, minutes: nullable({ type: 'integer' }) },
  required: ['text', 'minutes'],
  additionalProperties: false,
};

const ingredient = {
  type: 'object',
  properties: {
    id: str,
    raw: str,
    quantity: num,
    quantityMax: num,
    unit: str,
    altMeasure: str,
    size: str,
    item: str,
    preparation: str,
    note: str,
    optional: { type: 'boolean' },
  },
  required: ['id', 'raw', 'item'],
  additionalProperties: false,
};

const step = {
  type: 'object',
  properties: {
    id: str,
    number: { type: 'integer' },
    text: str,
    timers: {
      type: 'array',
      items: {
        type: 'object',
        properties: { label: str, minSeconds: { type: 'integer' }, maxSeconds: { type: 'integer' } },
        required: ['label', 'minSeconds', 'maxSeconds'],
        additionalProperties: false,
      },
    },
    temperatures: {
      type: 'array',
      items: {
        type: 'object',
        properties: { value: num, unit: { type: 'string', enum: ['F', 'C'] } },
        required: ['value', 'unit'],
        additionalProperties: false,
      },
    },
    ingredientRefs: { type: 'array', items: str },
  },
  required: ['id', 'number', 'text', 'timers', 'temperatures', 'ingredientRefs'],
  additionalProperties: false,
};

const group = (items) => ({
  type: 'object',
  properties: { name: nullable(str), [items[0]]: { type: 'array', items: items[1] } },
  required: ['name', items[0]],
  additionalProperties: false,
});

export function recipeSchema(categories) {
  return {
    type: 'object',
    properties: {
      recipe: {
        type: 'object',
        properties: {
          id: str,
          title: str,
          category: { type: 'string', enum: categories },
          type: { type: 'string', enum: ['recipe', 'notes'] },
          source: str,
          yield: str,
          // The other parts of times (prep, bake…) as a list; tidy() turns
          // them back into the times object.
          totalTime: time,
          timeParts: {
            type: 'array',
            items: {
              type: 'object',
              properties: { part: str, ...time.properties },
              required: ['part', 'text', 'minutes'],
              additionalProperties: false,
            },
          },
          tags: { type: 'array', items: str },
          equipment: { type: 'array', items: str },
          ingredientGroups: { type: 'array', items: group(['items', ingredient]) },
          stepGroups: { type: 'array', items: group(['steps', step]) },
          notes: { type: 'array', items: str },
          methodSource: { type: 'string', enum: ['suggested', 'own'] },
          status: { type: 'string', enum: ['complete', 'partial', 'missingSteps', 'notes'] },
        },
        required: ['id', 'title', 'category', 'type', 'totalTime', 'timeParts', 'tags', 'equipment', 'ingredientGroups', 'stepGroups', 'notes', 'status'],
        additionalProperties: false,
      },
      // Things the cook should check before saving: a missing amount, a
      // guessed time, a step that was cut off.
      warnings: { type: 'array', items: str },
    },
    required: ['recipe', 'warnings'],
    additionalProperties: false,
  };
}
