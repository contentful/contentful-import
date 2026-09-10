import displayErrorLog from '../../../lib/utils/display-error-log'

describe('displayErrorLog', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('formats a warning without relying on the batch logger date-fns import', () => {
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation()

    expect(() => displayErrorLog([{
      ts: '2026-09-09T12:34:56.000Z',
      level: 'warning',
      warning: 'Optimization Variants may be duplicated'
    }])).not.toThrow()

    expect(consoleLogSpy).toHaveBeenNthCalledWith(1, expect.stringContaining('The following 0 errors and 1 warnings occurred:'))
    expect(consoleLogSpy).toHaveBeenNthCalledWith(2, expect.stringMatching(/\d{2}:\d{2}:\d{2} - Optimization Variants may be duplicated/))
  })
})
