/// <reference types="vite/client" />
import {
  AmbientLight, BackSide, BufferGeometry, DoubleSide, LineBasicMaterial, LineLoop, LineSegments, Mesh,
  MeshBasicMaterial, MeshLambertMaterial, PerspectiveCamera, PointLight,
  RingGeometry, Scene, SphereGeometry, sRGBEncoding, Texture, TextureLoader,
  Vector3, WebGLRenderer,
} from 'three'
import textureSources from '../assets/planet-textures/sources.json'
import { createStarfield, defaultStarFov, equatorialDirection, starLabels, starMagnitudeGain } from './starfield'
import messierObjects from '../assets/messier.json'
import constellations from '../assets/constellations.json'

const messierDirections = messierObjects.map(({ ra, dec }) => new Vector3(...equatorialDirection(ra, dec)))
const constellationDirections = constellations.labels.map(([name, ra, dec]) => ({
  name: String(name),
  direction: new Vector3(...equatorialDirection(Number(ra), Number(dec))),
}))

function createConstellationLines() {
  const vertices: Vector3[] = []
  for (const lines of constellations.lines) {
    for (const line of lines) {
      const points = line.map(([ra, dec]) => new Vector3(...equatorialDirection(ra, dec)))
      for (let i = 1; i < points.length; i++) {
        vertices.push(points[i - 1], points[i])
      }
    }
  }
  const lines = new LineSegments(new BufferGeometry().setFromPoints(vertices), new LineBasicMaterial({
    color: 0x82aaff, transparent: true, opacity: 0.55, depthWrite: false,
  }))
  lines.visible = false
  return lines
}
// Frame the region between Polaris and the Big Dipper.
const northSkyDirection = new Vector3(...equatorialDirection(185, 70))

const textureUrls = import.meta.glob<string>('../assets/planet-textures/*.{jpg,png}', {
  eager: true,
  query: '?url',
  import: 'default',
})

export const planets = [
  { name: '水星', orbit: 7, radius: 0.38, color: 0xada49b, angle: 0.65 },
  { name: '金星', orbit: 10, radius: 0.66, color: 0xe7bc79, angle: 2.35 },
  { name: '地球', orbit: 14, radius: 0.7, color: 0x479bff, angle: 4.8 },
  { name: '火星', orbit: 18, radius: 0.51, color: 0xe87d59, angle: 3.34 },
  { name: '木星', orbit: 24, radius: 1.72, color: 0xdcb28e, angle: 0.3 },
  { name: '土星', orbit: 31, radius: 1.43, color: 0xe5cb96, angle: 5.5 },
  { name: '天王星', orbit: 38, radius: 1.04, color: 0x86dce1, angle: 1.8 },
  { name: '海王星', orbit: 45, radius: 1.01, color: 0x627de5, angle: 3.9 },
]

export type SolarView = 'solar' | 'earth-orbit' | 'earth-surface'

const planetTextures = [
  textureSources.mercury, textureSources.venus, textureSources.earth, textureSources.mars,
  textureSources.jupiter, textureSources.saturn, textureSources.uranus, textureSources.neptune,
]

const sunRadius = 3.4
const kmPerUnit = 100_000_000
const physicalSunRadius = 695_700 / kmPerUnit
// JPL mean radii (km) and NASA fact sheet orbital distances (million km), Mercury through Neptune.
const physicalPlanets = [
  [2439.4, 57.9], [6051.8, 108.2], [6371.0, 149.6], [3389.5, 228.0],
  [69911, 778.5], [58232, 1432.0], [25362, 2867.0], [24622, 4515.0],
]
const sceneRadius = 48
const orbitSegments = 128

export function createSolarRenderer(canvas: HTMLCanvasElement, invalidate: () => void) {
  const context = canvas.getContext('webgl2', { antialias: true, alpha: true })
  if (!context) return

  const renderer = new WebGLRenderer({ canvas, context, alpha: true })
  renderer.setClearColor(0, 0)
  renderer.outputEncoding = sRGBEncoding

  const loader = new TextureLoader()
  const textures: Texture[] = []
  let disposed = false

  function loadTexture(filename: string, onLoad: (texture: Texture) => void, onError?: () => void) {
    const url = textureUrls[`../assets/planet-textures/${filename}`]
    if (!url) {
      onError?.()
      return
    }
    const texture = loader.load(url, (loaded) => {
      if (disposed) return
      loaded.encoding = sRGBEncoding
      onLoad(loaded)
      invalidate()
    }, undefined, () => {
      if (disposed) return
      console.warn(`无法加载贴图：${filename}`)
      onError?.()
    })
    textures.push(texture)
  }

  function loadHighResolutionTexture(standard: string, high: string, onLoad: (texture: Texture) => void) {
    const loadStandard = () => loadTexture(standard, onLoad)
    if (renderer.capabilities.maxTextureSize >= 8192) {
      loadTexture(high, onLoad, loadStandard)
    } else {
      loadStandard()
    }
  }

  function applyTexture(filename: string, material: MeshBasicMaterial | MeshLambertMaterial,
    transparent = false, highResolution?: string) {
    function setMap(loaded: Texture) {
      material.map = loaded
      material.color.setHex(0xffffff)
      material.transparent = transparent
      material.alphaTest = transparent ? 0.02 : 0
      material.depthWrite = !transparent
      material.needsUpdate = true
    }
    if (highResolution) {
      loadHighResolutionTexture(filename, highResolution, setMap)
    } else {
      loadTexture(filename, setMap)
    }
  }

  const scene = new Scene()
  const camera = new PerspectiveCamera(45, 1, 0.1, 1000)
  const sphere = new SphereGeometry(1, 32, 20)
  const sky = new Mesh(new SphereGeometry(1, 128, 64), new MeshBasicMaterial({
    side: BackSide, depthTest: false, depthWrite: false,
  }))
  sky.visible = false
  sky.scale.setScalar(500)
  sky.renderOrder = -1
  scene.add(sky)
  const stars = createStarfield()
  scene.add(stars)
  const constellationLines = createConstellationLines()
  stars.add(constellationLines)

  let standardMilkyWay: Texture | null = null
  let highResolutionMilkyWay: Texture | null = null
  function orientMilkyWay(texture: Texture) {
    texture.repeat.x = -1
    texture.offset.x = 1
  }

  loadTexture(textureSources.milkyWay, texture => {
    orientMilkyWay(texture)
    standardMilkyWay = texture
  })
  if (renderer.capabilities.maxTextureSize >= 8192) {
    loadTexture(textureSources.milkyWay8k, texture => {
      orientMilkyWay(texture)
      highResolutionMilkyWay = texture
    })
  }
  const orbitMaterial = new LineBasicMaterial({ color: 0x344362 })
  const orbitGeometries: BufferGeometry[] = []
  const orbitLines: LineLoop[] = []
  const sun = new Mesh(sphere, new MeshBasicMaterial({ color: 0xffb544 }))
  applyTexture(textureSources.sun, sun.material)
  sun.scale.setScalar(sunRadius)
  scene.add(sun, new AmbientLight(0xffffff, 0.5), new PointLight(0xfff0db, 1.35))

  const bodies = planets.map(({ orbit, angle, radius, color }, index) => {
    const vertices = Array.from({ length: orbitSegments }, (_, index) => {
      const phase = index / orbitSegments * Math.PI * 2
      return new Vector3(Math.cos(phase) * orbit, 0, Math.sin(phase) * orbit)
    })
    const orbitGeometry = new BufferGeometry().setFromPoints(vertices)
    orbitGeometries.push(orbitGeometry)
    const orbitLine = new LineLoop(orbitGeometry, orbitMaterial)
    orbitLines.push(orbitLine)
    scene.add(orbitLine)

    const mesh = new Mesh(sphere, new MeshLambertMaterial({ color }))
    const filename = planetTextures[index]
    applyTexture(filename, mesh.material, false, filename === textureSources.earth ? textureSources.earth8k : undefined)
    mesh.position.set(Math.cos(angle) * orbit, 0, Math.sin(angle) * orbit)
    mesh.scale.setScalar(radius)
    scene.add(mesh)
    return mesh
  })

  const saturn = bodies[5]
  const ring = new Mesh(
    new RingGeometry(1.35, 2.15, 64),
    new MeshBasicMaterial({ color: 0xb7a27e, side: DoubleSide })
  )
  ring.rotation.x = -Math.PI / 2 + 0.25
  const positions = ring.geometry.attributes.position
  const uv = ring.geometry.attributes.uv
  for (let index = 0; index < positions.count; index++) {
    const radius = Math.hypot(positions.getX(index), positions.getY(index))
    uv.setXY(index, (radius - 1.35) / (2.15 - 1.35), 0.5)
  }
  applyTexture(textureSources.saturnRing, ring.material, true)
  saturn.add(ring)

  const labeledBodies = [sun, ...bodies]
  const earth = bodies[2]
  const north = new Vector3(0, 1, 0)
  const east = new Vector3()
  const vertical = new Vector3()
  const horizontal = new Vector3()
  const target = new Vector3()
  const up = new Vector3()
  const projected = new Vector3()
  let trueScale = false

  return {
    northSkyAngles() {
      vertical.copy(earth.position).normalize()
      east.crossVectors(north, vertical)
      return {
        yaw: Math.atan2(northSkyDirection.dot(east), northSkyDirection.dot(north)),
        pitch: Math.asin(northSkyDirection.dot(vertical)),
      }
    },
    setTrueScale(enabled: boolean) {
      trueScale = enabled
      sun.scale.setScalar(enabled ? physicalSunRadius : sunRadius)
      planets.forEach(({ orbit, radius, angle }, index) => {
        const [radiusKm, orbitMillionKm] = physicalPlanets[index]
        const distance = enabled ? orbitMillionKm * 1_000_000 / kmPerUnit : orbit
        orbitLines[index].scale.setScalar(distance / orbit)
        bodies[index].position.set(Math.cos(angle) * distance, 0, Math.sin(angle) * distance)
        bodies[index].scale.setScalar(enabled ? radiusKm / kmPerUnit : radius)
      })
    },
    resize(width: number, height: number, pixelRatio: number) {
      renderer.setPixelRatio(pixelRatio)
      stars.material.uniforms.pixelRatio.value = pixelRatio
      renderer.setSize(width, height, false)
      renderer.getDrawingBufferSize(stars.material.uniforms.viewportPixels.value)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    },
    draw(view: SolarView, yaw: number, pitch: number, zoom: number, galaxyComparison: boolean, panoramaOnly: boolean,
      label: (index: number, x: number, y: number, visible: boolean) => void,
      starLabel?: (name: string, x: number, y: number) => void,
      deepSkyMarker?: (index: number, x: number, y: number) => void,
      showConstellationLines = false,
      constellationLabel?: (name: string, x: number, y: number) => void) {
      const fromSurface = view === 'earth-surface'
      const earthOrbit = view === 'earth-orbit'
      const fov = fromSurface ? Math.min(85, defaultStarFov / Math.sqrt(zoom)) : 45
      const halfFov = Math.atan(Math.min(1, camera.aspect) * Math.tan(Math.PI / 8))
      const earthRadius = earth.scale.x
      const distance = earthOrbit
        ? Math.max(earthRadius * 1.2, earthRadius * 1.3 / Math.sin(halfFov) / zoom)
        : Math.max(trueScale ? physicalSunRadius * 1.2 : 0, sceneRadius / Math.sin(halfFov) / zoom)
      const near = earthOrbit
        ? Math.min(0.1, (distance - earthRadius) / 4)
        : trueScale && !fromSurface ? Math.min(0.1, distance / 100) : 0.1
      if (near !== camera.near || fov !== camera.fov) {
        camera.near = near
        camera.fov = fov
        camera.updateProjectionMatrix()
      }
      labeledBodies.forEach(body => { body.visible = !panoramaOnly && (!fromSurface || body !== earth) })
      orbitLines.forEach(line => { line.visible = view === 'solar' })
      const sinPitch = Math.sin(pitch)
      const cosPitch = Math.cos(pitch)
      if (fromSurface) {
        // Observe from the equator on the side facing away from the Sun.
        vertical.copy(earth.position).normalize()
        east.crossVectors(north, vertical)
        horizontal.copy(north).multiplyScalar(Math.cos(yaw)).addScaledVector(east, Math.sin(yaw))
        camera.position.copy(earth.position).addScaledVector(vertical, earthRadius)
        target.copy(camera.position)
          .addScaledVector(horizontal, cosPitch)
          .addScaledVector(vertical, sinPitch)
      } else {
        vertical.copy(north)
        horizontal.set(Math.sin(yaw), 0, Math.cos(yaw))
        target.set(0, 0, 0)
        if (earthOrbit) target.copy(earth.position)
        camera.position.copy(target)
          .addScaledVector(horizontal, cosPitch * distance)
          .addScaledVector(vertical, sinPitch * distance)
      }
      // The camera's up vector stays perpendicular to the sightline at both poles.
      camera.up.copy(vertical).multiplyScalar(cosPitch).addScaledVector(horizontal, -sinPitch)
      camera.lookAt(target)
      const panorama = highResolutionMilkyWay ?? standardMilkyWay
      if (sky.material.map !== panorama) {
        sky.material.map = panorama
        sky.material.needsUpdate = true
      }
      // Reflect the panorama, then rotate its matched bright stars into J2000.
      sky.scale.z = -500
      if (highResolutionMilkyWay) {
        sky.quaternion.set(0.48905151, 0.19576907, 0.69917039, -0.48338790).normalize()
      } else {
        sky.quaternion.set(0.48905864, 0.19582207, 0.69919361, -0.48332562).normalize()
      }
      sky.visible = (galaxyComparison || panoramaOnly) && Boolean(panorama)
      sky.position.copy(camera.position)
      stars.visible = !panoramaOnly
      constellationLines.visible = fromSurface && showConstellationLines
      stars.material.uniforms.comparison.value = fromSurface && sky.visible
      stars.position.copy(camera.position)
      const magnitudeGain = fromSurface ? starMagnitudeGain(fov) : 0
      const magnitudeLimit = Math.max(3.7, 4.5 + magnitudeGain)
      stars.material.uniforms.magnitudeGain.value = magnitudeGain
      stars.material.uniforms.magnitudeLimit.value = magnitudeLimit
      renderer.render(scene, camera)

      up.set(0, 1, 0).applyQuaternion(camera.quaternion)
      labeledBodies.forEach((body, index) => {
        projected.copy(body.position).addScaledVector(up, body.scale.x).project(camera)
        label(index, projected.x, projected.y, body.visible && Math.abs(projected.z) <= 1)
      })
      if (fromSurface && stars.visible && constellationLabel) {
        for (const { name, direction } of constellationDirections) {
          projected.copy(direction).applyMatrix4(stars.matrixWorld).project(camera)
          if (Math.abs(projected.z) <= 1 && Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1) {
            constellationLabel(name, projected.x, projected.y)
          }
        }
      }
      if (fromSurface && deepSkyMarker) {
        messierDirections.forEach((direction, index) => {
          projected.copy(camera.position).addScaledVector(direction, 500).project(camera)
          if (Math.abs(projected.z) <= 1 && Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1) {
            deepSkyMarker(index, projected.x, projected.y)
          }
        })
      }
      if (stars.visible && starLabel) {
        const positions = stars.geometry.attributes.position
        for (const { name, hasName, pointIndex, magnitude } of starLabels) {
          if (!fromSurface && !hasName) break
          if (magnitude >= magnitudeLimit) {
            if (!hasName) break
            continue
          }
          projected.fromBufferAttribute(positions, pointIndex).applyMatrix4(stars.matrixWorld).project(camera)
          if (Math.abs(projected.z) <= 1 && Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1) {
            starLabel(name, projected.x, projected.y)
          }
        }
      }
    },
    dispose() {
      disposed = true
      textures.forEach(texture => texture.dispose())
      sphere.dispose()
      orbitGeometries.forEach(geometry => geometry.dispose())
      orbitMaterial.dispose()
      sky.geometry.dispose()
      sky.material.dispose()
      stars.geometry.dispose()
      stars.material.dispose()
      constellationLines.geometry.dispose()
      constellationLines.material.dispose()
      labeledBodies.forEach(body => body.material.dispose())
      ring.geometry.dispose()
      ring.material.dispose()
      renderer.dispose()
    },
  }
}
