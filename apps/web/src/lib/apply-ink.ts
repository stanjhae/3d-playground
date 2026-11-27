import { MeshStandardMaterial, type Mesh, type Texture } from 'three'

function meshMaterials({ mesh }: { mesh: Mesh }) {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material]
}

/**
 * Template-built garments print through their own UV set (`TEXCOORD_1`,
 * three's `uv1`; `scripts/build-template.mjs`): each panel upright in its
 * atlas rectangle, everything else at (−1, −1), which never takes ink.
 */
function hasPrintUv({ mesh }: { mesh: Mesh }) {
  const uv1 = mesh.geometry?.getAttribute?.('uv1')

  if (!uv1) {
    return false
  }

  // The shader reads it under its own name, declared there.
  if (!mesh.geometry.getAttribute('inkUv')) {
    mesh.geometry.setAttribute('inkUv', uv1)
  }

  return true
}

export function bindInkMap({
  meshes,
  inkMap,
  printUv = false,
}: {
  meshes: Mesh[]
  inkMap: Texture | null
  /** Sample the print UV set instead of the mesh's own UVs. */
  printUv?: boolean
}) {
  for (const mesh of meshes) {
    // Trim such as the tee collar is built with `printable: false` (#165);
    // on a template-built garment, only meshes with print UVs take ink.
    const meshInk =
      mesh.userData.printable === false || (printUv && !hasPrintUv({ mesh })) ? null : inkMap

    for (const material of meshMaterials({ mesh })) {
      if (!(material instanceof MeshStandardMaterial)) {
        continue
      }

      material.userData.inkMap = meshInk

      if (!meshInk) {
        material.customProgramCacheKey = () => 'cloth'
        material.onBeforeCompile = () => {}
        material.needsUpdate = true
        continue
      }

      material.customProgramCacheKey = () => (printUv ? 'cloth-ink-print' : 'cloth-ink')
      material.onBeforeCompile = (shader) => {
        shader.uniforms.inkMap = { value: meshInk }
        shader.vertexShader = shader.vertexShader.replace(
          '#include <common>',
          printUv
            ? `#include <common>
attribute vec2 inkUv;
varying vec2 vInkUv;`
            : `#include <common>
varying vec2 vInkUv;`,
        )
        shader.vertexShader = shader.vertexShader.replace(
          '#include <uv_vertex>',
          `#include <uv_vertex>
vInkUv = ${printUv ? 'inkUv' : 'uv'};`,
        )
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <common>',
          `#include <common>
uniform sampler2D inkMap;
varying vec2 vInkUv;`,
        )
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <map_fragment>',
          printUv
            ? `#include <map_fragment>
if (vInkUv.x >= 0.0 && vInkUv.y >= 0.0) {
  vec4 inkTexel = texture2D(inkMap, vInkUv);
  diffuseColor.rgb = mix(diffuseColor.rgb, inkTexel.rgb, inkTexel.a);
}`
            : `#include <map_fragment>
vec4 inkTexel = texture2D(inkMap, vInkUv);
diffuseColor.rgb = mix(diffuseColor.rgb, inkTexel.rgb, inkTexel.a);`,
        )
      }
      material.needsUpdate = true
    }
  }

  return meshes
}
