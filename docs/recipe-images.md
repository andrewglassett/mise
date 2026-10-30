# Recipe images

Recipe pictures are made with Figma AI in the **Mise recipe images** file
(`T5nqf9OyZJklNTV9WHHJxG`). Each category has its own page, and each recipe gets one
1600 × 1000 frame **named after the recipe's id** (for example `sourdough-baguette`), with
its full prompt written underneath. Exporting the frame gives `sourdough-baguette.jpg`, which
is how an image is matched to its recipe.

The app shows each image as a 16:10 card, a 2:1 banner and a small square, so keep the dish
near the middle with some room around it.

## Prompts

Every prompt is one sentence describing the dish, then a shared style. There are two styles.

### Overhead (the first set)

> **[Dish.]** Overhead food photograph, shot straight down, for a recipe app. Natural soft
> daylight from the upper left, gentle shadows. The dish sits in the centre of the frame with
> generous empty space on all sides, so the image still works when cropped to a square or a
> wide banner. Simple handmade ceramic plate or bowl, a linen napkin or one simple utensil at
> most, no other props. Plain matte background in a solid **[colour]** colour, slightly
> textured like plaster. Warm, calm, slightly muted colours, like a modern cookbook. No text,
> no logos, no hands, no people. Landscape, 16:10.

### Real-world, 45° (the second set)

> **[Dish.]** Realistic editorial food photograph for a recipe app, taken from a
> three-quarter angle about 45 degrees above the table, as if sitting down to eat. The dish is
> in sharp focus near the centre of the frame, with a shallow depth of field: one softly
> blurred element in the foreground and a gently out-of-focus background of a real home
> kitchen or dining table. Natural window light from the side, soft shadows, and real
> highlights on anything glossy like sauce, oil, glaze or syrup. A few props that belong with
> the dish, such as a raw ingredient from the recipe, a utensil, a linen napkin or a glass,
> placed loosely and never cluttered. Lived-in surfaces like worn wood, stone or a linen
> tablecloth, with a **[colour]** accent somewhere in the scene, such as a napkin, a bowl or
> the wall behind. Warm, natural, slightly muted colours. Leave some breathing room around the
> dish so it still works cropped to a square or a wide banner. No text, no logos, no hands,
> no people. Landscape, 16:10.

Avoid angles between 45° and straight down: they make food look like it's sliding off the
table.

### Colour per category

The colour keeps each category looking like a set: the whole background in the overhead
style, an accent in the 45° style.

| Category | Colour |
| --- | --- |
| Breakfast | butter yellow |
| Breads | terracotta |
| Mains | sage green |
| Dips, Sauces & Basics | tomato red |
| Pantry & Ferments | sea-glass teal |
| Snacks | powder blue |
| Desserts & Cookies | dusty pink |
| Amaro & Infusions | plum |

### Writing the dish sentence

Name what you'd see: the dish, how it's served and one detail that makes it look right ("one
wedge cut out to show the layers", "a spoon pulling up a ribbon"). For a sauce or seasoning,
show it in a bowl or jar next to what it goes on. Leave out anything with writing on it, like
labels or recipe cards.

## Steps

1. Open the recipe's category page and select its frame.
2. Generate an image with Figma AI (Actions → Make an image) using the prompt under the
   frame, and set it to fill the frame.
3. Every frame has a JPG export set up. Select the frames and click **Export**; the files are
   named after the frames.
4. Upload the files to the Mise images folder in Google Drive, shared as "Anyone with the
   link: Viewer".
5. Ask Claude to link the images to their recipes. Each recipe's `image` field holds the
   Drive file id.
