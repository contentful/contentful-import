import { logEmitter } from 'contentful-batch-libs/dist/logging'
import { sortOrReport } from '../../../lib/utils/sort-or-report'

test('returns the sort result unchanged when the sort function succeeds', () => {
  const result = sortOrReport(() => [3, 1, 2])
  expect(result).toEqual([3, 1, 2])
})

test('logs the error via logEmitter and rethrows when the sort function throws', () => {
  const sortError = new Error('malformed data')
  const emitSpy = jest.spyOn(logEmitter, 'emit').mockImplementation(() => true)

  expect(() => sortOrReport(() => {
    throw sortError
  })).toThrow(sortError)

  expect(emitSpy).toHaveBeenCalledWith('error', sortError)
  emitSpy.mockRestore()
})
