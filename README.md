# Pad to Pad

A 2D helicopter game built with Next.js (App Router) and TypeScript. Take off from the first helipad, fly across the landscape, and land on the lit pad at the far end.

## Run it

```bash
npm install next@latest react@latest react-dom@latest
npm install -D typescript @types/node @types/react @types/react-dom
npm run dev      # http://localhost:3000
npm run build && npm start
```

## Controls

- Up: lift off and climb
- Down: sink
- Left / Right: tilt and fly
- R: restart level, M: sound on or off
- Touch screens get on-screen buttons

Land on the target pad below 9.5 m/s downward and 7 m/s sideways, nose within 17 degrees of level.

## Layout

```
src/
  app/
    layout.tsx        fonts, viewport, metadata
    page.tsx          title, legend, landing rules
    globals.css       page styles
  components/
    HeliGame.tsx      client component: mounts the canvas, touch buttons
  game/
    engine.ts         the whole game (terrain, physics, drawing, input, sound)
```

`engine.ts` has no React in it. `createGame(canvas)` returns `{ press, destroy }`, so the component only mounts the canvas and cleans up on unmount.
