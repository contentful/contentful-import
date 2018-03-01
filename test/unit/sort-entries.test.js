import sortEntries from '../../lib/utils/sort-entries'

const entries = [
  {
    sys: {id: 'abc'},
    fields: {}
  },
  {
    sys: {id: '123'},
    fields: {
      links: [
        {
          sys: {
            type: 'Link',
            linkType: 'Entry',
            id: '456'
          }
        }
      ]
    }
  },
  {
    sys: {id: '456'},
    fields: {}
  },
  {
    sys: {id: '789'},
    fields: {}
  }
]

test('Sorts entries by link order', () => {
  const sortedEntries = sortEntries(entries)
  expect(sortedEntries[0].sys.id).toBe('abc')
  expect(sortedEntries[1].sys.id).toBe('456')
  expect(sortedEntries[2].sys.id).toBe('789')
  expect(sortedEntries[3].sys.id).toBe('123')
  expect(sortedEntries).toHaveLength(4)
})

const complexEntries = [
  {
    'sys': {
      'id': 'FJlJfypzaewiwyukGi2kI'
    },
    'fields': {}
  },
  {
    'sys': {
      'id': '5JQ715oDQW68k8EiEuKOk8'
    },
    'fields': {
      'createdEntries': {
        'en-US': [
          {
            'sys': {
              'type': 'Link',
              'linkType': 'Entry',
              'id': 'A96usFSlY4G0W4kwAqswk'
            }
          }
        ]
      }
    }
  },
  {
    'sys': {
      'id': '6EczfGnuHCIYGGwEwIqiq2'
    },
    'fields': {
      'profilePhoto': {
        'en-US': {
          'sys': {
            'type': 'Link',
            'linkType': 'Asset',
            'id': '2ReMHJhXoAcy4AyamgsgwQ'
          }
        }
      },
      'createdEntries': {
        'en-US': [
          {
            'sys': {
              'type': 'Link',
              'linkType': 'Entry',
              'id': '1asN98Ph3mUiCYIYiiqwko'
            }
          }
        ]
      }
    }
  },
  {
    'sys': {
      'id': '1asN98Ph3mUiCYIYiiqwko'
    },
    'fields': {
      /*
      Circular dependencies are not supported yet.
       'author': {
        'en-US': [
          {
            'sys': {
              'type': 'Link',
              'linkType': 'Entry',
              'id': '6EczfGnuHCIYGGwEwIqiq2'
            }
          }
        ]
      },
      */
      'category': {
        'en-US': [
          {
            'sys': {
              'type': 'Link',
              'linkType': 'Entry',
              'id': '6XL7nwqRZ6yEw0cUe4y0y6'
            }
          },
          {
            'sys': {
              'type': 'Link',
              'linkType': 'Entry',
              'id': 'FJlJfypzaewiwyukGi2kI'
            }
          }
        ]
      },
      'featuredImage': {
        'en-US': {
          'sys': {
            'type': 'Link',
            'linkType': 'Asset',
            'id': 'bXvdSYHB3Guy2uUmuEco8'
          }
        }
      }
    }
  },
  {
    'sys': {
      'id': '6XL7nwqRZ6yEw0cUe4y0y6'
    },
    'fields': {
      'icon': {
        'en-US': {
          'sys': {
            'type': 'Link',
            'linkType': 'Asset',
            'id': '5Q6yYElPe8w8AEsKeki4M4'
          }
        }
      }
    }
  },
  {
    'sys': {
      'id': 'A96usFSlY4G0W4kwAqswk'
    },
    'fields': {
      /*
      Circular dependencies are not supported yet.
      'author': {
        'en-US': [
          {
            'sys': {
              'type': 'Link',
              'linkType': 'Entry',
              'id': '5JQ715oDQW68k8EiEuKOk8'
            }
          }
        ]
      },
      */
      'category': {
        'en-US': [
          {
            'sys': {
              'type': 'Link',
              'linkType': 'Entry',
              'id': '6XL7nwqRZ6yEw0cUe4y0y6'
            }
          }
        ]
      }
    }
  }
]

test('Sorts complex entries by link order', () => {
  const sortedEntries = sortEntries(complexEntries)
  expect(
    findEntityIndex(sortedEntries, '5JQ715oDQW68k8EiEuKOk8') > findEntityIndex(sortedEntries, 'A96usFSlY4G0W4kwAqswk')
  ).toBeTruthy()
  expect(
    findEntityIndex(sortedEntries, '6EczfGnuHCIYGGwEwIqiq2') > findEntityIndex(sortedEntries, '1asN98Ph3mUiCYIYiiqwko')
  ).toBeTruthy()
  expect(
    findEntityIndex(sortedEntries, '1asN98Ph3mUiCYIYiiqwko') > findEntityIndex(sortedEntries, '6XL7nwqRZ6yEw0cUe4y0y6')
  ).toBeTruthy()
  expect(
    findEntityIndex(sortedEntries, '1asN98Ph3mUiCYIYiiqwko') > findEntityIndex(sortedEntries, 'FJlJfypzaewiwyukGi2kI')
  ).toBeTruthy()
  expect(
    findEntityIndex(sortedEntries, 'A96usFSlY4G0W4kwAqswk') > findEntityIndex(sortedEntries, '6XL7nwqRZ6yEw0cUe4y0y6')
  ).toBeTruthy()
})

function findEntityIndex (entities, id) {
  return entities.findIndex((entity) => entity.sys.id === id)
}
