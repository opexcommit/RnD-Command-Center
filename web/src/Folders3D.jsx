import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { BoxGeometry } from 'three';
import { animate, motionValue } from 'motion/react';

const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const W = 72, H = 48, D = 16;   // folder size in CSS pixels

// A box with hairline-style edges.
function Slab({ size, color, ...props }) {
  const geo = useMemo(() => new BoxGeometry(...size), size);
  return (
    <group {...props}>
      <mesh geometry={geo}><meshStandardMaterial color={color} roughness={0.9} /></mesh>
      <lineSegments><edgesGeometry args={[geo]} /><lineBasicMaterial color="#5B6BC0" /></lineSegments>
    </group>
  );
}

function Folder({ i, n, on }) {
  const width = useThree(s => s.size.width);
  const invalidate = useThree(s => s.invalidate);
  const body = useRef(), lid = useRef(), paper = useRef();
  const open = useMemo(() => motionValue(0), []);
  useEffect(() => {
    if (REDUCED) { open.jump(on ? 1 : 0); invalidate(); return; }
    const a = animate(open, on ? 1 : 0, { type: 'spring', stiffness: 140, damping: 13 });
    return () => a.stop();
  }, [on]);
  useFrame(({ clock }) => {
    const o = open.get(), t = REDUCED ? 0 : clock.elapsedTime;
    body.current.position.y = Math.sin(t * 1.2 + i) * 2.5 + o * 4;
    body.current.rotation.y = -0.5 + Math.sin(t * 0.6 + i) * 0.05;
    body.current.scale.setScalar(1 + o * 0.1);
    lid.current.rotation.x = 0.12 + o * 0.7;
    paper.current.position.y = 3 + o * 12;
  });
  return (
    <group position={[(i + 0.5) * width / n - width / 2, -6, 0]}>
      <group ref={body} rotation={[0.3, -0.5, 0]}>
        <Slab size={[W, H, 2]} color="#E1E5FA" position={[0, 0, -D / 2]} />
        <Slab size={[W * 0.4, 9, 2]} color="#E1E5FA" position={[-W * 0.3, H / 2 + 4.5, -D / 2]} />
        <Slab size={[W, 2, D]} color="#E1E5FA" position={[0, -H / 2, 0]} />
        <group ref={paper}>
          <Slab size={[W - 10, H - 6, 1]} color="#FFFFFF" position={[0, 0, -D / 2 + 5]} />
          <Slab size={[W - 10, H - 6, 1]} color="#FFFFFF" position={[0, -3, -D / 2 + 9]} />
        </group>
        <group ref={lid} position={[0, -H / 2, D / 2]}>
          <Slab size={[W, H * 0.86, 2]} color={on ? '#C9D2FF' : '#EEF0FB'} position={[0, H * 0.43, 0]} />
        </group>
      </group>
    </group>
  );
}

export default function Folders3D({ n, active, onReady }) {
  return (
    <Canvas orthographic flat dpr={[1, 2]} camera={{ zoom: 1, position: [0, 0, 200], near: 1, far: 1000 }}
      gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}
      frameloop={REDUCED ? 'demand' : 'always'} onCreated={onReady} style={{ pointerEvents: 'none' }}>
      <ambientLight intensity={2.6} />
      <directionalLight position={[60, 120, 200]} intensity={1.2} />
      {Array.from({ length: n }, (_, i) => <Folder key={i} i={i} n={n} on={i === active} />)}
    </Canvas>
  );
}
