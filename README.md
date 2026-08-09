# Farwest Dialogue Tree UI

Interactive Scratch-style editor for Unreal Engine dialogue data assets.

## Use it

```bash
# from repo root — any static server works
npx --yes serve app -p 5173
```

Open `http://localhost:5173`, then:

1. **Load sample** or **Import paste** your DA TArray text
2. Pick a **Day**, click a line, select text
3. Stamp **Very slow / Slow / Shake / Strong shake** from the left
4. Effects show as colored highlights (tags stay hidden)
5. **Copy Unreal code** to paste back into the data asset

### Shortcuts

- `Ctrl/Cmd+Shift+1` Very slow
- `Ctrl/Cmd+Shift+2` Slow
- `Ctrl/Cmd+Shift+3` Shake
- `Ctrl/Cmd+Shift+4` Strong shake

### Effect tags (engine)

| Tag | Meaning |
|-----|---------|
| `<0.n>` … `<1>` (decimals) | Text speed (`1` fastest; below `0.2` = no skip) |
| `<1>` … `<10>` | Regular shake (duration) |
| `<10>`+ | Strong shake |
| `<-1>` | Reset to default |

The editor treats integer `1–10` as shake and decimals / values `< 1` as speed, matching how the sample scripts are written.
