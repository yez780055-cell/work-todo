import type { IndexColumn, WorkspaceData } from './model'
import { sanitizeRichText } from './richText'

export function updateIndexWorkspace(current: WorkspaceData, columns: IndexColumn[]): WorkspaceData {
  const previousById = new Map(current.indexColumns.map((column) => [column.id, column]))
  const indexColumns = columns.map((column) => {
    const previous = previousById.get(column.id)
    return previous && previous.html === column.html
      ? column
      : { ...column, html: sanitizeRichText(column.html) }
  })
  const firstColumn = indexColumns[0]
  return {
    ...current,
    indexColumns,
    indexDocument: { html: firstColumn.html, updatedAt: firstColumn.updatedAt },
  }
}

export function sanitizeImportedIndexWorkspace(workspace: WorkspaceData): WorkspaceData {
  const indexColumns = workspace.indexColumns.map((column) => ({ ...column, html: sanitizeRichText(column.html) }))
  const firstColumn = indexColumns[0]
  return {
    ...workspace,
    indexColumns,
    indexDocument: { html: firstColumn.html, updatedAt: firstColumn.updatedAt },
  }
}
