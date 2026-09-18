# Bamboo Counter

Count poles in a photo of a load — bamboo, timber, pipe, scaffold tube — by
marking every visible cut end. Built for checking a delivery against the docket
without unloading the truck.

Runs entirely in the browser. The photo never leaves the phone: no upload, no
server, no account. Once opened it works offline, which matters in a yard.

## Using it

1. **Choose photo** — take it square-on to the cut ends, filling the frame,
   with the flash on. Every hard case for the detector is a lighting case:
   the backlit top of a stack, an end angled away whose rim catches no light.
   A flash from the camera axis lights rims and bores evenly.
2. **Detect** — finds most of the ends in about a third of a second.
3. **Fix the rest** — pinch to zoom, tap a bare end to add it, tap a number to
   remove it. Undo covers misfires.
4. **Expected** — enter the docket quantity and the badge shows the difference
   as you work. Set it before Detect and, when Detect falls short of it, the
   next best candidates are shown as blue rings: tap one to count it, or leave
   it. They are never counted on their own — reaching the docket by itself
   would defeat the check.
5. **Save** — writes a numbered JPEG you can attach to a goods-receipt.

Progress is kept if you close the tab mid-count.

## Accuracy

Measured against two hand-checked loads of 100 ends each, matching a detection
to a real end when their centres fall within 75% of the end's radius.

| | photo 1 | photo 2 | mean F1 |
|---|---|---|---|
| first version | 94% recall / 94% precision | 83% / 96.5% | 91.6 |
| **current** | **96% / 93.2%** | **90% / 96.8%** | **93.95** |

Two changes account for it, both found by measuring rather than guessing:

**Ring coverage.** Scoring a candidate only by average rim strength treats a
ring supported all the way round the same as one supported on a single side.
Measuring what fraction of the ring carries a radial gradient separates a real
end from a chance alignment — and lets an end whose colour is washed out by
shadow still qualify. Nearly every miss on photo 2 was in the backlit top of
the stack, where saturation collapses and the colour test alone rejects a
perfectly good end.

**Centre refinement.** The vote map peaks a pixel or two off true centre when
rims are soft, and that error drags the measured radius with it. A small search
around each peak fixes both, so markers also land where the eye expects.

Things tried that did **not** earn their place, for the record: normalising the
vote map against its local neighbourhood (better recall, much worse precision),
a second detection pass over what the first pass left (no change), lowering the
peak threshold (precision collapsed), and detecting at higher resolution
(1200px was already the sweet spot).

Only two photos back these numbers, so treat the third decimal as noise. The
two structural changes are principled; the exact thresholds may be worth
retuning if your loads look different.

### Not yet measured

Three later detector changes have been checked on synthetic loads but not
scored against the hand-counted photos, so they carry no number yet:

- **Dark bore.** A third way past the colour test, for the end angled away
  from the camera: no bright rim, but a clearly dark bore with some timber
  round it. Never required, since a culm cut through a node is a solid disc.
- **One size per load.** Ends in a photo share a radius; stickers, lettering
  and a bystander's head do not. Candidates far from the typical size are
  dropped once there are enough accepted ends to know what typical is.
- **Packing pass.** Ends sit roughly hexagonally, so the spot where a third
  end would touch two found neighbours gets fitted like any other candidate
  even though the vote map never nominated it - hemmed in on every side, its
  rim votes drown in its neighbours'. Only spots implied from two sides are
  tried, at the neighbours' size, and the bar is a fully supported ring at
  least a fraction as strong as the ends already kept. On a synthetic
  rim-to-rim load it turned 7 misses in 48 into 1 and filled no true gap.

To score them properly the app now keeps a count log: each saved count
records what Detect found next to what the count ended as, in image pixels,
and the self-test page's "Copy results" hands it back. Every corrected count
is a labelled photo, and labelled photos are what the detector is short of.

### Where it still needs help

- **Ends angled away from the camera** show no bright rim — the bore reads as
  plain shadow. Still the most-missed kind.
- **Ends hemmed in on every side** get suppressed as duplicates of neighbours.
- **The outer fringe** of the bundle, especially bottom corners.

False positives are rarer and cluster on tailgate stickers, lettering, and
occasionally a person standing beside the load.

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

Each surviving candidate is then judged three ways. Colour: is the rim bare
timber, by hue and saturation? Sky, render, concrete and truck paint all
produce round-ish edges, and colour is what separates them — saturation more
than hue, since sun-bleached roofing sits in bamboo's hue band but is far
paler. Geometry: does a radial gradient support the ring the whole way round?
And depth: is the bore clearly darker than the rim? A clearly woody rim, a
fully supported ring, or a dark bore with a little timber round it is enough,
which is what keeps shadowed and angled ends without losing the background to
false positives. Survivors are held to one size per load, and gaps that the
packing implies are fitted last.

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
