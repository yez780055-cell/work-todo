import { describe, expect, it } from 'vitest'
import configuration from '../../src-tauri/tauri.conf.json?raw'

describe('Windows frontend drag support', () => {
  it('leaves HTML5 drag events to WebView2 instead of the native file-drop handler', () => {
    const config = JSON.parse(configuration)
    expect(config.app.windows.find((window: { label: string }) => window.label === 'main').dragDropEnabled).toBe(false)
  })
})
