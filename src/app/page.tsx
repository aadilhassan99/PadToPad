import HeliGame from "@/components/HeliGame";

export default function Home() {
  return (
    <main className="wrap">
      <header>
        <h1>
          Pad <span>to</span> Pad
        </h1>
        <p className="tag">
          Lift off from the first helipad, cross the valley, and set down on the lit pad at the far end.
        </p>
      </header>

      <HeliGame />

      <ul className="legend">
        <li><kbd>&uarr;</kbd> lift off, climb</li>
        <li><kbd>&darr;</kbd> sink</li>
        <li><kbd>&larr;</kbd><kbd>&rarr;</kbd> tilt and fly</li>
        <li><kbd>R</kbd> restart level</li>
        <li><kbd>M</kbd> sound on or off</li>
      </ul>
      <p className="rules">
        Touch down on the target pad slower than <b>9.5 m/s</b> downward and <b>7 m/s</b> sideways, with the nose
        within <b>17&deg;</b> of level. Pads refuel you. Later levels bring wind, taller ridges and a longer trip.
      </p>
    </main>
  );
}
