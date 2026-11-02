// UpdatedAtの時刻を見やすく表示する
export function formatDateTime(dateTime: string) {
  return new Date(dateTime).toLocaleString('ja-JP');
}

