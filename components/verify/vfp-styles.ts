/** Styles visuels partagés des écrans « carte » (thème sombre vfp-*). */
export const vfpStyles = `
  :root {
    --vfp-accent: oklch(0.72 0.18 142);
    --vfp-accent-dim: oklch(0.58 0.14 142);
    --vfp-accent-bright: oklch(0.84 0.16 142);
    --vfp-cta: oklch(0.75 0.20 142);
    --vfp-cta-fg: oklch(0.10 0.03 142);
  }
  .vfp-bg {
    background:
      radial-gradient(80% 55% at 18% 8%, oklch(0.45 0.18 142 / 0.10), transparent 60%),
      radial-gradient(60% 45% at 85% 90%, oklch(0.40 0.16 142 / 0.12), transparent 60%),
      linear-gradient(180deg, #040f0a 0%, #071a12 45%, #04120b 100%);
  }
  .vfp-bg::before {
    content: ''; position: absolute; inset: 0; pointer-events: none; z-index: 0;
    background-image: radial-gradient(rgba(255,255,255,.018) 1px, transparent 1px);
    background-size: 3px 3px; opacity: .4;
  }
  .vfp-glass-subtle {
    background: rgba(255,255,255,.04);
    border: 1px solid rgba(255,255,255,.06);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }
  .vfp-card {
    background: linear-gradient(160deg, rgba(255,255,255,.055), rgba(255,255,255,.015));
    border: 1px solid rgba(255,255,255,.07);
    backdrop-filter: blur(12px) saturate(1.05);
    -webkit-backdrop-filter: blur(12px) saturate(1.05);
    box-shadow: 0 4px 24px -8px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.06);
    transition: transform .2s cubic-bezier(.2,.7,.2,1), border-color .2s, box-shadow .2s;
  }
  .vfp-card:active:not(:disabled) { transform: scale(.97); }
  .vfp-card:hover:not(:disabled) { border-color: oklch(0.72 0.18 142 / 0.25); box-shadow: 0 4px 24px -8px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.06), 0 0 0 1px oklch(0.72 0.18 142 / 0.08); }
  .vfp-enter { animation: vfpIn .5s cubic-bezier(.2,.7,.2,1) both; }
  @keyframes vfpIn { from { opacity:0; transform: translateY(12px); } to { opacity:1; transform: none; } }
  .vfp-pop { animation: vfpPop .5s cubic-bezier(.2,1.4,.4,1) .3s both; }
  @keyframes vfpPop { 0% { transform: scale(0); } 60% { transform: scale(1.2); } 100% { transform: scale(1); } }
  .vfp-loader {
    width: 32px; height: 32px; border: 2.5px solid oklch(0.72 0.18 142 / 0.15);
    border-top-color: var(--vfp-accent); border-radius: 50%;
    animation: vfpSpin .7s linear infinite;
  }
  @keyframes vfpSpin { to { transform: rotate(360deg); } }
  .vfp-ai-halo { animation: vfpHaloBreathe 3.4s ease-in-out infinite; }
  @keyframes vfpHaloBreathe { 0%,100% { transform: scale(1); opacity: .7; } 50% { transform: scale(1.18); opacity: 1; } }
  .vfp-ai-wavebar { animation: vfpWaveBar 1.1s ease-in-out infinite; transform-origin: bottom; }
  @keyframes vfpWaveBar { 0%,100% { transform: scaleY(.5); } 50% { transform: scaleY(1); } }
  @media (prefers-reduced-motion: reduce) { .vfp-enter,.vfp-pop,.vfp-ai-halo,.vfp-ai-wavebar { animation: none; } }
`
