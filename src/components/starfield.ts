import { BufferGeometry, Float32BufferAttribute, Points, ShaderMaterial, Vector2 } from 'three'
import brightStars from '../assets/hipparcos-bright.json'
import iauStarNames from '../assets/iau-star-names.json'

const chineseStarNames: Partial<Record<number, string>> = {
  32349: '天狼星', 30438: '老人星', 69673: '大角星', 91262: '织女星',
  24608: '五车二', 24436: '参宿七', 37279: '南河三', 7588: '水委一',
  27989: '参宿四', 97649: '牛郎星', 60718: '十字架二', 21421: '毕宿五',
  65474: '角宿一', 80763: '心宿二', 37826: '北河三', 113368: '北落师门',
  102098: '天津四', 49669: '轩辕十四', 11767: '北极星', 54061: '天枢',
  53910: '天璇', 58001: '天玑', 59774: '天权', 62956: '玉衡', 65378: '开阳',
  67301: '摇光', 25336: '参宿五', 26311: '参宿二', 26727: '参宿一', 25930: '参宿三',
}

const properNames: Partial<Record<number, string>> = iauStarNames
export const starLabels = brightStars.map(([hip, , , magnitude], pointIndex) => {
  const name = chineseStarNames[hip] ?? properNames[hip]
  return { name: name ?? `HIP ${hip}`, hasName: Boolean(name), pointIndex, magnitude }
}).sort((a, b) => Number(b.hasName) - Number(a.hasName) || a.magnitude - b.magnitude)

export const defaultStarFov = 45

export function starMagnitudeGain(fov: number) {
  const magnification = Math.tan(defaultStarFov * Math.PI / 360) / Math.tan(fov * Math.PI / 360)
  // Simulate exposure proportional to the square of angular magnification.
  return 5 * Math.log10(magnification)
}

export function equatorialDirection(ra: number, dec: number): [number, number, number] {
  const latitude = dec * Math.PI / 180
  const longitude = ra * Math.PI / 180
  const equatorialRadius = Math.cos(latitude)
  // North is +Y, and right ascension increases from +X toward -Z.
  return [
    equatorialRadius * Math.cos(longitude),
    Math.sin(latitude),
    -equatorialRadius * Math.sin(longitude),
  ]
}

export function createStarfield() {
  const positions = []
  const magnitudes = []

  for (const [, ra, dec, magnitude] of brightStars) {
    positions.push(...equatorialDirection(ra, dec))
    magnitudes.push(magnitude)
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('magnitude', new Float32BufferAttribute(magnitudes, 1))

  const material = new ShaderMaterial({
    uniforms: {
      pixelRatio: { value: 1 },
      pointScale: { value: 1.4 },
      comparison: { value: false },
      viewportPixels: { value: new Vector2(1, 1) },
      magnitudeGain: { value: 0 },
      magnitudeLimit: { value: 4.5 },
    },
    transparent: true,
    depthWrite: false,
    vertexShader: `
      attribute float magnitude;
      uniform float pixelRatio;
      uniform float pointScale;
      uniform vec2 viewportPixels;
      uniform float magnitudeGain;
      uniform float magnitudeLimit;
      varying float brightness;
      varying float visibility;
      varying vec2 centerPixel;
      void main() {
        float effectiveMagnitude = magnitude - magnitudeGain;
        float flux = pow(10.0, -0.4 * (effectiveMagnitude + 1.44));
        float signal = pow(flux, 0.4);
        brightness = signal / (signal + 0.35);
        visibility = 1.0 - smoothstep(magnitudeLimit - 0.35, magnitudeLimit, magnitude);
        gl_PointSize = 2.0 * ceil(3.0 * pixelRatio * pointScale) + 1.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        centerPixel = vec2(0.0);
        if (gl_Position.w > 0.0) {
          vec2 projectedPixel = (gl_Position.xy / gl_Position.w * 0.5 + 0.5) * viewportPixels;
          centerPixel = floor(projectedPixel) + 0.5;
          gl_Position.xy = (centerPixel / viewportPixels * 2.0 - 1.0) * gl_Position.w;
        }
      }
    `,
    fragmentShader: `
      uniform float pixelRatio;
      uniform float pointScale;
      uniform bool comparison;
      varying float brightness;
      varying float visibility;
      varying vec2 centerPixel;
      void main() {
        float radius = length(gl_FragCoord.xy - centerPixel) / (pixelRatio * pointScale);
        float coreRadius = mix(0.65, 1.2, brightness);
        float core = 1.0 - smoothstep(coreRadius, coreRadius + 0.32, radius);
        float halo = (1.0 - smoothstep(1.0, 2.6, radius)) * smoothstep(0.65, 1.0, brightness);
        float opacity = (core * brightness + halo * 0.10) * visibility;
        vec3 color = comparison ? vec3(1.0, 0.62, 0.24) : vec3(0.94, 0.97, 1.0);
        gl_FragColor = vec4(color, min(1.0, opacity));
      }
    `,
  })
  const stars = new Points(geometry, material)
  stars.scale.setScalar(500)
  stars.visible = false
  return stars
}
