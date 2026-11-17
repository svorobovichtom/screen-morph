# Screen morph

One screen turning into another, as a WebGL shader.

<img src="preview.gif" width="400" alt="Three app screens morphing into one another: a wishlist, a subscription sheet and a dark wallet chat" />

A soft, slightly ragged front rises through the screen. Near it both pictures blur a little and flow up with it, dark and coloured marks swap a little ahead of the ground (so a button changes shape instead of being cut by a line), and the incoming screen settles from a touch larger and lower.

It is a function of progress alone, so it scrubs both ways: drive it from scroll, a drag, a slider or `play()`.

**[Live demo](https://svorobovich.com/ui/screen-morph/)** — try it with your own screenshots.

## Install

One file, no dependencies. Copy [`screen-morph.js`](screen-morph.js) into your project, or:

```sh
npm install github:svorobovichtom/screen-morph
```

## Use

```js
import { screenMorph } from "screen-morph"; // or "./screen-morph.js"

const morph = screenMorph(canvas, { from: imageA, to: imageB });

morph.set(0.5);        // 0 shows `from`, 1 shows `to`
await morph.play(1);   // or animate there
```

`from` and `to` are anything WebGL can upload: an `<img>`, `<canvas>`, `<video>` or `ImageBitmap`. An `<img>` that is still loading is picked up once it loads. Pictures fill the canvas like `object-fit: cover`, top-aligned, and the canvas follows its own CSS size.

## API

`screenMorph(canvas, { from, to, seed = 7 })` returns:

| | |
| --- | --- |
| `progress` | where the morph is, 0 to 1 |
| `set(p)` | show the morph at `p`; stops a `play()` |
| `play(p = 1, ms = 1000)` | animate to `p` over `ms`, scaled by the distance; resolves when it gets there or when another `set` or `play` takes over |
| `setImages(from, to)` | new pictures; progress stays where it is |
| `setSeed(n)` | another front; odd seeds lean one way, even the other |
| `webgl` | `true` for the shader, `false` for the 2D crossfade it falls back to |
| `destroy()` | stop watching the canvas's size |

## Tuning

The look lives in `LOOK` at the top of the file, in screen heights unless noted: how soft and ragged the front is, how far ahead the marks swap, the blur and the flow around the front, and how much larger and lower the incoming screen starts.

## Notes

- At its best on light screens (white or pale ground), where it can tell a mark from the ground. Dark screens morph too.
- WebGL 1. Without it, the screens crossfade on a 2D canvas.
- Respect `prefers-reduced-motion` in your own code: `set(1)` instead of `play()`.

[`example/`](example/) has a page with a slider through three screens. Serve the folder (`npx serve .`) and open `/example/`.

## License

MIT © [Tom Svorobovich](https://svorobovich.com)
