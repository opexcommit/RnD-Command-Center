import { Slow, Plot, Loupe } from '@lucasmarkes/hairline/react';

const KINDS = { slow: Slow, plot: Plot, loupe: Loupe };

// Plates are opaque, so the figure sits on a solid tile (see .figure in styles.css), not on glass.
export default function Figure({ kind, label, className = '' }) {
  const C = KINDS[kind];
  return <div className={'figure ' + className}><C theme="light" intensity={0.5} play aria-label={label} /></div>;
}
