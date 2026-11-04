// توليد أيقونات PWA من icon.svg باستخدام المتصفح
import { createRequire } from 'node:module'
const { chromium } = createRequire(import.meta.url)('playwright')
import { readFileSync } from 'node:fs'
const svg = readFileSync('public/icons/icon.svg', 'utf8')
const b = await chromium.launch()
const p = await b.newPage()
const shot = async (size, file, pad = 0, bg = 'transparent') => {
  await p.setViewportSize({ width: size, height: size })
  await p.setContent(`<html><body style="margin:0;background:${bg};display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px">${svg.replace('<svg', `<svg width="${size - pad * 2}" height="${size - pad * 2}"`)}</body></html>`)
  await p.screenshot({ path: `public/icons/${file}`, omitBackground: bg === 'transparent' })
}
await shot(192, 'icon-192.png')
await shot(512, 'icon-512.png')
await shot(512, 'icon-maskable-512.png', 70, '#13233f')
await shot(180, 'apple-touch-icon.png', 0, '#13233f')
await b.close()
console.log('icons done')
