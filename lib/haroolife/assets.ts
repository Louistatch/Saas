/**
 * Root of the HarooLife 3D assets. With a build version (content hash computed in next.config.mjs)
 * the URLs are /haroolife/v/<hash>/…, cached as immutable and rewritten onto public/haroolife/…;
 * without one (tests, tooling) they stay the plain public paths.
 */
const version = process.env.NEXT_PUBLIC_HAROOLIFE_ASSETS_V

export const HAROOLIFE_ASSETS = version ? `/haroolife/v/${version}` : '/haroolife'
