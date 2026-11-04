// نسخة 404.html لدعم الروابط المباشرة على GitHub Pages
import { copyFileSync } from 'node:fs'
copyFileSync('dist/index.html', 'dist/404.html')
console.log('postbuild: 404.html ready')
