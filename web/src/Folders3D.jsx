import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { BoxGeometry } from 'three';
import { animate, motionValue } from 'motion/react';

const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const W = 72, H = 48, D = 16;   // folder size in CSS pixels
// one soft pastel per step, repeating if there are more steps than colours
const PALETTE = ['#C9D2FF', '#FFD6E4', '#CFF1E3', '#FFE8C7', '#E3D4FF', '#CDE9FF', '#FFF3B8'];
// paper sheets show how full a step is: none when empty, up to three
const sheets = n => n === 0 ? 0 : n < 10 ? 1 : n < 50 ? 2 : 3;

// A solid box with a faint outline.
function Slab({ size, color, ...props }) {
  const geo = useMemo(() => new BoxGeometry(...size), size);
  return (
    <group {...props}>
      <mesh geometry={geo}><meshStandardMaterial color={color} roughness={0.8} /></mesh>
      <lineSegments><edgesGeometry args={[geo]} /><lineBasicMaterial color="#5B6BC0" transparent opacity={0.4} /></lineSegments>
    </group>
  );
}

// target: 0 closed, 0.6 peeking (pointed at), 1 fully open (clicked)
function Folder({ i, n, count, target }) {
  const width = useThree(s => s.size.width);
  const invalidate = useThree(s => s.invalidate);
  const body = useRef(), lid = useRef(), paper = useRef();
  const open = useMemo(() => motionValue(0), []);
  useEffect(() => {
    if (REDUCED) { open.jump(target); invalidate(); return; }
    const a = animate(open, target, { type: 'spring', stiffness: 140, damping: 13 });
    return () => a.stop();
  }, [target]);
  useFrame(({ clock }) => {
    const o = open.get(), t = REDUCED ? 0 : clock.elapsedTime;
    body.current.position.y = Math.sin(t * 1.2 + i) * 2.5 + o * 4;
    body.current.rotation.y = -0.5 + Math.sin(t * 0.6 + i) * 0.05;
    body.current.scale.setScalar(1 + o * 0.1);
    lid.current.rotation.x = 0.12 + o * 0.9;
    paper.current.position.y = o * 14;
  });
  const color = PALETTE[i % PALETTE.length];
  return (
    <group position={[(i + 0.5) * width / n - width / 2, -6, 0]}>
      <group ref={body} rotation={[0.3, -0.5, 0]}>
        <Slab size={[W, H, 2]} color={color} position={[0, 0, -D / 2]} />
        <Slab size={[W * 0.4, 9, 2]} color={color} position={[-W * 0.3, H / 2 + 4.5, -D / 2]} />
        <Slab size={[W, 2, D]} color={color} position={[0, -H / 2, 0]} />
        <group ref={paper}>
          {Array.from({ length: sheets(count) }, (_, k) =>
            <Slab key={k} size={[W - 10, H - 6, 1]} color="#FFFFFF" position={[0, 3 - k * 3, -D / 2 + 4 + k * 3]} />)}
        </group>
        <group ref={lid} position={[0, -H / 2, D / 2]}>
          <Slab size={[W, H * 0.86, 2]} color={color} position={[0, H * 0.43, 0]} />
        </group>
      </group>
    </group>
  );
}

export default function Folders3D({ counts, active, pinned, onReady }) {
  const n = counts.length;
  return (
    <Canvas orthographic flat dpr={[1, 2]} camera={{ zoom: 1, position: [0, 0, 200], near: 1, far: 1000 }}
      gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}
      frameloop={REDUCED ? 'demand' : 'always'} onCreated={onReady} style={{ pointerEvents: 'none' }}>
      <ambientLight intensity={1.9} />
      <directionalLight position={[60, 120, 200]} intensity={2} />
      {counts.map((count, i) => <Folder key={i} i={i} n={n} count={count} target={i === pinned ? 1 : i === active ? 0.6 : 0} />)}
    </Canvas>
  );
}
