// UpdatedAt 시간 보기좋게 표시
export function formatDateTime(dateTime: string) {
  return new Date(dateTime).toLocaleString('ja-JP');
}

