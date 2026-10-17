import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const config = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8')) as {
  app: { windows: unknown[]; security: { csp: Record<string, string>; devCsp: Record<string, string> } }
}

describe('Tauri content security policy', () => {
  it('keeps a production policy local and limits unsafe evaluation to the local dev server', () => {
    const { csp, devCsp } = config.app.security
    expect(csp['default-src']).toBe("'self'")
    expect(csp['connect-src']).toContain('ipc:')
    expect(csp['connect-src']).toContain('http://ipc.localhost')
    expect(csp['script-src']).toBe("'self'")
    expect(csp['script-src']).not.toContain('unsafe-eval')
    expect(Object.values(csp).join(' ')).not.toContain('*')
    expect(devCsp['script-src']).toContain('http://127.0.0.1:1420')
    expect(devCsp['script-src']).toContain('unsafe-eval')
    expect(devCsp['connect-src']).toContain('ws://127.0.0.1:1420')
    expect(Object.values(devCsp).join(' ')).not.toContain('https://')
  })

  it('preserves the configured Tauri window while adding security policy', () => {
    expect(config.app.windows).toHaveLength(1)
  })
})
