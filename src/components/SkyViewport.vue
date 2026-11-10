<template>
  <div class="sky-viewport">
    <slot>
      <div class="viewport-placeholder">
        <svg class="reticle" viewBox="0 0 96 96" fill="none" aria-hidden="true">
          <circle cx="48" cy="48" r="35" />
          <circle cx="48" cy="48" r="22" stroke-dasharray="2 5" />
          <path d="M48 4v18m0 52v18M4 48h18m52 0h18" />
          <circle cx="48" cy="48" r="2" fill="currentColor" />
        </svg>
        <p>星图显示区</p>
      </div>
    </slot>
  </div>
</template>
