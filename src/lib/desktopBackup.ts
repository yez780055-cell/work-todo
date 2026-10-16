export async function saveDesktopBackup(contents: string, fileName: string): Promise<boolean> {
  const { save } = await import('@tauri-apps/plugin-dialog')
  const path = await save({
    title: '保存 Work Todo 备份',
    defaultPath: fileName,
    filters: [{ name: 'JSON 备份', extensions: ['json'] }],
  })
  if (!path) return false
  const { writeTextFile } = await import('@tauri-apps/plugin-fs')
  await writeTextFile(path, contents)
  return true
}

export async function readDesktopBackup(): Promise<string | null> {
  const { open } = await import('@tauri-apps/plugin-dialog')
  const path = await open({
    title: '选择 Work Todo 备份',
    multiple: false,
    filters: [{ name: 'JSON 备份', extensions: ['json'] }],
  })
  if (!path || Array.isArray(path)) return null
  const { readTextFile } = await import('@tauri-apps/plugin-fs')
  return readTextFile(path)
}
