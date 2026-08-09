# Farwest Dialogue Tree UI

Interactive Scratch-style editor for Unreal Engine dialogue data assets.

## Live (GitHub Pages)

**https://lootera89.github.io/FarwestDialougeTreeUI/**

## Import characters (Child, Girl, GuardWomen…)

Unreal `.uasset` files are binary — browsers can’t open them directly. Use a text dump of each DA’s dialogue array:

1. Open a character DA in Unreal (e.g. `Child`)
2. In Details, click the dialogue **array** property
3. Copy (`Ctrl/Cmd+C`)
4. Paste into a text file named after the character: `Child.txt`, `Girl.txt`, …
5. In the app: **Import DAs** → drop all those `.txt` files at once  
   (or paste one character with a name)

Switch characters with the tabs at the top of the stage. Edits autosave in the browser (`localStorage`).

## Export back to Unreal

**Copy Unreal code** (or Download `.txt`) for the selected character, then paste back into that DA’s array in the editor.

## Local

```bash
npm start
# → http://localhost:5173
```

### Effects

Select text → stamp Slow / Super slow / Shake / Strong shake.  
Tag values float above the letters; stacked tags show together (`1 · .6`).

### Shortcuts

- `Ctrl/Cmd+Z` Undo · `Ctrl/Cmd+Y` Redo
- `Ctrl/Cmd+Shift+1–4` Slow / Super slow / Shake / Strong shake
