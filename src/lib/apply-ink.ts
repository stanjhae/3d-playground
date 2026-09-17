import { MeshStandardMaterial, type Mesh, type Texture } from 'three'

function meshMaterials({ mesh }: { mesh: Mesh }) {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material]
}

export function bindInkMap({
  meshes,
  inkMap,
}: {
  meshes: Mesh[]
  inkMap: Texture | null
}) {
  for (const mesh of meshes) {
    for (const material of meshMaterials({ mesh })) {
      if (!(material instanceof MeshStandardMaterial)) {
        continue
      }

      material.userData.inkMap = inkMap

      if (!inkMap) {
        material.customProgramCacheKey = () => 'cloth'
        material.onBeforeCompile = () => {}
        material.needsUpdate = true
        continue
      }

      material.customProgramCacheKey = () => 'cloth-ink'
      material.onBeforeCompile = (shader) => {
        shader.uniforms.inkMap = { value: inkMap }
        shader.vertexShader = shader.vertexShader.replace(
          '#include <common>',
          `#include <common>
varying vec2 vInkUv;`,
        )
        shader.vertexShader = shader.vertexShader.replace(
          '#include <uv_vertex>',
          `#include <uv_vertex>
vInkUv = uv;`,
        )
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <common>',
          `#include <common>
uniform sampler2D inkMap;
varying vec2 vInkUv;`,
        )
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <map_fragment>',
          `#include <map_fragment>
vec4 inkTexel = texture2D(inkMap, vInkUv);
diffuseColor.rgb = mix(diffuseColor.rgb, inkTexel.rgb, inkTexel.a);`,
        )
      }
      material.needsUpdate = true
    }
  }

  return meshes
}
