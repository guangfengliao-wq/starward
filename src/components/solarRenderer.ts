/// <reference types="vite/client" />
import {
  AmbientLight, BackSide, BufferGeometry, CatmullRomCurve3, ConeGeometry, CylinderGeometry, DoubleSide,
  GreaterDepth, Group, LineBasicMaterial, LineLoop, LineSegments, Mesh,
  Matrix4, MeshBasicMaterial, MeshLambertMaterial, PerspectiveCamera, PointLight, Quaternion,
  Ray, RingGeometry, Scene, Sphere, SphereGeometry, sRGBEncoding, Texture, TextureLoader, TubeGeometry,
  Vector3, WebGLRenderer,
} from 'three'
import textureSources from '../assets/planet-textures/sources.json'
import { createStarfield, defaultStarFov, equatorialDirection, starLabels, starMagnitudeGain } from './starfield'
import messierObjects from '../assets/messier.json'
import constellations from '../assets/constellations.json'
import { satelliteGroups } from './satellites'

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
  { id: 'mercury', name: '水星', orbit: 7, radius: 0.38, color: 0xada49b, angle: 0.65, hd: [textureSources.mercury8k, 8192] },
  { id: 'venus', name: '金星', orbit: 10, radius: 0.66, color: 0xe7bc79, angle: 2.35, hd: [textureSources.venus4k, 4096] },
  { id: 'earth', name: '地球', orbit: 14, radius: 0.7, color: 0x479bff, angle: 4.8, hd: [textureSources.earth8k, 8192] },
  { id: 'mars', name: '火星', orbit: 18, radius: 0.51, color: 0xe87d59, angle: 3.34, hd: [textureSources.mars8k, 8192] },
  { id: 'jupiter', name: '木星', orbit: 24, radius: 1.72, color: 0xdcb28e, angle: 0.3, hd: [textureSources.jupiter8k, 4096] },
  { id: 'saturn', name: '土星', orbit: 31, radius: 1.43, color: 0xe5cb96, angle: 5.5, hd: [textureSources.saturn8k, 4096] },
  { id: 'uranus', name: '天王星', orbit: 38, radius: 1.04, color: 0x86dce1, angle: 1.8, hd: undefined },
  { id: 'neptune', name: '海王星', orbit: 45, radius: 1.01, color: 0x627de5, angle: 3.9, hd: undefined },
] as const

export const orbitTargets = [...planets, { id: 'moon', name: '月球', hd: [textureSources.moon8k, 8192] }] as const
export type SolarView = 'solar' | 'earth-surface' | `${typeof orbitTargets[number]['id']}-orbit`
export const bodyNames = ['太阳', ...planets.map(({ name }) => name),
  ...planets.flatMap(({ id }) => (satelliteGroups[id] ?? []).map(([name]) => name))]

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
const fullTurn = Math.PI * 2
// NASA planetary sidereal periods, in Earth days.
const planetPeriods = [88, 224.7, 365.2, 687, 4331, 10747, 30589, 59800]
// NASA sidereal rotation periods in hours. Negative values indicate retrograde spin.
const rotationHours = [1407.6, -5832.5, 23.9, 24.6, 9.9, 10.7, -17.2, 16.1]
const spinRates = rotationHours.map(hours => {
  // Compress the range so even slow rotators move visibly during the demo.
  const secondsPerTurn = 5 + 4 * Math.log2(Math.abs(hours) / 9.9)
  // Increasing orbital phase moves from +X toward +Z, around the negative Y axis.
  return -Math.sign(hours) * fullTurn / secondsPerTurn
})

function createSpinAxis() {
  const pole = 1.32
  const radius = 0.36
  const arcEnd = Math.PI * 1.3
  const arc = Array.from({ length: 25 }, (_, index) => {
    const angle = index / 24 * arcEnd
    return new Vector3(radius * Math.cos(angle), pole, radius * Math.sin(angle))
  })
  const marker = new Group()
  const color = 0x8de9ff
  const visible = new MeshBasicMaterial({ color, depthWrite: false, transparent: true })
  // Draw a faint second pass only where the scene depth hides the marker.
  const occluded = new MeshBasicMaterial({
    color, depthFunc: GreaterDepth, depthWrite: false, transparent: true, opacity: 0.32,
  })
  const shaft = new CylinderGeometry(0.013, 0.013, pole * 2, 10)
  const curve = new TubeGeometry(new CatmullRomCurve3(arc), 32, 0.019, 8, false)
  const headLength = 0.17
  const head = new ConeGeometry(0.065, headLength, 12)
  const tangent = new Vector3(-Math.sin(arcEnd), 0, Math.cos(arcEnd))
  head.rotateX(Math.PI / 2)
  head.rotateY(Math.atan2(tangent.x, tangent.z))
  const center = arc[arc.length - 1].clone().addScaledVector(tangent, headLength / 2)
  head.translate(center.x, center.y, center.z)

  const geometries = [shaft, curve, head]
  for (const geometry of geometries) {
    const front = new Mesh(geometry, visible)
    front.renderOrder = 2
    marker.add(front, new Mesh(geometry, occluded))
  }
  return {
    marker,
    setOpacity(opacity: number) {
      visible.opacity = opacity
      occluded.opacity = opacity * 0.32
    },
    dispose() {
      geometries.forEach(geometry => geometry.dispose())
      visible.dispose()
      occluded.dispose()
    },
  }
}

export function createSolarRenderer(canvas: HTMLCanvasElement, invalidate: () => void) {
  const context = canvas.getContext('webgl2', { antialias: true, alpha: true })
  if (!context) return

  const renderer = new WebGLRenderer({ canvas, context, alpha: true })
  renderer.setClearColor(0, 0)
  renderer.outputEncoding = sRGBEncoding

  const loader = new TextureLoader()
  const textures = new Set<Texture>()
  let detailMaterial: MeshLambertMaterial | undefined
  let detailTexture: Texture | undefined
  let standardMap: Texture | null = null
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
    textures.add(texture)
    return texture
  }

  function applyTexture(filename: string, material: MeshBasicMaterial | MeshLambertMaterial,
    transparent = false) {
    loadTexture(filename, loaded => {
      if (material === detailMaterial && detailTexture && material.map === detailTexture) {
        standardMap = loaded
        return
      }
      material.map = loaded
      material.color.setHex(0xffffff)
      material.transparent = transparent
      material.alphaTest = transparent ? 0.02 : 0
      material.depthWrite = !transparent
      material.needsUpdate = true
    })
  }

  function focusTexture(material: MeshLambertMaterial | undefined, detail: readonly [string, number] | undefined) {
    if (material === detailMaterial) return
    if (detailMaterial && detailTexture) {
      if (detailMaterial.map === detailTexture) {
        detailMaterial.map = standardMap
        detailMaterial.needsUpdate = true
      }
      textures.delete(detailTexture)
      detailTexture.dispose()
    }
    detailMaterial = material
    detailTexture = undefined
    standardMap = null
    if (!material || !detail) return
    const [filename, width] = detail
    if (renderer.capabilities.maxTextureSize < width) return
    detailTexture = loadTexture(filename, loaded => {
      if (loaded !== detailTexture) return
      standardMap = material.map
      material.map = loaded
      material.color.setHex(0xffffff)
      material.needsUpdate = true
    })
  }

  const scene = new Scene()
  const { marker: spinAxis, setOpacity: setSpinAxisOpacity, dispose: disposeSpinAxis } = createSpinAxis()
  scene.add(spinAxis)
  const camera = new PerspectiveCamera(45, 1, 0.1, 1000)
  const sphere = new SphereGeometry(1, 32, 20)
  const detailSphere = new SphereGeometry(1, 96, 64)
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

  const bodies = planets.map(({ id, orbit, angle, radius, color }) => {
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
    applyTexture(textureSources[id], mesh.material)
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
  scene.add(ring)

  const earth = bodies[2]
  const satelliteOrbit = new BufferGeometry().setFromPoints(Array.from({ length: orbitSegments }, (_, index) => {
    const phase = index / orbitSegments * fullTurn
    return new Vector3(Math.cos(phase), 0, Math.sin(phase))
  }))
  const satellites = planets.flatMap(({ id, radius }, planetIndex) =>
    (satelliteGroups[id] ?? []).map(([, distanceKm, period, radiusKm, color, inclination = 0], index) => {
      const parent = bodies[planetIndex]
      const mesh = new Mesh(sphere, new MeshLambertMaterial({ color }))
      const line = new LineLoop(satelliteOrbit, orbitMaterial)
      line.rotation.x = inclination * Math.PI / 180
      const displayDistance = parent === earth ? 2.1 : radius * (parent === saturn ? 2.15 : 1) + 0.48 + index * 0.43
      const displayRadius = Math.max(0.055, Math.min(0.24, radiusKm / 9000))
      scene.add(mesh, line)
      return { parent, mesh, line, distanceKm, period, radiusKm, displayDistance, displayRadius, phase: 0.54 + index * 2.4 }
    }))
  const lunarOrbit = satellites[0]
  const moon = lunarOrbit.mesh
  applyTexture(textureSources.moon, moon.material)

  const orbitBodies = [...bodies, moon]
  const labeledBodies = [sun, ...bodies, ...satellites.map(({ mesh }) => mesh)]
  let focusedBody: typeof moon | undefined
  const north = new Vector3(0, 1, 0)
  const origin = new Vector3()
  const vertical = new Vector3()
  const horizontal = new Vector3()
  const target = new Vector3()
  const up = new Vector3()
  const projected = new Vector3()
  const skyPoint = new Vector3()
  const skyRay = new Ray()
  const bodyBounds = new Sphere()
  const hitPoint = new Vector3()
  const orientation = new Quaternion()
  const dragRotation = new Quaternion()
  const previousRay = new Vector3()
  const currentRay = new Vector3()
  const basis = new Matrix4()
  let trueScale = false
  let planetDays = 0
  let satelliteDays = 0
  let moonDays = 0

  function projectVisibleSkyPoint() {
    projected.copy(skyPoint).project(camera)
    if (Math.abs(projected.z) > 1 || Math.abs(projected.x) >= 1 || Math.abs(projected.y) >= 1) return false
    // DOM labels sit above the canvas, so check the same foreground bodies that hide the sky.
    const distanceSquared = camera.position.distanceToSquared(skyPoint)
    skyRay.origin.copy(camera.position)
    skyRay.direction.subVectors(skyPoint, camera.position).normalize()
    return !labeledBodies.some(body => {
      if (!body.visible) return false
      bodyBounds.set(body.position, body.scale.x)
      const hit = skyRay.intersectSphere(bodyBounds, hitPoint)
      return hit !== null && camera.position.distanceToSquared(hit) < distanceSquared
    })
  }

  function updatePositions() {
    planets.forEach(({ orbit, angle }, index) => {
      const phase = angle + planetDays % planetPeriods[index] / planetPeriods[index] * fullTurn
      const distance = orbit * orbitLines[index].scale.x
      bodies[index].position.set(Math.cos(phase) * distance, 0, Math.sin(phase) * distance)
    })
    ring.position.copy(saturn.position)
    for (const { parent, mesh, line, period, phase } of satellites) {
      const days = mesh === moon ? moonDays : satelliteDays
      const angle = phase + days % period / period * fullTurn
      const distance = line.scale.x
      const z = Math.sin(angle) * distance
      mesh.position.set(Math.cos(angle) * distance, -z * Math.sin(line.rotation.x), z * Math.cos(line.rotation.x))
      mesh.position.add(parent.position)
      line.position.copy(parent.position)
    }
  }

  const controls = {
    resetOrientation(view: SolarView, northSky = false) {
      if (view === 'earth-surface') {
        vertical.copy(earth.position).normalize()
        horizontal.copy(north)
      } else {
        vertical.copy(north)
        horizontal.set(0, 0, 1)
      }
      const pitch = view === 'solar' ? 1.08 : 0.65
      up.copy(vertical).multiplyScalar(Math.cos(pitch)).addScaledVector(horizontal, -Math.sin(pitch))
      target.copy(horizontal).multiplyScalar(Math.cos(pitch)).addScaledVector(vertical, Math.sin(pitch))
      if (view === 'earth-surface') {
        if (northSky) {
          target.copy(northSkyDirection)
          up.copy(vertical)
        }
        target.negate()
      }
      orientation.setFromRotationMatrix(basis.lookAt(target, origin, up))
    },
    rotate(previousX: number, previousY: number, currentX: number, currentY: number) {
      const projection = camera.projectionMatrix.elements
      previousRay.set(previousX / projection[0], previousY / projection[5], -1).normalize()
      currentRay.set(currentX / projection[0], currentY / projection[5], -1).normalize()
      // Rotate the camera so the new pointer ray meets the previous world direction.
      dragRotation.setFromUnitVectors(currentRay, previousRay)
      orientation.multiply(dragRotation).normalize()
    },
    setTrueScale(enabled: boolean) {
      trueScale = enabled
      sun.scale.setScalar(enabled ? physicalSunRadius : sunRadius)
      planets.forEach(({ orbit, radius }, index) => {
        const [radiusKm, orbitMillionKm] = physicalPlanets[index]
        const distance = enabled ? orbitMillionKm * 1_000_000 / kmPerUnit : orbit
        orbitLines[index].scale.setScalar(distance / orbit)
        bodies[index].scale.setScalar(enabled ? radiusKm / kmPerUnit : radius)
      })
      ring.scale.copy(saturn.scale)
      for (const { mesh, line, radiusKm, distanceKm, displayRadius, displayDistance } of satellites) {
        mesh.scale.setScalar(enabled ? radiusKm / kmPerUnit : displayRadius)
        line.scale.setScalar(enabled ? distanceKm / kmPerUnit : displayDistance)
      }
      updatePositions()
    },
    advanceTime(seconds: number, view: SolarView) {
      // Separate demonstration rates keep the fastest moons and slow planets observable.
      planetDays += seconds * 15
      satelliteDays += seconds * 0.5
      // Make one lunar revolution visible in about eight seconds in the schematic overview.
      moonDays += seconds * (view === 'solar' && !trueScale ? lunarOrbit.period / 8 : 0.5)
      bodies.forEach((body, index) => {
        body.rotation.y = (body.rotation.y + seconds * spinRates[index]) % fullTurn
      })
      updatePositions()
    },
    satelliteOverviewZoom(view: SolarView) {
      const parent = bodies[planets.findIndex(({ id }) => view === `${id}-orbit`)]
      if (!parent) return 1
      const frameRadius = parent.scale.x * (parent === saturn ? 2.15 : 1)
      const extent = satellites.reduce((outer, { parent: host, line, mesh }) =>
        host === parent ? Math.max(outer, line.scale.x + mesh.scale.x) : outer, frameRadius)
      return frameRadius / extent
    },
    resize(width: number, height: number, pixelRatio: number) {
      renderer.setPixelRatio(pixelRatio)
      stars.material.uniforms.pixelRatio.value = pixelRatio
      renderer.setSize(width, height, false)
      renderer.getDrawingBufferSize(stars.material.uniforms.viewportPixels.value)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    },
    draw(view: SolarView, zoom: number, galaxyComparison: boolean, panoramaOnly: boolean,
      label: (index: number, x: number, y: number, visible: boolean) => void,
      starLabel?: (name: string, x: number, y: number) => void,
      deepSkyMarker?: (index: number, x: number, y: number) => void,
      showConstellationLines = false,
      constellationLabel?: (name: string, x: number, y: number) => void,
      spinAxisOpacity = 0) {
      const fromSurface = view === 'earth-surface'
      const orbitIndex = orbitTargets.findIndex(({ id }) => view === `${id}-orbit`)
      const orbitBody = orbitBodies[orbitIndex]
      const axisPlanet = bodies[orbitIndex]
      spinAxis.visible = Boolean(axisPlanet) && spinAxisOpacity > 0
      if (axisPlanet && spinAxis.visible) {
        setSpinAxisOpacity(spinAxisOpacity)
        spinAxis.position.copy(axisPlanet.position)
        spinAxis.scale.setScalar(axisPlanet.scale.x)
        // The arc moves from +X toward +Z, matching negative Y rotation.
        if (spinRates[orbitIndex] > 0) spinAxis.scale.z *= -1
      }
      if (orbitBody !== focusedBody) {
        if (focusedBody) focusedBody.geometry = sphere
        if (orbitBody) orbitBody.geometry = detailSphere
        focusedBody = orbitBody
      }
      focusTexture(orbitBody?.material, orbitTargets[orbitIndex]?.hd)
      const fov = fromSurface ? Math.min(85, defaultStarFov / Math.sqrt(zoom)) : 45
      const halfFov = Math.atan(Math.min(1, camera.aspect) * Math.tan(Math.PI / 8))
      const earthRadius = earth.scale.x
      const radius = orbitBody?.scale.x ?? 0
      const frameRadius = orbitBody === saturn ? radius * 2.15 : radius
      const distance = orbitBody
        ? Math.max(radius * 1.2, frameRadius * 1.3 / Math.sin(halfFov) / zoom)
        : Math.max(trueScale ? physicalSunRadius * 1.2 : 0, sceneRadius / Math.sin(halfFov) / zoom)
      const near = orbitBody
        ? Math.min(0.1, (distance - radius) / 4)
        : trueScale && !fromSurface ? Math.min(0.1, distance / 100) : 0.1
      if (near !== camera.near || fov !== camera.fov) {
        camera.near = near
        camera.fov = fov
        camera.updateProjectionMatrix()
      }
      labeledBodies.forEach(body => { body.visible = !panoramaOnly && (!fromSurface || body !== earth) })
      ring.visible = saturn.visible
      orbitLines.forEach(line => { line.visible = view === 'solar' })
      satellites.forEach(({ line, parent }) => { line.visible = orbitBody === parent })
      const schematicOverview = view === 'solar' && !trueScale
      moon.scale.setScalar(trueScale ? lunarOrbit.radiusKm / kmPerUnit :
        schematicOverview ? 0.38 : lunarOrbit.displayRadius)
      if (fromSurface) {
        // Observe from the equator on the side facing away from the Sun.
        vertical.copy(earth.position).normalize()
        camera.position.copy(earth.position).addScaledVector(vertical, earthRadius)
      } else {
        camera.position.set(0, 0, distance).applyQuaternion(orientation)
        if (orbitBody) camera.position.add(orbitBody.position)
      }
      camera.quaternion.copy(orientation)
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
        const satellite = satellites[index - bodies.length - 1]
        projected.copy(body.position).addScaledVector(up, body.scale.x).project(camera)
        const showLabel = !satellite || (view !== 'solar' && (body === moon || satellite.parent === orbitBody))
        label(index, projected.x, projected.y, showLabel && body.visible && Math.abs(projected.z) <= 1)
      })
      if (fromSurface && stars.visible && constellationLabel) {
        for (const { name, direction } of constellationDirections) {
          skyPoint.copy(direction).applyMatrix4(stars.matrixWorld)
          if (projectVisibleSkyPoint()) {
            constellationLabel(name, projected.x, projected.y)
          }
        }
      }
      if (fromSurface && deepSkyMarker) {
        messierDirections.forEach((direction, index) => {
          skyPoint.copy(camera.position).addScaledVector(direction, 500)
          if (projectVisibleSkyPoint()) {
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
          skyPoint.fromBufferAttribute(positions, pointIndex).applyMatrix4(stars.matrixWorld)
          if (projectVisibleSkyPoint()) {
            starLabel(name, projected.x, projected.y)
          }
        }
      }
    },
    dispose() {
      disposed = true
      textures.forEach(texture => texture.dispose())
      sphere.dispose()
      detailSphere.dispose()
      orbitGeometries.forEach(geometry => geometry.dispose())
      satelliteOrbit.dispose()
      orbitMaterial.dispose()
      disposeSpinAxis()
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
  controls.setTrueScale(false)
  return controls
}
