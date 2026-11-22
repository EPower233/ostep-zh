import Teek from 'vitepress-theme-teek'
import 'vitepress-theme-teek/theme-chalk/index.css'
import './custom.css'
import './bilingual.css'
import BilingualLayout from './BilingualLayout.vue'

export default {
  extends: Teek,
  Layout: BilingualLayout,
}
