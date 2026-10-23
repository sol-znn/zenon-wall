const heightFmt = new Intl.NumberFormat('en-US')

export const height = (h: number) => heightFmt.format(h)

/** Base units to a decimal string without going through a float. */
export function units(amount: string | number, decimals: number): string {
  const raw = String(amount)
  const neg = raw.startsWith('-')
  const digits = (neg ? raw.slice(1) : raw).padStart(decimals + 1, '0')
  const whole = digits.slice(0, digits.length - decimals)
  const frac = decimals > 0 ? '.' + digits.slice(-decimals) : ''
  return (neg ? '-' : '') + whole + frac
}

/**
 * Base units for display: exact, grouped, and with no trailing zeros
 * (`1,204.5`, `1`), which the owner prefers over dimmed zeros.
 */
export function amountText(amount: string | number, decimals: number): string {
  const [whole, frac = ''] = units(amount, decimals).split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const significant = frac.replace(/0+$/, '')
  return significant ? `${grouped}.${significant}` : grouped
}

export function relative(iso: string, now = Date.now()): string {
  const s = Math.round((now - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  const units: [number, string][] = [
    [60, 'minute'],
    [3600, 'hour'],
    [86400, 'day'],
    [2592000, 'month'],
    [31536000, 'year'],
  ]
  let [div, name] = units[0]
  for (const u of units) if (s >= u[0]) [div, name] = u
  const n = Math.floor(s / div)
  return `${n} ${name}${n === 1 ? '' : 's'} ago`
}
