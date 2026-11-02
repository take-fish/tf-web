/** 把秒数格式化成 00:14:32，界面上不出现任何「计时」类玩法词汇。 */
export function formatElapsed(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
}
