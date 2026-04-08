export function getSemanticStatusLabel(status?: string | null) {
  switch ((status || '').toLowerCase()) {
    case 'draft':
      return '草稿'
    case 'active':
      return '活跃'
    case 'archived':
      return '归档'
    case 'deprecated':
      return '弃用'
    default:
      return status || '未知'
  }
}
