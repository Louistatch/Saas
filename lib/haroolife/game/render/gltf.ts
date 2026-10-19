/**
 * The GLB loader of the HarooLife engines. Embedded images (Kenney Car Kit `colormap`, …) are
 * decoded through an <img> on a blob: URL — allowed by the CSP's img-src — instead of
 * ImageBitmapLoader, which fetch()es the blob: URL and is refused by connect-src. The CSP stays
 * as strict as it is; without this the taxi showed untextured (white).
 */
import { TextureLoader } from 'three'
import { GLTFLoader, type GLTFParser } from 'three/examples/jsm/loaders/GLTFLoader.js'

export function createGltfLoader(): GLTFLoader {
  const loader = new GLTFLoader()
  loader.register((parser: GLTFParser) => {
    const p = parser as GLTFParser & { textureLoader: unknown; options: { manager?: unknown } }
    p.textureLoader = new TextureLoader(p.options.manager as never)
    return { name: 'haroo_image_element' }
  })
  return loader
}
