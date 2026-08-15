# Bamboo Counter

Count poles in a photo of a load — bamboo, timber, pipe, scaffold tube — by
marking every visible cut end. Built for checking a delivery against the docket
without unloading the truck.

Runs entirely in the browser. The photo never leaves the phone: no upload, no
server, no account. Once opened it works offline, which matters in a yard.

## Using it

1. **Choose photo** — take it square-on to the cut ends, filling the frame.
2. **Detect** — finds most of the ends in about a third of a second.
3. **Fix the rest** — pinch to zoom, tap a bare end to add it, tap a number to
   remove it. Undo covers misfires.
4. **Expected** — enter the docket quantity and the badge shows the difference
   as you work.
5. **Save** — writes a numbered JPEG you can attach to a goods-receipt.

Progress is kept if you close the tab mid-count.

## Where the detector needs help

Measured against two hand-checked loads of 100: **94% and 83%** of ends found
automatically. The gap is not random, so it is worth knowing where to look:

- **Ends angled away from the camera** show no bright rim — the bore reads as
  plain shadow. The most-missed kind by a distance.
- **Ends hemmed in on every side** get suppressed as duplicates of their
  neighbours.
- **The outer fringe** of the bundle, especially bottom corners.
- **Small ends behind larger ones** at the back of the stack.

False positives are rarer and cluster on tailgate stickers and lettering.

A culm cut through a node shows a solid tan disc rather than a hole. That is
still a pole and the detector counts it.

## Read the number honestly

The result is **visible ends**. Poles buried mid-bundle with their ends
occluded are not in it, so treat it as a floor rather than the load. On a
tightly packed truck the gap is wider.

## How the detector works

No libraries, no model, ~200 lines in `app.js`.

Every edge pixel points at the centre of whatever curve it lies on, so each one
votes along its gradient line at every plausible radius. Rims collect votes from
all the way round and show up as sharp peaks; noise scatters. Radius is then
measured per peak — the ring whose gradients point most radially — which keeps
the accumulator 2-D and fast enough for a phone.

The step that does the real work in a yard photo is the last one: a candidate
survives only if its rim is bare timber, judged on hue and saturation. Sky,
render, concrete and truck paint all produce round-ish edges; colour is what
separates them. Saturation matters more than hue, because sun-bleached roofing
sits in the same hue band as bamboo but is far paler.

## Running locally

Any static file server:

```bash
python -m http.server 8731 --directory bamboo-counter
```

No build step. Deploy by copying the folder to any static host.

## Files

| file | |
|---|---|
| `index.html` | markup |
| `app.js` | detector, canvas, gestures, export, persistence |
| `style.css` | styling |
| `sw.js` | offline cache |
| `manifest.webmanifest`, `icon.svg` | installable web app |
