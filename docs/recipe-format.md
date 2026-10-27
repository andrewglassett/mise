# Recipe file format

Mise reads one JSON file that holds every recipe. [`example-recipes.json`](example-recipes.json) is a complete two-recipe example to copy from.

Only a few fields are required. The rest make cook mode better: timers, preheat callouts, scaling and the "You'll need" list on each step.

## Top level

```json
{
  "schemaVersion": 1,
  "categories": ["Breakfast", "Mains", "Desserts"],
  "recipes": [ ... ]
}
```

| Field | Required | Notes |
|---|---|---|
| `schemaVersion` | yes | Always `1` for now. |
| `categories` | no | The category list, in the order the app shows it. Defaults to the categories the recipes use. |
| `recipes` | yes | Array of recipes. |

## Recipe

| Field | Required | Notes |
|---|---|---|
| `id` | yes | Unique, URL-safe slug, like `buttermilk-pancakes`. It appears in links, so don't change it once set. |
| `title` | yes | |
| `category` | yes | One of `categories`. |
| `tags` | no | Free-form labels, like `vegan`, `sourdough` or `weeknight`. Each one becomes a filter chip. |
| `source` | no | Author, website or "Grandma's card". |
| `yield` | no | Free text: "Serves 4", "Makes 12". |
| `times` | no | Keys like `prep`, `cook`, `bake`, `proof`, `rest`, `total`. Each is `{ "text": "1 hr 20 min", "minutes": 80 }`. The time filter uses `total`, or adds up the others when there's no `total`. |
| `equipment` | no | List of strings. |
| `ingredientGroups` | yes | See below. Use `[]` if there are none. |
| `stepGroups` | yes | See below. Use `[]` for a recipe with no steps. |
| `notes` | no | Tips, storage, make-ahead. Shown on the ingredients screen and at the end. |
| `type` | no | `"recipe"` (default) or `"notes"`. Notes pages are shown read-only, with no cook mode. |
| `cookMode` | no | `"steps"` or `"list"`. Leave it out and the app decides: recipes with 3 or fewer steps and under 450 characters of instructions show the method as a list on the ingredients screen; longer ones get step-by-step cook mode. Set it only to override that choice. |
| `methodSource` | no | Set to `"suggested"` when the method isn't from the original recipe. The app shows an "Untested method" badge. |
| `nutrition` | no | Free text. |

## Ingredients

Ingredients come in groups. Use one group with `"name": null` for a plain list, or name the groups ("Crust", "Filling").

```json
{ "name": "Crust", "items": [ Ingredient, ... ] }
```

| Field | Required | Notes |
|---|---|---|
| `id` | yes | Unique within the recipe. The convention is `i{group}-{index}`, like `i2-3`. Steps refer to these. |
| `raw` | yes | The line as written: "2 cups (240 g) flour, sifted". The app shows this as-is at 1×. |
| `quantity` | no | A number: `0.5` for ½, `0.3333` for ⅓. Needed for scaling. |
| `quantityMax` | no | Upper end of a range ("1–2 Tbsp"). |
| `unit` | no | `cup`, `tbsp`, `tsp`, `g`, `kg`, `ml`, `oz`, `lb`, `clove`, `can`, `stick`… Leave it out for counts ("2 eggs"). |
| `size` | no | `large`, `medium`, `small`. |
| `item` | no | The ingredient name: "all-purpose flour". Also used by search. |
| `preparation` | no | What comes after the comma: "melted, cooled". |
| `note` | no | A trailing parenthetical: "packed", "or milk". |
| `altMeasure` | no | A second measurement, like `"240 g"`. |
| `optional` | no | `true` shows an "optional" label. |

When you scale a recipe, the app rebuilds each line from `quantity`, `unit`, `size`, `item`, `preparation`, `note` and `altMeasure`. A line without a `quantity` keeps its `raw` text.

## Steps

Steps also come in groups. Group names ("Batter", "Bake") show above the step as a phase. Number the steps straight through every group, `1` to `n`, so the app can say "Step 4 of 11".

```json
{ "name": "Bake", "steps": [ Step, ... ] }
```

| Field | Required | Notes |
|---|---|---|
| `id` | yes | Unique within the recipe, like `s4`. |
| `number` | yes | Runs 1…n across all groups. |
| `text` | yes | One screen's worth of instruction. Line breaks (`\n`) are kept. |
| `timers` | no | `[{ "label": "12–18 minutes", "minSeconds": 720, "maxSeconds": 1080 }]`. `label` must match the words in `text` exactly; that phrase becomes tappable. Use the same number for min and max when there's no range. |
| `temperatures` | no | `[{ "value": 350, "unit": "F" }]`. Shown as a badge on the step. An oven temperature (300°F or more, in a step that mentions the oven, baking, roasting or preheating) also becomes the "Preheat" callout. |
| `ingredientRefs` | no | Ingredient `id`s this step uses. They're listed beside the step as "You'll need". |

## Checking your file

Before you publish a new file:

- It must be valid JSON. Paste it into any JSON validator, or open it in a browser tab.
- Every `id` must be unique within its recipe, and every `ingredientRefs` entry must match an ingredient `id`.
- `number` must run 1, 2, 3… with no gaps across all step groups.

If the app can't read the file, it says "Couldn't load recipes" and gives the reason.
