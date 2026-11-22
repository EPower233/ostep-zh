<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useData, useRoute, useRouter, withBase } from 'vitepress'
import Teek, { TkArticleCodeBlock } from 'vitepress-theme-teek'
import bilingualMapRaw from '../bilingual-map.json'
import settings from '../book-settings.json'
import { initBilingualSync, type NamedLandmark } from './syncScroll'

interface BilingualMap {
  zhToEn?: Record<string, string>
  enToZh?: Record<string, string>
  zh_to_en?: Record<string, string>
  en_to_zh?: Record<string, string>
  landmarks?: Record<string, NamedLandmark[]>
}

const bilingualMap = bilingualMapRaw as BilingualMap
const route = useRoute()
const router = useRouter()
const { site } = useData()
const storageKey = site.value.base + ':bilingual-split'

const splitEnabled = ref(false)
const peerHtml = ref('')
const peerLoading = ref(false)
const peerError = ref('')
const peerPaneRef = ref<HTMLElement | null>(null)
const wideEnough = ref(false)

let cleanupSync: (() => void) | null = null
let peerRequest: AbortController | null = null
let media: MediaQueryList | null = null

function encodeRoute(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
}

// Page data is relative to the source root, independent of the deployed base.
const currentArticle = computed(() =>
  '/' + route.data.relativePath.replace(/(?:(^|\/)index)?\.md$/, '$1'),
)
const isEnglish = computed(() => currentArticle.value.startsWith('/en/'))

const pairedRoute = computed<string | null>(() => {
  const cur = currentArticle.value
  const peers = isEnglish.value
    ? bilingualMap.enToZh ?? bilingualMap.en_to_zh
    : bilingualMap.zhToEn ?? bilingualMap.zh_to_en
  const peer = peers?.[cur] ?? peers?.[cur.replace(/\/$/, '')]
  if (peer === '/en' || peer === '/zh') return peer + '/'
  return peer ?? null
})

const canPair = computed(() => Boolean(pairedRoute.value))
const canSplit = computed(() => settings.split && canPair.value && wideEnough.value)
const activeSplit = computed(() => splitEnabled.value && canSplit.value)

function goToLocale(target: 'zh' | 'en') {
  if (target === 'zh' && (isEnglish.value || currentArticle.value === '/')) {
    splitEnabled.value = false
    const dest = pairedRoute.value || (settings.zhAtRoot ? '/' : '/zh/')
    router.go(withBase(encodeRoute(dest)))
  } else if (target === 'en' && !isEnglish.value) {
    splitEnabled.value = false
    const dest = pairedRoute.value || '/en/'
    router.go(withBase(encodeRoute(dest)))
  } else {
    splitEnabled.value = false
  }
}

function toggleSplit() {
  if (!canSplit.value) return
  splitEnabled.value = !splitEnabled.value
}

function rewriteRelativeUrls(container: HTMLElement, articleUrl: string) {
  const baseUrl = new URL(articleUrl, window.location.origin)
  for (const img of container.querySelectorAll<HTMLImageElement>('img[src]')) {
    const src = img.getAttribute('src')
    if (!src || /^(?:[a-z][a-z\d+.-]*:|\/)/i.test(src)) continue
    const resolved = new URL(src, baseUrl)
    img.setAttribute('src', resolved.pathname + resolved.search + resolved.hash)
  }
  for (const a of container.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const href = a.getAttribute('href')
    if (!href || /^(?:[a-z][a-z\d+.-]*:|\/)/i.test(href)) continue
    const resolved = new URL(href, baseUrl)
    a.setAttribute('href', resolved.pathname + resolved.search + resolved.hash)
  }
}

async function loadPeerAndBind() {
  peerRequest?.abort()
  peerRequest = null
  cleanupSync?.()
  cleanupSync = null
  peerHtml.value = ''
  peerError.value = ''
  peerLoading.value = false

  const peerRoute = pairedRoute.value
  const active = activeSplit.value
  document.documentElement.classList.toggle('bilingual-split', active)
  document.documentElement.classList.toggle('bilingual-en-primary', active && isEnglish.value)

  if (!active || !peerRoute) return

  const request = new AbortController()
  peerRequest = request
  peerLoading.value = true
  try {
    const htmlPath = peerRoute.endsWith('/') ? peerRoute + 'index.html' : peerRoute + '.html'
    const targetUrl = withBase(encodeRoute(htmlPath))
    const res = await fetch(targetUrl, { signal: request.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const html = await res.text()
    if (request.signal.aborted) return
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const vpDoc = doc.querySelector('.vp-doc')
    if (!vpDoc) throw new Error('Paired .vp-doc not found')
    const peerArticleUrl = res.url || targetUrl
    rewriteRelativeUrls(vpDoc as HTMLElement, peerArticleUrl)
    peerHtml.value = vpDoc.innerHTML
    peerLoading.value = false
    await nextTick()
    if (request.signal.aborted) return
    const primaryPane = document.querySelector<HTMLElement>('.VPDoc .content-container .main .vp-doc')
    const peerPane = peerPaneRef.value
    if (primaryPane && peerPane) {
      const primaryUrl = withBase(encodeRoute(currentArticle.value))
      const zhRoute = isEnglish.value ? peerRoute : currentArticle.value
      const landmarks = bilingualMap.landmarks?.[zhRoute] ?? []
      cleanupSync = isEnglish.value
        ? initBilingualSync(peerPane, primaryPane, peerArticleUrl, primaryUrl, landmarks, 'right')
        : initBilingualSync(primaryPane, peerPane, primaryUrl, peerArticleUrl, landmarks, 'left')
    }
  } catch (err) {
    if (!request.signal.aborted) peerError.value = err instanceof Error ? err.message : String(err)
  } finally {
    if (peerRequest === request) {
      peerRequest = null
      peerLoading.value = false
    }
  }
}

watch([() => route.path, activeSplit, splitEnabled], () => {
  if (typeof window === 'undefined') return
  localStorage.setItem(storageKey, splitEnabled.value ? '1' : '0')
  loadPeerAndBind()
}, { flush: 'post' })

function refreshViewport() {
  wideEnough.value = Boolean(media?.matches)
}

onMounted(() => {
  media = window.matchMedia('(min-width: 1280px)')
  refreshViewport()
  media.addEventListener('change', refreshViewport)
  if (localStorage.getItem(storageKey) === '1' && settings.split) splitEnabled.value = true
})

onBeforeUnmount(() => {
  peerRequest?.abort()
  cleanupSync?.()
  media?.removeEventListener('change', refreshViewport)
  if (typeof document !== 'undefined') {
    document.documentElement.classList.remove('bilingual-split', 'bilingual-en-primary')
  }
})
</script>

<template>
  <Teek.Layout>
    <template #nav-bar-content-after>
      <div class="bilingual-switcher" role="group" aria-label="Language mode">
        <button
          type="button"
          class="bilingual-btn"
          :class="{ active: !activeSplit && !isEnglish }"
          @click="goToLocale('zh')"
        >
          中文
        </button>
        <button
          type="button"
          class="bilingual-btn"
          :class="{ active: !activeSplit && isEnglish }"
          @click="goToLocale('en')"
        >
          English
        </button>
        <button
          v-if="canSplit"
          type="button"
          class="bilingual-btn bilingual-btn-split"
          :class="{ active: activeSplit }"
          @click="toggleSplit"
        >
          中英对照
        </button>
      </div>
    </template>

    <template #doc-after>
      <div
        v-if="activeSplit"
        ref="peerPaneRef"
        class="bilingual-peer-pane vp-doc"
        :lang="isEnglish ? 'zh-CN' : 'en-US'"
        :aria-label="isEnglish ? 'Chinese Edition' : 'English Edition'"
      >
        <div v-if="peerLoading" class="bilingual-peer-status">Loading paired edition…</div>
        <div v-else-if="peerError" class="bilingual-peer-status">
          Failed to load paired edition ({{ peerError }}). Split view works best on built preview (`npm run build && npm run preview`) or deployed site.
        </div>
        <div v-else v-html="peerHtml" />
        <!-- Teek's initial document scan runs before the second article arrives. -->
        <TkArticleCodeBlock v-if="peerHtml && !peerLoading" />
      </div>
    </template>
  </Teek.Layout>
</template>
