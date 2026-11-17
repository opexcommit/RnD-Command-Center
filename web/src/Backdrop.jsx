import { ShaderGradientCanvas, ShaderGradient } from '@shadergradient/react';

const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// lightType must stay "3d": "env" downloads HDR files from github.io, and nothing may load from other hosts.
export default function Backdrop() {
  return (
    <div className="backdrop" aria-hidden="true">
      <ShaderGradientCanvas style={{ position: 'absolute', inset: 0 }} pixelDensity={1} fov={45} pointerEvents="none" lazyLoad={false}>
        <ShaderGradient control="props" type="waterPlane" animate={REDUCED ? 'off' : 'on'} lightType="3d" grain="off"
          uSpeed={0.15} uStrength={1.5} uDensity={1.2} uFrequency={5.5} brightness={1.3}
          color1="#C9D2FF" color2="#FFD6E4" color3="#CFF1E3"
          cDistance={3.6} cPolarAngle={90} cAzimuthAngle={180} enableTransition={false} />
      </ShaderGradientCanvas>
    </div>
  );
}
