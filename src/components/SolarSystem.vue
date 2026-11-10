<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppUpdate from './AppUpdate.vue'
import { bodyNames, createSolarRenderer, orbitTargets, type SolarView } from './solarRenderer'
import messierObjects from '../assets/messier.json'

const views: { value: SolarView; name: string }[] = [
  { value: 'solar', name: '太阳系' },
  { value: 'earth-surface', name: '地面仰望' },
  ...orbitTargets.map(({ id, name }) => ({ value: `${id}-orbit` as const, name: `${name}上空` })),
]
const view = ref<SolarView>('solar')
const viewName = computed(() => views.find(({ value }) => value === view.value)?.name ?? views[0].name)
const openPanel = ref<'view' | 'settings' | null>(null)
const viewTrigger = ref<HTMLButtonElement>()
const settingsTrigger = ref<HTMLButtonElement>()
const surface = ref<HTMLDivElement>()
const canvas = ref<HTMLCanvasElement>()
const labels = ref<HTMLDivElement>()
const starLabels = ref<HTMLDivElement>()
const deepSkyMarkers = ref<HTMLDivElement>()
const starLabelSlots = 40
const message = ref('')
const trueScale = ref(false)
const galaxyComparison = ref(true)
const showDeepSky = ref(true)
const showConstellationLines = ref(true)
const showConstellationNames = ref(true)
const showAnnotations = ref(true)
const timeLapse = ref(false)
const onlyGalaxy = ref(false)
const panoramaOnly = computed(() => view.value === 'earth-surface' && onlyGalaxy.value)
let resetView = () => {}
let toggleScale = () => {}
let toggleGalaxyComparison = () => {}
let toggleDeepSky = () => {}
let toggleOnlyGalaxy = () => {}
let showNorthSky = () => {}
let toggleTimeLapse = () => {}
let dispose = () => {}

function closePanel(restoreFocus = false) {
  if (!openPanel.value) return
  const trigger = openPanel.value === 'view' ? viewTrigger.value : settingsTrigger.value
  openPanel.value = null
  if (restoreFocus) trigger?.focus()
}

function selectView(value: SolarView) {
  if (view.value !== value) {
    view.value = value
    resetView()
  }
  closePanel(true)
}

onMounted(() => {
  const host = surface.value!
  const drawing = canvas.value!
  const captions = Array.from(labels.value!.children) as HTMLElement[]
  const starCaptions = Array.from(starLabels.value!.children) as HTMLElement[]
  const markers = Array.from(deepSkyMarkers.value!.children) as HTMLElement[]
  const listeners = new AbortController()
  const options = { signal: listeners.signal }
  let renderer: ReturnType<typeof createSolarRenderer> | undefined
  let contextLost = false
  let lastWidth = 0
  let lastHeight = 0
  let lastPixelRatio = 0
  let zoom = 1
  let wheelTimer: number | undefined
  let animationFrame = 0
  let previousFrame: number | undefined
  let axisFadeFrame = 0
  let axisOpacity = 0
  const pointers = new Map<number, PointerEvent>()

  function render() {
    const { clientWidth: width, clientHeight: height } = host
    if (!renderer || contextLost || !width || !height) return
    const pixelRatio = Math.min(window.devicePixelRatio, 2)
    if (width !== lastWidth || height !== lastHeight || pixelRatio !== lastPixelRatio) {
      renderer.resize(width, height, pixelRatio)
      lastWidth = width
      lastHeight = height
      lastPixelRatio = pixelRatio
    }

    starCaptions.forEach(caption => { caption.hidden = true })
    markers.forEach(marker => { marker.hidden = true })
    const showStarNames = !panoramaOnly.value && pointers.size === 0 && wheelTimer === undefined
    const occupied: DOMRect[] = []
    const bounds = showStarNames ? host.getBoundingClientRect() : undefined
    const labelLimit = Math.min(starLabelSlots, Math.max(8, Math.floor(width * height / 12_000)))
    let placedLabels = 0
    function placeLabel(name: string, x: number, y: number, kind?: 'deep-sky' | 'constellation') {
      if (!bounds || placedLabels >= labelLimit) return
      const caption = starCaptions[placedLabels]
      caption.textContent = name
      caption.classList.toggle('deep-sky-caption', kind === 'deep-sky')
      caption.classList.toggle('constellation-caption', kind === 'constellation')
      caption.style.left = (x + 1) * width / 2 + 'px'
      caption.style.top = (1 - y) * height / 2 + 'px'
      caption.hidden = false
      const rect = caption.getBoundingClientRect()
      const overlaps = occupied.some(other =>
        rect.left < other.right + 6 && rect.right > other.left - 6 &&
        rect.top < other.bottom + 4 && rect.bottom > other.top - 4
      )
      caption.hidden = overlaps || rect.left < bounds.left + 4 || rect.right > bounds.right - 4 ||
        rect.top < bounds.top + 4 || rect.bottom > bounds.bottom - 4
      if (!caption.hidden) {
        occupied.push(rect)
        placedLabels++
      }
    }

    renderer.draw(view.value, zoom, galaxyComparison.value, panoramaOnly.value, (index, x, y, visible) => {
      const left = (x + 1) * width / 2
      const top = (1 - y) * height / 2
      const caption = captions[index]
      caption.hidden = !visible || left < 22 || left > width - 22 || top < 22 || top > height - 12
      caption.style.left = left + 'px'
      caption.style.top = top + 'px'
      if (bounds && !caption.hidden) occupied.push(caption.getBoundingClientRect())
    }, bounds ? placeLabel : undefined, showDeepSky.value && !panoramaOnly.value && view.value === 'earth-surface' ? (index, x, y) => {
      const marker = markers[index]
      marker.style.left = (x + 1) * width / 2 + 'px'
      marker.style.top = (1 - y) * height / 2 + 'px'
      marker.hidden = false
      const { id, name } = messierObjects[index]
      placeLabel(name ? `${id} ${name}` : id, x, y, 'deep-sky')
    } : undefined, showConstellationLines.value, bounds && showConstellationNames.value
      ? (name, x, y) => placeLabel(name, x, y, 'constellation')
      : undefined, showAnnotations.value ? axisOpacity : 0)
  }

  function clearAxisFade(opacity = 0) {
    cancelAnimationFrame(axisFadeFrame)
    axisFadeFrame = 0
    axisOpacity = opacity
  }

  function fadeAxis() {
    if (!axisOpacity || axisFadeFrame) return
    const startedAt = performance.now()
    const fadeDuration = 300
    function tick(timestamp: number) {
      axisOpacity = 1 - Math.min(1, Math.max(0, timestamp - startedAt) / fadeDuration)
      axisFadeFrame = axisOpacity > 0 ? requestAnimationFrame(tick) : 0
      if (!timeLapse.value) render()
    }
    axisFadeFrame = requestAnimationFrame(tick)
  }

  function initialize() {
    try {
      renderer = createSolarRenderer(drawing, render)
      renderer?.resetOrientation(view.value)
      message.value = renderer ? '' : '此设备暂时无法显示三维太阳系。'
      render()
    } catch (error) {
      console.error(error)
      message.value = '三维视图初始化失败。'
    }
  }

  resetView = () => {
    clearAxisFade()
    renderer?.resetOrientation(view.value)
    zoom = timeLapse.value ? renderer?.satelliteOverviewZoom(view.value) ?? 1 : 1
    render()
  }

  function animate(timestamp: number) {
    if (previousFrame !== undefined && !contextLost && !document.hidden) {
      renderer?.advanceTime(Math.min((timestamp - previousFrame) / 1000, 0.05), view.value)
      render()
    }
    previousFrame = timestamp
    animationFrame = requestAnimationFrame(animate)
  }

  toggleTimeLapse = () => {
    if (!renderer) return
    timeLapse.value = !timeLapse.value
    if (timeLapse.value) {
      zoom = Math.min(zoom, renderer.satelliteOverviewZoom(view.value))
      previousFrame = undefined
      animationFrame = requestAnimationFrame(animate)
      render()
    } else {
      cancelAnimationFrame(animationFrame)
      render()
    }
  }

  showNorthSky = () => {
    if (!renderer) return
    renderer.resetOrientation(view.value, true)
    zoom = 0.28
    render()
  }

  toggleScale = () => {
    if (!renderer) return
    trueScale.value = !trueScale.value
    renderer.setTrueScale(trueScale.value)
    zoom = timeLapse.value ? renderer.satelliteOverviewZoom(view.value) : 1
    render()
  }

  toggleGalaxyComparison = () => {
    galaxyComparison.value = !galaxyComparison.value
    render()
  }

  toggleDeepSky = () => {
    showDeepSky.value = !showDeepSky.value
    render()
  }

  toggleOnlyGalaxy = () => {
    onlyGalaxy.value = !onlyGalaxy.value
    render()
  }

  function changeZoom(factor: number) {
    const maxZoom = view.value === 'solar' && trueScale.value ? 12_000 : 8
    const minZoom = view.value === 'earth-surface' ? 0.28 :
      Math.min(0.65, renderer?.satelliteOverviewZoom(view.value) ?? 1)
    zoom = Math.max(minZoom, Math.min(maxZoom, zoom * factor))
  }

  drawing.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || pointers.size >= 2) return
    drawing.setPointerCapture(event.pointerId)
    pointers.set(event.pointerId, event)
    if (pointers.size === 2) fadeAxis()
    render()
  }, options)

  drawing.addEventListener('pointermove', (event) => {
    const previous = pointers.get(event.pointerId)
    if (!previous) return
    pointers.set(event.pointerId, event)
    if (pointers.size === 2) {
      const other = [...pointers.values()].find((pointer) => pointer.pointerId !== event.pointerId)!
      const before = Math.hypot(previous.clientX - other.clientX, previous.clientY - other.clientY)
      const after = Math.hypot(event.clientX - other.clientX, event.clientY - other.clientY)
      if (before > 0 && after > 0) changeZoom(after / before)
    } else {
      const { left, top, width, height } = drawing.getBoundingClientRect()
      if (width > 0 && height > 0) {
        if (showAnnotations.value && view.value.endsWith('-orbit') && view.value !== 'moon-orbit' &&
          (previous.clientX !== event.clientX || previous.clientY !== event.clientY)) clearAxisFade(1)
        renderer?.rotate(
          2 * (previous.clientX - left) / width - 1,
          1 - 2 * (previous.clientY - top) / height,
          2 * (event.clientX - left) / width - 1,
          1 - 2 * (event.clientY - top) / height,
        )
      }
    }
    render()
  }, options)

  for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
    drawing.addEventListener(eventName, (event) => {
      const wasActive = pointers.delete(event.pointerId)
      if (wasActive && pointers.size === 0) {
        fadeAxis()
        render()
      }
    }, options)
  }

  drawing.addEventListener('wheel', (event) => {
    event.preventDefault()
    const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? host.clientHeight : 1
    changeZoom(Math.exp(-event.deltaY * units * 0.001))
    window.clearTimeout(wheelTimer)
    wheelTimer = window.setTimeout(() => {
      wheelTimer = undefined
      render()
    }, 180)
    render()
  }, { ...options, passive: false })

  initialize()

  drawing.addEventListener('webglcontextlost', (event) => {
    event.preventDefault()
    contextLost = true
    pointers.clear()
    clearAxisFade()
    message.value = '三维视图已暂停，正在等待恢复。'
  }, options)
  drawing.addEventListener('webglcontextrestored', () => {
    if (!renderer) return
    contextLost = false
    message.value = ''
    render()
  }, options)

  const observer = new ResizeObserver(render)
  observer.observe(host)
  watch([showAnnotations, showConstellationLines, showConstellationNames], render)

  dispose = () => {
    cancelAnimationFrame(animationFrame)
    clearAxisFade()
    listeners.abort()
    observer.disconnect()
    window.clearTimeout(wheelTimer)
    renderer?.dispose()
  }
})

onBeforeUnmount(() => dispose())
</script>

<template>
  <div class="solar-system" @keydown.esc="closePanel(true)">
    <div ref="surface" class="surface"
      :class="{ 'surface-night': view === 'earth-surface', 'hide-annotations': !showAnnotations || panoramaOnly }">
      <canvas ref="canvas" :aria-label="`${viewName}三维视图`"></canvas>
      <div v-show="!message" ref="labels" class="labels" aria-hidden="true">
        <span v-for="name in bodyNames" :key="name" hidden>{{ name }}</span>
      </div>
      <div v-show="!message" ref="starLabels" class="labels star-labels" aria-hidden="true">
        <span v-for="slot in starLabelSlots" :key="slot" hidden></span>
      </div>
      <div v-show="!message" ref="deepSkyMarkers" class="labels" aria-hidden="true">
        <i v-for="object in messierObjects" :key="object.id" class="deep-sky-marker" :data-kind="object.kind" hidden></i>
      </div>
      <p v-if="message" class="message" role="status">{{ message }}</p>
    </div>
    <div v-if="openPanel" class="panel-dismiss" aria-hidden="true" @pointerdown="closePanel()"></div>
    <div class="view-bar">
      <div class="view-controls glass-dock">
        <div class="toolbar-group">
          <button ref="viewTrigger" class="mode-button toolbar-button" type="button"
            :aria-label="`观测视角 · ${viewName}`" :aria-expanded="openPanel === 'view'"
            :disabled="Boolean(message)" @click="openPanel = openPanel === 'view' ? null : 'view'">
            {{ viewName }} <span class="chevron" aria-hidden="true"></span>
          </button>
          <section v-if="openPanel === 'view'" class="toolbar-popover glass-surface" aria-label="观测视角">
            <button v-for="{ name, value } in views" :key="value" class="popover-item" type="button"
              :aria-pressed="view === value" @click="selectView(value)">
              {{ name }} <span v-if="view === value" aria-hidden="true">✓</span>
            </button>
          </section>
        </div>
        <button class="mode-button" type="button" role="switch" :aria-checked="showAnnotations"
          :disabled="Boolean(message) || panoramaOnly" @click="showAnnotations = !showAnnotations">
          <span class="mode-dot" aria-hidden="true"></span>显示标注
        </button>
        <button class="mode-button" type="button" :aria-pressed="timeLapse"
          :disabled="Boolean(message)" @click="toggleTimeLapse" aria-label="轨道延时演示">
          <span aria-hidden="true">{{ timeLapse ? 'Ⅱ' : '▷' }}</span>延时
        </button>
        <div class="toolbar-group settings-group">
          <button ref="settingsTrigger" class="mode-button toolbar-button" type="button"
            :aria-expanded="openPanel === 'settings'" :disabled="Boolean(message)"
            @click="openPanel = openPanel === 'settings' ? null : 'settings'">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h16" />
              <path d="M8 4v4m8 2v4m-6 2v4" stroke-width="3" />
            </svg>
            设置
          </button>
          <section v-if="openPanel === 'settings'" class="toolbar-popover glass-surface" aria-label="星图设置">
            <button v-if="view === 'earth-surface'" class="popover-item" type="button" role="switch"
              :aria-checked="onlyGalaxy" :disabled="Boolean(message)" @click="toggleOnlyGalaxy">
              <span class="mode-dot" aria-hidden="true"></span>仅银河贴图
            </button>
            <button class="popover-item" type="button" role="switch"
              :aria-checked="galaxyComparison" :disabled="Boolean(message) || panoramaOnly" @click="toggleGalaxyComparison">
              <span class="mode-dot" aria-hidden="true"></span>{{ view === 'earth-surface' ? '银河对照' : '银河背景' }}
            </button>
            <button v-if="view === 'earth-surface'" class="popover-item" type="button" role="switch"
              :aria-checked="showConstellationLines" :disabled="Boolean(message) || panoramaOnly"
              @click="showConstellationLines = !showConstellationLines">
              <span class="mode-dot" aria-hidden="true"></span>星座连线
            </button>
            <button v-if="view === 'earth-surface'" class="popover-item" type="button" role="switch"
              :aria-checked="showConstellationNames" :disabled="Boolean(message) || panoramaOnly"
              @click="showConstellationNames = !showConstellationNames">
              <span class="mode-dot" aria-hidden="true"></span>星座名称
            </button>
            <button v-if="view === 'earth-surface'" class="popover-item" type="button" role="switch"
              :aria-checked="showDeepSky" :disabled="Boolean(message) || panoramaOnly" @click="toggleDeepSky">
              <span class="mode-dot" aria-hidden="true"></span>深空天体
            </button>
            <button v-if="view === 'earth-surface'" class="popover-item" type="button"
              :disabled="Boolean(message)" @click="showNorthSky(); closePanel(true)">找北极星和北斗</button>
            <button class="popover-item" type="button" role="switch" :aria-checked="trueScale"
              :disabled="Boolean(message)" @click="toggleScale">
              <span class="mode-dot" aria-hidden="true"></span>真实比例
            </button>
            <button class="popover-item" type="button" :disabled="Boolean(message)"
              @click="resetView(); closePanel(true)">重置视角</button>
            <AppUpdate />
          </section>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.solar-system {
  position: relative;
  height: 100%;
  display: grid;
  grid-template-rows: minmax(180px, 1fr);
}

.surface {
  position: relative;
  overflow: hidden;
  background: radial-gradient(ellipse at center, var(--panel), var(--viewport) 72%);
}

.surface-night { background: #020307; }

canvas, .labels, .message {
  position: absolute;
  inset: 0;
}

canvas {
  width: 100%;
  height: 100%;
  touch-action: none;
  cursor: grab;
}

canvas:active { cursor: grabbing; }

.observation[data-red-light="true"] canvas {
  filter: grayscale(1) sepia(1) saturate(5) hue-rotate(315deg) brightness(0.55);
}

.labels { pointer-events: none; }
.hide-annotations .labels { visibility: hidden; }

.labels span {
  position: absolute;
  transform: translate(-50%, -100%);
  padding-bottom: 3px;
  white-space: nowrap;
  font-size: 12px;
  color: var(--text);
  text-shadow: 0 1px 4px var(--viewport), 0 0 4px var(--viewport);
}

.star-labels span {
  transform: translate(6px, -50%);
  padding-bottom: 0;
  color: var(--accent);
}

.star-labels .deep-sky-caption { color: #76e6cd; transform: translate(10px, -50%); }
.star-labels .constellation-caption { color: #a8c2ff; font-weight: 600; transform: translate(-50%, -50%); }
.deep-sky-marker {
  position: absolute;
  width: 10px;
  height: 10px;
  border: 1px solid #76e6cd;
  transform: translate(-50%, -50%);
}
.deep-sky-marker[data-kind="galaxy"] { width: 13px; height: 7px; border-radius: 50%; }
.deep-sky-marker[data-kind="cluster"] { border-style: dashed; border-radius: 50%; }
.deep-sky-marker[data-kind="other"] { transform: translate(-50%, -50%) rotate(45deg); }
.observation[data-red-light="true"] .deep-sky-marker { border-color: var(--accent); }
.observation[data-red-light="true"] .deep-sky-caption { color: var(--accent); }
.observation[data-red-light="true"] .constellation-caption { color: var(--accent); }

.message {
  display: grid;
  place-items: center;
  padding: 16px;
  color: var(--muted);
  text-align: center;
}

.view-bar {
  position: absolute;
  inset: auto auto 10px 14px;
  max-width: calc(100% - 28px);
  z-index: 1;
}

.view-controls {
  display: flex;
  flex-wrap: wrap;
  width: fit-content;
  max-width: 100%;
  gap: 6px;
  padding: 5px;
  border-radius: 28px;
}
.view-controls [aria-checked="true"] { border-color: var(--accent); }
.view-controls [aria-checked="true"] .mode-dot { background: var(--accent); }
.view-bar button { flex: none; }
.view-bar button:disabled { opacity: 0.5; cursor: default; }
.toolbar-group { position: relative; }
.toolbar-button[aria-expanded="true"] { border-color: var(--accent); }
.chevron {
  width: 7px;
  height: 7px;
  border: solid currentColor;
  border-width: 1px 1px 0 0;
  transform: translateY(2px) rotate(-45deg);
}

.panel-dismiss { position: absolute; inset: 0; background: rgb(0 0 0 / 22%); }
.toolbar-popover {
  position: absolute;
  bottom: calc(100% + 12px);
  left: 0;
  width: max-content;
  min-width: 152px;
  max-height: max(88px, calc(100dvh - 128px - env(safe-area-inset-top) - env(safe-area-inset-bottom)));
  overflow-y: auto;
  padding: 4px;
  border-radius: 20px;
}

.popover-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 44px;
  padding: 0 12px;
  border: 0;
  border-radius: 14px;
  background: transparent;
  color: var(--text);
  text-align: left;
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}
.popover-item[aria-pressed="true"] {
  background: var(--press-overlay);
  color: var(--accent);
}
@media (hover: hover) {
  .popover-item:hover:not(:disabled) {
    background: var(--glass-light);
    color: var(--accent);
  }
}
.popover-item[aria-pressed] { justify-content: space-between; }
.popover-item:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.toolbar-popover[aria-label="观测视角"] { max-height: min(55dvh, 420px); }

@media (max-width: 720px), (hover: none) and (pointer: coarse) {
  .solar-system { grid-template-rows: minmax(0, 1fr); }

  .view-bar {
    inset: auto max(8px, env(safe-area-inset-right)) calc(8px + env(safe-area-inset-bottom))
      max(8px, env(safe-area-inset-left));
    max-width: none;
  }

  .view-controls {
    display: grid;
    width: 100%;
    grid-template-columns: minmax(0, 1.45fr) minmax(0, 1.2fr) repeat(2, minmax(0, 1fr));
    gap: 4px;
  }

  .view-controls .mode-button {
    width: 100%;
    justify-content: center;
    white-space: nowrap;
    padding-inline: 4px;
    gap: 4px;
    font-size: 13px;
  }

  .settings-group .toolbar-popover { left: auto; right: 0; }
}
</style>

