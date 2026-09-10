import { format, parseISO } from 'date-fns'

import { formatLogMessageOneLine } from 'contentful-batch-libs/dist/logging'

type DisplayLogItem = {
  ts: string
  level: string
  warning?: string
  error?: Error
  info?: string
}

// Keep this local while on batch-libs 9.x: its displayErrorLog is incompatible
// with this package's date-fns setup. Upgrading to batch-libs 13 is expected to
// remove this workaround; reuse its formatter to keep output consistent meanwhile.
export default function displayErrorLog (errorLog: DisplayLogItem[]) {
  if (errorLog.length) {
    const count = errorLog.reduce((count, curr) => {
      if (Object.prototype.hasOwnProperty.call(curr, 'warning')) {
        count.warnings++
      } else if (Object.prototype.hasOwnProperty.call(curr, 'error')) {
        count.errors++
      }
      return count
    }, { warnings: 0, errors: 0 })

    console.log(`\n\nThe following ${count.errors} errors and ${count.warnings} warnings occurred:\n`)
    errorLog
      .map((logMessage) => `${format(parseISO(logMessage.ts), 'HH:mm:ss')} - ${formatLogMessageOneLine(logMessage)}`)
      .map((logMessage) => console.log(logMessage))
    return
  }

  console.log('No errors or warnings occurred')
}
