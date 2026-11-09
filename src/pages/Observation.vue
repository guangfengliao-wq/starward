<script setup lang="ts">
import { ref } from 'vue'
import SkyViewport from '../components/SkyViewport.vue'
import SolarSystem from '../components/SolarSystem.vue'
import messierLicenseUrl from '../assets/messier-LICENSE.txt?url'

declare const __APP_VERSION__: string
const version = __APP_VERSION__
const redLight = ref(false)
</script>

<template>
  <main class="observation" :data-red-light="redLight">
    <header class="app-header">
      <div class="app-brand">
        <div class="wordmark" lang="en">STARWARD</div>
        <h1>繁星</h1>
      </div>
      <div class="header-actions">
        <button class="mode-button" type="button" :aria-pressed="redLight" @click="redLight = !redLight">
          <span class="mode-dot" aria-hidden="true"></span>
          红光模式
        </button>
        <details class="texture-credits">
          <summary class="mode-button" aria-label="关于与素材来源" title="关于与素材来源">ⓘ</summary>
          <div class="credits-popover">
            <p>太阳、行星、土星环和银河背景贴图来自
              <a href="https://www.solarsystemscope.com/textures/" target="_blank" rel="noopener noreferrer">Solar System Scope / INOVE</a>，
              使用 <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a> 许可。
              原图随应用打包，土星环按半径映射。行星外观为观测数据加工后的示意。
            </p>
            <p>恒星数据来自 ESA Hipparcos 星表，使用
              <a href="https://github.com/gmiller123456/hip2000" target="_blank" rel="noopener noreferrer">Greg Miller 整理的 J2000 亮星子集</a>。
            </p>
            <p>恒星专名通过
              <a href="https://github.com/cyschneck/iau-star-names" target="_blank" rel="noopener noreferrer">IAU 专名与 HIP 编号对照表</a>
              匹配，常见中文名采用项目内的对照表。
            </p>
            <p>梅西耶坐标和分类来自 Diego Hernangómez 的
              <a href="https://dieghernan.github.io/celestial_data/datasets/messier/" target="_blank" rel="noopener noreferrer">Celestial Data</a>，
              基于 Olaf Frohn 的 d3-celestial，采用
              <a :href="messierLicenseUrl" download="messier-LICENSE.txt">BSD 3-Clause 许可</a>。
            </p>
          </div>
        </details>
      </div>
    </header>

    <section class="observation-panel" aria-labelledby="observation-title">
      <div class="panel-header">
        <h2 id="observation-title">太阳系</h2>
        <span class="status">三维示意</span>
      </div>
      <SkyViewport>
        <SolarSystem />
      </SkyViewport>
      <footer class="app-version">
        <span>v{{ version }}</span>
      </footer>
    </section>
  </main>
</template>
