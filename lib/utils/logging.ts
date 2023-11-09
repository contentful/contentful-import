import { LogMessage } from 'contentful-batch-libs'

type ErrorMessage = Extract<LogMessage, { level: 'error' }>

export function isErrorLog (log: LogMessage): log is ErrorMessage {
  return log.level !== 'info' && log.level !== 'warning'
}

export function isDisplayLog (log: LogMessage): boolean {
  return log.level !== 'info'
}
