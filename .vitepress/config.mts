import { defineConfig } from 'vitepress'
import sidebarZh from './book-sidebar.json'
import sidebarEn from './book-sidebar.en.json'
import settings from './book-settings.json'
import { common, readingTheme } from './site-shared.mts'

export default defineConfig({
  ...common,
  locales: {
    [settings.zhAtRoot ? 'root' : 'zh']: {
      label: '简体中文',
      lang: 'zh-CN',
      title: settings.title,
      link: settings.zhAtRoot ? '/' : '/zh/',
      themeConfig: readingTheme(sidebarZh, true),
    },
    en: {
      label: 'English',
      lang: 'en-US',
      title: settings.enTitle,
      link: '/en/',
      themeConfig: readingTheme(sidebarEn, false),
    },
  },
})
