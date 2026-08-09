# Farwest Dialogue Tree UI

Interactive Scratch-style editor for Unreal Engine dialogue data assets.

## Use it

```bash
# from repo root — any static server works
npm start
# → http://localhost:5173
```

Open the app, then:

1. **Load sample** or **Import paste** your DA TArray text
2. Pick a **Day**, click a line, select text
3. Stamp **Slow / Super slow / Shake / Strong shake** from the left
4. Effects show as colored highlights with a **value chip** (`.15`, `.5`, `30`…) so you can see where each tag starts/ends
5. **Copy Unreal code** to paste back into the data asset

Trailing tags with no letters after them are blocked, shown as a red ∅ chip if already present, and stripped on export / Clear tags.

### Shortcuts

- `Ctrl/Cmd+Shift+1` Slow (`<.15>`)
- `Ctrl/Cmd+Shift+2` Super slow (`<.5>`)
- `Ctrl/Cmd+Shift+3` Shake
- `Ctrl/Cmd+Shift+4` Strong shake

### Effect tags (engine)

| Tag | Meaning |
|-----|---------|
| delay number | Timer between letters — **higher = slower**. Default is `<.1>` |
| `<.n>` where n **&lt; .2** | Slow — still fast, fast-forwardable |
| `<.2>` … `<.99>` | Super slow |
| `<1>` … `<10>` | Regular shake (duration) |
| `<10>`+ | Strong shake |
| `<-1>` | Reset to default (`.1`) |

The editor treats integer `1–10` as shake and decimals / values `< 1` as text speed.
